import {
  buildConcentration,
  displayLabel,
  escapeHtml,
  formatBillions,
  formatCad,
  formatMillions,
  groupCategories,
  layoutGlobe,
  renderAnswerCard,
  renderGlobe,
  renderSelectionOverlay,
} from './visual.mjs';
import { renderProfilePage } from '../renderers.mjs';

const elements = {
  globe: document.querySelector('#globe'), flat: document.querySelector('#flat-view'), stage: document.querySelector('#visual-stage'),
  search: document.querySelector('#recipient-search'), results: document.querySelector('#search-results'), reset: document.querySelector('#reset-view'),
  flatten: document.querySelector('#flatten-view'), method: document.querySelector('#method-dialog'), answer: document.querySelector('#answer-card'),
  comparison: document.querySelector('#comparison-card'), concentration: document.querySelector('#concentration-chart'), purposes: document.querySelector('#purpose-list'),
  structured: document.querySelector('#structured-view'), status: document.querySelector('#status'), profilePanel: document.querySelector('#profile-panel'),
  profile: document.querySelector('#profile-content'), story: document.querySelector('#story-note'),
};

let contract;
let layout;
let releaseBase;
let selectedId = null;
let compareId = null;
let compareMode = false;
let flattened = false;
const payloadCache = new Map();
const optionalCache = new Map();
const DEFAULT_RECIPIENT = 'organization_26f068b2dd1bf421';

function rootUrl(path) { return new URL(`../${path.replace(/^\//, '')}`, import.meta.url).href; }
async function fetchJson(path) { const response = await fetch(path); if (!response.ok) throw new Error(`Could not load ${path}`); return response.json(); }
function announce(message) { elements.status.textContent = message; }
function directoryOf(path) { return path.slice(0, path.lastIndexOf('/') + 1); }

async function loadPayload(recipientId) {
  if (!payloadCache.has(recipientId)) {
    const recipient = contract.recipients.find((row) => row.recipient_id === recipientId);
    if (!recipient) throw new Error('Recipient was not found.');
    payloadCache.set(recipientId, fetchJson(rootUrl(`${releaseBase}${recipient.path}`)));
  }
  return payloadCache.get(recipientId);
}

async function loadOptional(path) {
  if (!path) return null;
  if (!optionalCache.has(path)) optionalCache.set(path, fetchJson(rootUrl(`${releaseBase}${path}`)));
  return optionalCache.get(path);
}

function updateHash() {
  const params = new URLSearchParams();
  if (selectedId) params.set('r', selectedId);
  if (compareId) params.set('compare', compareId);
  history.replaceState({ selectedId, compareId }, '', `${location.pathname}${params.size ? `#${params}` : ''}`);
}

function renderConcentration() {
  const total = Number(contract.positive_published_payments_cad);
  const rows = buildConcentration(contract);
  const bar = rows.map((row) => `<span class="concentration-segment concentration-segment--${row.id}" style="width:${(row.amount / total * 100).toFixed(4)}%"><b>${(row.amount / total * 100).toFixed(1)}%</b></span>`).join('');
  const legend = rows.map((row) => `<li><i class="concentration-chip concentration-chip--${row.id}"></i><span>${escapeHtml(displayLabel(row.label))}${row.count ? ` · ${row.count.toLocaleString('en-CA')}` : ''}</span><strong title="${escapeHtml(formatCad(row.amount, { exact: true }))}">${formatBillions(row.amount)} · ${(row.amount / total * 100).toFixed(1)}%</strong></li>`).join('');
  elements.concentration.innerHTML = `<div class="concentration-bar" aria-label="Share of all positive published payments">${bar}</div><ul>${legend}</ul><p>The first three segments are named recipients. The hatched fourth segment is money published only in aggregate, not a hidden group of 2,056 recipients.</p>`;
}

function renderPurposeList() {
  const total = Number(contract.positive_published_payments_cad);
  const programsByCategory = new Map();
  for (const program of contract.programs) {
    const rows = programsByCategory.get(program.category_id) ?? [];
    rows.push(program); programsByCategory.set(program.category_id, rows);
  }
  const rows = groupCategories(contract, 5);
  elements.purposes.innerHTML = rows.map((group, index) => {
    const share = Number(group.amount_cad) / total * 100;
    const details = group.members.map((member) => {
      const programs = (programsByCategory.get(member.category_id) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
      const programAmount = Number(programs[0]?.amount_cad ?? 0) >= 1e9 ? formatBillions : formatMillions;
      return `<section><h4>${escapeHtml(member.label)} <span title="${escapeHtml(formatCad(member.amount_cad, { exact: true }))}">${formatBillions(member.amount_cad)} · ${(Number(member.amount_cad) / total * 100).toFixed(1)}%</span></h4><ol>${programs.map((program) => `<li><span>${escapeHtml(displayLabel(program.label))}</span><strong title="${escapeHtml(formatCad(program.amount_cad, { exact: true }))}">${programAmount(program.amount_cad)}</strong></li>`).join('')}</ol></section>`;
    }).join('');
    return `<details class="purpose-row purpose-row--${index}${group.is_group ? ' purpose-row--grouped' : ''}"><summary><i></i><span>${escapeHtml(group.label)}<small>${Number(group.payment_line_count).toLocaleString('en-CA')} payment lines</small></span><strong title="${escapeHtml(formatCad(group.amount_cad, { exact: true }))}">${formatBillions(group.amount_cad)}</strong><b>${share.toFixed(1)}%</b></summary><div>${details}</div></details>`;
  }).join('');
}

function renderFlatView() {
  const recipientById = new Map(contract.recipients.map((row) => [row.recipient_id, row]));
  const routesByProgram = new Map();
  for (const route of contract.named_routes) { const rows = routesByProgram.get(route.program_key) ?? []; rows.push(route); routesByProgram.set(route.program_key, rows); }
  const programsByCategory = new Map();
  for (const program of contract.programs) { const rows = programsByCategory.get(program.category_id) ?? []; rows.push(program); programsByCategory.set(program.category_id, rows); }
  elements.flat.innerHTML = `<p class="flat-intro">The same evidence, unrolled for touch, keyboard and small screens.</p>${contract.categories.map((category) => `<details class="flat-category"><summary><span>${escapeHtml(category.label)}</span><strong>${formatCad(category.amount_cad)}</strong></summary><div>${(programsByCategory.get(category.category_id) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad)).map((program) => {
    const routes = (routesByProgram.get(program.program_key) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad)).slice(0, 10);
    return `<section class="flat-program"><h3><span>${escapeHtml(displayLabel(program.label))}</span><strong>${formatCad(program.amount_cad)}</strong></h3><ol>${routes.map((route) => { const recipient = recipientById.get(route.recipient_id); return `<li><button type="button" data-recipient-id="${escapeHtml(route.recipient_id)}"><span>${escapeHtml(displayLabel(recipient?.label ?? 'Named recipient'))}</span><strong>${formatCad(route.amount_cad)}</strong></button></li>`; }).join('')}</ol></section>`;
  }).join('')}</div></details>`).join('')}`;
}

function renderNetwork() {
  layout = layoutGlobe(contract);
  elements.globe.innerHTML = renderGlobe(layout, contract);
  renderFlatView();
  renderConcentration();
  renderPurposeList();
  elements.stage.setAttribute('aria-busy', 'false');
}

async function showRecipient(recipientId, { comparison = false, updateUrl = true } = {}) {
  const recipient = contract.recipients.find((row) => row.recipient_id === recipientId);
  if (!recipient) return;
  const payload = await loadPayload(recipientId);
  const intermediary = await loadOptional(payload.intermediary_path);
  if (comparison) {
    compareId = recipientId;
    elements.comparison.innerHTML = renderAnswerCard(payload, contract, intermediary, { comparison: true });
    elements.comparison.hidden = false;
  } else {
    selectedId = recipientId;
    elements.answer.innerHTML = renderAnswerCard(payload, contract, intermediary);
    const overlay = elements.globe.querySelector('#selection-overlay');
    if (overlay) overlay.innerHTML = renderSelectionOverlay(layout, payload);
    elements.story.innerHTML = `<strong>${escapeHtml(displayLabel(recipient.label))}</strong><span>${formatCad(recipient.amount_cad)} across ${payload.incoming_routes.length} published program route${payload.incoming_routes.length === 1 ? '' : 's'}.</span>`;
  }
  compareMode = false;
  elements.search.placeholder = 'Try a hospital, municipality or agency';
  if (updateUrl) updateHash();
  announce(`${displayLabel(recipient.label)}, ${formatCad(recipient.amount_cad)}, rank ${recipient.global_rank}.`);
}

function matches(query) {
  const needle = query.trim().toLocaleLowerCase('en-CA');
  if (!needle) return [];
  return contract.recipients.filter((row) => row.label.toLocaleLowerCase('en-CA').includes(needle)).slice(0, 12);
}

function renderSearch() {
  const rows = matches(elements.search.value);
  elements.results.hidden = !elements.search.value.trim();
  elements.results.innerHTML = rows.length ? rows.map((row) => `<button type="button" data-search-id="${escapeHtml(row.recipient_id)}"><span>${escapeHtml(displayLabel(row.label))}<small>${escapeHtml(row.payee_type)} · rank ${row.global_rank}</small></span><strong>${formatCad(row.amount_cad)}</strong></button>`).join('') : '<p>No named recipient matches.</p>';
}

async function openProfile() {
  if (!selectedId) return;
  const payload = await loadPayload(selectedId);
  const profile = await loadOptional(payload.profile_path);
  elements.profile.innerHTML = renderProfilePage(profile, payload.evidence_stops?.[0]?.state ?? '2025-26 financial statement unavailable');
  elements.profilePanel.hidden = false;
  elements.profilePanel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function bindEvents() {
  elements.search.addEventListener('input', renderSearch);
  elements.results.addEventListener('click', (event) => {
    const button = event.target.closest('[data-search-id]'); if (!button) return;
    const id = button.dataset.searchId; elements.results.hidden = true; elements.search.value = '';
    showRecipient(id, { comparison: compareMode });
  });
  elements.stage.addEventListener('click', (event) => { const node = event.target.closest('[data-recipient-id]'); if (node) showRecipient(node.dataset.recipientId, { comparison: compareMode }); });
  elements.stage.addEventListener('keydown', (event) => { const node = event.target.closest('[data-recipient-id]'); if (node && ['Enter', ' '].includes(event.key)) { event.preventDefault(); showRecipient(node.dataset.recipientId, { comparison: compareMode }); } });
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-compare-recipient]')) { compareMode = true; elements.search.placeholder = 'Choose a second recipient'; elements.search.focus(); announce('Search for a second recipient to compare.'); }
    if (event.target.closest('[data-close-answer]')) { const card = event.target.closest('.answer-card'); if (card?.classList.contains('answer-card--comparison')) { compareId = null; elements.comparison.hidden = true; } else { selectedId = null; elements.answer.innerHTML = '<p class="answer-placeholder">Choose a recipient to turn the diagram into an answer.</p>'; elements.globe.querySelector('#selection-overlay').innerHTML = ''; } updateHash(); }
    if (event.target.closest('[data-open-profile]')) openProfile();
  });
  elements.reset.addEventListener('click', () => { compareId = null; elements.comparison.hidden = true; showRecipient(DEFAULT_RECIPIENT); });
  elements.flatten.addEventListener('click', () => { flattened = !flattened; elements.globe.hidden = flattened; elements.flat.hidden = !flattened; elements.flatten.setAttribute('aria-pressed', String(flattened)); elements.flatten.textContent = flattened ? 'Return to globe' : 'Flatten the globe'; });
  document.querySelector('#open-method').addEventListener('click', () => elements.method.showModal());
  document.querySelector('[data-close-method]').addEventListener('click', () => elements.method.close());
  document.querySelector('[data-close-profile]').addEventListener('click', () => { elements.profilePanel.hidden = true; });
}

async function init() {
  try {
    const pointer = await fetchJson(rootUrl('data/current.json'));
    releaseBase = directoryOf(pointer.flow_v2.network_path);
    contract = await fetchJson(rootUrl(pointer.flow_v2.network_path));
    const identityCount = document.querySelector('#identity-link-count');
    if (identityCount) identityCount.textContent = Number(contract.reviewed_entity_link_count ?? 0).toLocaleString('en-CA');
    renderNetwork(); bindEvents();
    const hash = new URLSearchParams(location.hash.slice(1));
    const initial = hash.get('r') || DEFAULT_RECIPIENT;
    await showRecipient(initial, { updateUrl: false });
    if (hash.get('compare')) await showRecipient(hash.get('compare'), { comparison: true, updateUrl: false });
  } catch (error) {
    console.error(error); elements.stage.setAttribute('aria-busy', 'false'); elements.globe.innerHTML = `<p class="error">The reviewed visualization could not load. ${escapeHtml(error.message)}</p>`;
  }
}

init();
