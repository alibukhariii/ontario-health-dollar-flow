import { parseFlowV2State, preferredScrollBehavior, serializeFlowV2State } from './app-model.mjs';
import {
  escapeHtml,
  renderCategoriesCanvas,
  renderPayeePage,
  renderProfilePage,
  renderProgramsPage,
  renderRecipientsPage,
} from './renderers.mjs';

const elements = {
  categories: document.querySelector('#categories-content'),
  programs: document.querySelector('#programs-content'),
  recipients: document.querySelector('#recipients-content'),
  search: document.querySelector('#recipient-search'),
  profile: document.querySelector('#profile-content'),
  source: document.querySelector('#source-content'),
  status: document.querySelector('#flow-status'),
  tabs: [...document.querySelectorAll('[data-tab]')],
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const caches = { categories: new Map(), payees: new Map(), profiles: new Map(), intermediaries: new Map() };
let pointer;
let overview;
let convergence;
let releaseBase;
let selectedCategory = null;
let selectedProgram = null;
let selectedPayee = null;
let recipientLimit = 50;
let state = parseFlowV2State(window.location.search);

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}.`);
  return response.json();
}

function directoryOf(path) { return path.slice(0, path.lastIndexOf('/') + 1); }
function announce(message) { elements.status.textContent = message; }

function scrollToPage(page) {
  const section = document.querySelector(`#page-${page}`);
  if (!section) return;
  document.body.dataset.page = page;
  for (const tab of elements.tabs) {
    const active = tab.dataset.tab === page;
    tab.setAttribute('aria-selected', String(active));
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  section.scrollIntoView({ behavior: preferredScrollBehavior(reducedMotion), block: 'start' });
}

function setState(next, { replace = false, scroll = true } = {}) {
  state = { ...state, ...next };
  const query = serializeFlowV2State(state);
  const url = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history[replace ? 'replaceState' : 'pushState'](state, '', url);
  if (scroll) scrollToPage(state.page);
}

async function loadCategory(categoryId) {
  if (!caches.categories.has(categoryId)) {
    const index = overview.categories.find((row) => row.category_id === categoryId);
    if (!index) throw new Error(`Unknown category: ${categoryId}`);
    caches.categories.set(categoryId, fetchJson(`${releaseBase}${index.path}`));
  }
  return caches.categories.get(categoryId);
}

async function loadPayee(path, payeeId) {
  if (!caches.payees.has(payeeId)) caches.payees.set(payeeId, fetchJson(`${releaseBase}${path}`));
  return caches.payees.get(payeeId);
}

async function loadOptional(path, cache, key) {
  if (!path) return null;
  if (!cache.has(key)) cache.set(key, fetchJson(`${releaseBase}${path}`));
  return cache.get(key);
}

function renderCategories() {
  elements.categories.innerHTML = renderCategoriesCanvas(overview, selectedCategory?.category_id ?? null);
}

function renderPrograms() {
  elements.programs.innerHTML = renderProgramsPage(selectedCategory, selectedProgram?.program_id ?? null);
}

function renderRecipients() {
  elements.recipients.innerHTML = renderRecipientsPage(convergence, selectedProgram, {
    query: elements.search.value,
    limit: recipientLimit,
  });
}

async function selectCategory(categoryId, { history = true, scroll = true } = {}) {
  selectedCategory = await loadCategory(categoryId);
  selectedProgram = null;
  selectedPayee = null;
  recipientLimit = 50;
  renderCategories();
  renderPrograms();
  renderRecipients();
  if (history) setState({ page: 'programs', category: categoryId, program: null, payee: null }, { scroll });
  else if (scroll) scrollToPage('programs');
  announce(`${selectedCategory.label} programs loaded.`);
}

function findProgram(programId) {
  return selectedCategory?.programs?.find((program) => program.program_id === programId) ?? null;
}

function selectProgram(programId, { history = true, scroll = true } = {}) {
  selectedProgram = findProgram(programId);
  if (!selectedProgram) return;
  selectedPayee = null;
  recipientLimit = 50;
  elements.search.value = '';
  renderPrograms();
  renderRecipients();
  if (history) setState({ page: 'recipients', category: selectedCategory.category_id, program: programId, payee: null }, { scroll });
  else if (scroll) scrollToPage('recipients');
  announce(`${selectedProgram.label} recipients loaded.`);
}

function profileUnavailableReason(payee) {
  if (payee.profile_unavailable_reason) return payee.profile_unavailable_reason;
  if (payee.payee_type === 'hospital corporation') return '2025–26 financial statement unavailable';
  return 'Financial profile not collected in the current scope';
}

async function selectPayee(path, payeeId, { history = true, scroll = true } = {}) {
  selectedPayee = await loadPayee(path, payeeId);
  const intermediary = await loadOptional(selectedPayee.intermediary_path, caches.intermediaries, selectedPayee.intermediary_path);
  elements.recipients.innerHTML = renderPayeePage(selectedPayee, intermediary, {
    programLabel: selectedProgram?.label ?? null,
  });
  const profile = await loadOptional(selectedPayee.profile_path, caches.profiles, payeeId);
  elements.profile.innerHTML = renderProfilePage(profile, profileUnavailableReason(selectedPayee));
  if (history) setState({ page: 'recipients', payee: payeeId }, { scroll });
  else if (scroll) scrollToPage('recipients');
  announce(`${selectedPayee.published_label} loaded with ${selectedPayee.incoming_routes.length} published routes.`);
}

function showGlobalRecipients({ history = true } = {}) {
  selectedCategory = null;
  selectedProgram = null;
  selectedPayee = null;
  recipientLimit = 50;
  elements.search.value = '';
  renderCategories();
  renderPrograms();
  renderRecipients();
  if (history) setState({ page: 'recipients', category: null, program: null, payee: null });
  else scrollToPage('recipients');
}

function bindEvents() {
  elements.categories.addEventListener('click', async (event) => {
    const category = event.target.closest('[data-category-id]');
    if (category) await selectCategory(category.dataset.categoryId);
  });
  elements.programs.addEventListener('click', (event) => {
    const program = event.target.closest('[data-program-id]');
    if (program) selectProgram(program.dataset.programId);
  });
  elements.search.addEventListener('input', () => {
    recipientLimit = 50;
    if (!selectedPayee) renderRecipients();
  });
  elements.recipients.addEventListener('click', async (event) => {
    const payee = event.target.closest('[data-payee-id]');
    if (payee) {
      await selectPayee(payee.dataset.payeePath, payee.dataset.payeeId);
      return;
    }
    if (event.target.closest('[data-recipient-more]')) {
      recipientLimit += 50;
      renderRecipients();
      return;
    }
    if (event.target.closest('[data-back-to-program]')) {
      selectedPayee = null;
      renderRecipients();
      setState({ page: 'recipients', payee: null });
      return;
    }
    if (event.target.closest('.payee-junction') && selectedPayee) setState({ page: 'profile' });
  });
  for (const tab of elements.tabs) {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'categories') setState({ page: 'categories' });
      if (tab.dataset.tab === 'programs') setState({ page: selectedCategory ? 'programs' : 'categories' });
      if (tab.dataset.tab === 'recipients') {
        if (selectedCategory) setState({ page: 'recipients' });
        else showGlobalRecipients();
      }
    });
  }
  window.addEventListener('popstate', async () => {
    state = parseFlowV2State(window.location.search);
    await restoreState();
  });
}

function observePages() {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-visible');
      document.body.dataset.page = entry.target.id.replace('page-', '');
    }
  }, { threshold: 0.45 });
  document.querySelectorAll('.flow-page').forEach((page) => observer.observe(page));
}

async function renderSources() {
  const sourceIndex = await fetchJson(pointer.flow_v2.source_path);
  elements.source.innerHTML = sourceIndex.sources.map((source) => `<p><a href="${escapeHtml(source.url)}" rel="noreferrer">${escapeHtml(source.label)}</a><span>${escapeHtml(source.role)}</span></p>`).join('');
}

async function restoreState() {
  selectedCategory = state.category ? await loadCategory(state.category) : null;
  selectedProgram = state.program ? findProgram(state.program) : null;
  selectedPayee = null;
  renderCategories();
  renderPrograms();
  renderRecipients();
  if (state.payee) {
    const candidate = selectedProgram?.destinations?.find((row) => row.destination_id === state.payee)
      ?? convergence.payees?.find((row) => row.payment_label_id === state.payee);
    if (candidate?.path) await selectPayee(candidate.path, state.payee, { history: false, scroll: false });
  }
  scrollToPage(state.page);
}

try {
  pointer = await fetchJson('data/current.json');
  releaseBase = directoryOf(pointer.flow_v2.overview_path);
  [overview, convergence] = await Promise.all([
    fetchJson(pointer.flow_v2.overview_path),
    fetchJson(pointer.flow_v2.convergence_path),
  ]);
  renderCategories();
  renderPrograms();
  renderRecipients();
  bindEvents();
  observePages();
  await Promise.all([renderSources(), restoreState()]);
} catch (error) {
  console.error(error);
  elements.categories.innerHTML = `<p class="no-published-amounts">The published amounts could not be loaded. ${escapeHtml(error.message)}</p>`;
}
