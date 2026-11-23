import {
  escapeHtml,
  displayLabel,
  formatCad,
  layoutFundingNetwork,
  renderFundingNetwork,
  renderNetworkTable,
  renderRecipientFocus,
} from './network.mjs';
import { renderProfilePage } from './renderers.mjs';

const elements = {
  canvas: document.querySelector('#network-canvas'),
  shell: document.querySelector('.network-shell'),
  tooltip: document.querySelector('#network-tooltip'),
  table: document.querySelector('#network-table'),
  search: document.querySelector('#recipient-search'),
  typeFilter: document.querySelector('#recipient-type-filter'),
  results: document.querySelector('#search-results'),
  count: document.querySelector('#recipient-count'),
  profilePanel: document.querySelector('#profile-panel'),
  profile: document.querySelector('#profile-content'),
  status: document.querySelector('#network-status'),
};

let pointer;
let contract;
let layout;
let releaseBase;
let loadingPromise;
let pinnedRecipientId = null;
let focusRequestId = 0;
let hoverTimer = null;
const payeeCache = new Map();
const optionalCache = new Map();

async function fetchJson(path) {
  const target = /^(?:https?:)?\/\//.test(path)
    ? path
    : new URL(path.replace(/^\//, ''), `${window.location.origin}${siteRootPath()}`).href;
  const response = await fetch(target);
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json();
}

function directoryOf(path) {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

function announce(message) {
  elements.status.textContent = message;
}

function siteRootPath() {
  const marker = '/recipient/';
  const path = window.location.pathname;
  const markerIndex = path.indexOf(marker);
  if (markerIndex >= 0) return path.slice(0, markerIndex + 1);
  if (path.endsWith('/')) return path;
  return path.slice(0, path.lastIndexOf('/') + 1);
}

function recipientIdFromLocation() {
  const queryRecipient = new URL(window.location.href).searchParams.get('recipient');
  if (queryRecipient) return queryRecipient;
  if (document.body.dataset.recipientId) return document.body.dataset.recipientId;
  const match = window.location.pathname.match(/\/recipient\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function updateUrl(recipientId) {
  const path = recipientId
    ? `${siteRootPath()}recipient/${encodeURIComponent(recipientId)}/`
    : siteRootPath();
  window.history.pushState({ recipient: recipientId }, '', path);
}

async function loadOptional(path) {
  if (!path) return null;
  if (!optionalCache.has(path)) optionalCache.set(path, fetchJson(`${releaseBase}${path}`));
  return optionalCache.get(path);
}

async function loadPayee(recipient) {
  if (!payeeCache.has(recipient.recipient_id)) {
    payeeCache.set(recipient.recipient_id, fetchJson(`${releaseBase}${recipient.path}`));
  }
  return payeeCache.get(recipient.recipient_id);
}

function renderOutflows(intermediary) {
  if (!intermediary?.groups?.length) return '';
  return `<div class="network-tooltip__outflows"><h4>Reported intermediary outflows</h4><p>Shown separately from the published-payment total above.</p><ul>${intermediary.groups.map((group) => `<li><span>${escapeHtml(group.group_label)}</span><strong>${formatCad(group.amount_cad)}</strong></li>`).join('')}</ul></div>`;
}

function setActiveNode(recipientId) {
  for (const node of elements.canvas.querySelectorAll('[data-visual-recipient-id]')) {
    node.classList.toggle('is-active', node.dataset.visualRecipientId === recipientId);
    node.classList.toggle('is-muted', Boolean(recipientId) && node.dataset.visualRecipientId !== recipientId);
  }
}

function clearFocus({ force = false } = {}) {
  if (pinnedRecipientId && !force) return;
  const activeRoutes = elements.canvas.querySelector('#active-routes');
  if (activeRoutes) activeRoutes.innerHTML = '';
  setActiveNode(null);
  elements.tooltip.hidden = true;
  elements.tooltip.innerHTML = '';
}

function closeRecipientFocus({ updateHistory = true } = {}) {
  focusRequestId += 1;
  pinnedRecipientId = null;
  clearTimeout(hoverTimer);
  clearFocus({ force: true });
  if (updateHistory) updateUrl(null);
  announce('Recipient details closed.');
}

async function focusRecipient(recipientId, { pin = false, history = false } = {}) {
  if (!layout) return;
  const recipient = layout.recipientById.get(recipientId);
  if (!recipient) return;
  const requestId = ++focusRequestId;
  if (pin) pinnedRecipientId = recipientId;
  const payload = await loadPayee(recipient);
  const intermediary = await loadOptional(payload.intermediary_path);
  if (requestId !== focusRequestId) return;
  const focused = renderRecipientFocus(layout, payload);
  const activeRoutes = elements.canvas.querySelector('#active-routes');
  if (activeRoutes) activeRoutes.innerHTML = focused.routes;
  setActiveNode(focused.visualRecipientId);
  elements.tooltip.innerHTML = `${focused.tooltip}${renderOutflows(intermediary)}`;
  elements.tooltip.hidden = false;
  elements.tooltip.dataset.recipientId = recipientId;
  if (history) updateUrl(recipientId);
  announce(`${recipient.label}, ${formatCad(recipient.amount_cad)}, with ${payload.incoming_routes.length} published routes.`);
}

async function openProfile() {
  if (!pinnedRecipientId) return;
  const recipient = layout.recipientById.get(pinnedRecipientId);
  const payload = await loadPayee(recipient);
  const profile = await loadOptional(payload.profile_path);
  elements.profile.innerHTML = renderProfilePage(
    profile,
    payload.evidence_stops?.[0]?.state ?? 'No published amounts',
  );
  elements.profilePanel.hidden = false;
  elements.profilePanel.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function searchRecipients(query) {
  const needle = query.trim().toLocaleLowerCase('en-CA');
  if (!needle) return [];
  const selectedType = elements.typeFilter.value;
  return contract.recipients
    .filter((row) => row.label.toLocaleLowerCase('en-CA').includes(needle) && (!selectedType || row.payee_type === selectedType))
    .slice(0, 12);
}

function renderSearchResults() {
  const matches = searchRecipients(elements.search.value);
  elements.results.hidden = !elements.search.value.trim();
  if (!elements.search.value.trim()) {
    elements.results.innerHTML = '';
    return;
  }
  elements.results.innerHTML = matches.length
    ? matches.map((row) => `<button type="button" data-search-recipient="${escapeHtml(row.recipient_id)}"><span>${escapeHtml(displayLabel(row.label))}<small>${escapeHtml(row.payee_type)}</small></span><strong>${formatCad(row.amount_cad)}</strong></button>`).join('')
    : '<p>No named recipient matches that search.</p>';
}

function bindNetworkEvents() {
  elements.canvas.addEventListener('pointerover', (event) => {
    const node = event.target.closest('[data-recipient-id]');
    if (node && !pinnedRecipientId) {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => focusRecipient(node.dataset.recipientId), 80);
    }
  });
  elements.canvas.addEventListener('pointerout', (event) => {
    if (!event.target.closest('[data-recipient-id]')) return;
    clearTimeout(hoverTimer);
    if (!pinnedRecipientId) {
      focusRequestId += 1;
      clearFocus();
    }
  });
  elements.canvas.addEventListener('focusin', (event) => {
    const node = event.target.closest('[data-recipient-id]');
    if (node) focusRecipient(node.dataset.recipientId);
  });
  elements.canvas.addEventListener('click', (event) => {
    const node = event.target.closest('[data-recipient-id]');
    if (node) focusRecipient(node.dataset.recipientId, { pin: true, history: true });
  });
  elements.canvas.addEventListener('keydown', (event) => {
    const node = event.target.closest('[data-recipient-id]');
    if (node && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      focusRecipient(node.dataset.recipientId, { pin: true, history: true });
    }
    if (event.key === 'Escape') {
      closeRecipientFocus();
    }
  });
  elements.search.addEventListener('input', renderSearchResults);
  elements.typeFilter.addEventListener('change', () => {
    const selected = elements.typeFilter.value;
    for (const node of elements.canvas.querySelectorAll('[data-payee-type]')) {
      node.classList.toggle('is-filtered', Boolean(selected) && node.dataset.payeeType !== selected);
    }
    renderSearchResults();
  });
  elements.results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-search-recipient]');
    if (!button) return;
    const id = button.dataset.searchRecipient;
    elements.results.hidden = true;
    elements.search.value = layout.recipientById.get(id)?.label ?? elements.search.value;
    elements.canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });
    focusRecipient(id, { pin: true, history: true });
  });
  elements.tooltip.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-tooltip]')) closeRecipientFocus();
    if (event.target.closest('[data-open-profile]')) openProfile();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!pinnedRecipientId) return;
    if (event.target.closest('#network-tooltip,[data-recipient-id],#search-results,.network-search')) return;
    closeRecipientFocus();
  });
}

async function loadNetwork() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    pointer = await fetchJson('data/current.json');
    releaseBase = directoryOf(pointer.flow_v2.network_path);
    contract = await fetchJson(pointer.flow_v2.network_path);
    layout = layoutFundingNetwork(contract);
    elements.count.textContent = `${contract.named_recipient_count.toLocaleString('en-CA')} named recipients`;
    for (const type of [...new Set(contract.recipients.map((row) => row.payee_type))].sort()) {
      elements.typeFilter.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`);
    }
    elements.canvas.innerHTML = renderFundingNetwork(layout, contract);
    elements.table.innerHTML = renderNetworkTable(contract);
    elements.shell.setAttribute('aria-busy', 'false');
    bindNetworkEvents();
    const initialRecipient = recipientIdFromLocation();
    if (initialRecipient && layout.recipientById.has(initialRecipient)) {
      pinnedRecipientId = initialRecipient;
      await focusRecipient(initialRecipient, { pin: true });
    }
  })().catch((error) => {
    console.error(error);
    elements.shell.setAttribute('aria-busy', 'false');
    elements.canvas.innerHTML = `<p class="network-error">The published payment network could not be loaded. ${escapeHtml(error.message)}</p>`;
  });
  return loadingPromise;
}

document.querySelector('[data-close-profile]').addEventListener('click', () => {
  elements.profilePanel.hidden = true;
});
window.addEventListener('popstate', async () => {
  await loadNetwork();
  const id = recipientIdFromLocation();
  pinnedRecipientId = id;
  if (id) focusRecipient(id, { pin: true });
  else clearFocus({ force: true });
});

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadNetwork();
      observer.disconnect();
    }
  }, { rootMargin: '500px' });
  observer.observe(document.querySelector('#page-network'));
} else {
  loadNetwork();
}
