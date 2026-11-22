import {
  filterCategoryDestinations,
  filterFlowRecipients,
  flowWidth,
  formatCad,
  humanizeCategory,
} from './app-model.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ministryLabel(value) {
  return String(value ?? '')
    .replace('Ministry Of Health', 'Ministry of Health')
    .replace('Ministry Of Long-Term Care', 'Ministry of Long-Term Care');
}

function headlineCad(value) {
  const amount = Number(value);
  if (Number.isFinite(amount) && Math.abs(amount) >= 1_000_000_000) {
    return `${amount < 0 ? '-' : ''}$${(Math.abs(amount) / 1_000_000_000).toFixed(1)}B`;
  }
  return formatCad(value, { compact: true });
}

export function renderTotalPage(overview) {
  const ministries = overview?.ministries ?? [];
  const positive = overview.positive_published_payments_cad ?? overview.positive_payments_cad;
  const adjustment = overview.signed_adjustments_cad ?? overview.adjustment_cad;
  const total = Number(positive) || 1;
  return `<div class="opening-flow">
    <h2 class="opening-statement type-reveal">Ontario directed <strong>${escapeHtml(headlineCad(positive))}</strong> through the Ministry of Health and Ministry of Long-Term Care.</h2>
    <div class="ministry-buckets" aria-label="Ministry payment totals">
      ${ministries.map((ministry, index) => `<div class="ministry-bucket ministry-bucket--${index + 1}" style="--ministry-share:${(Number(ministry.positive_amount_cad) / total * 100).toFixed(6)}"><span>${escapeHtml(ministryLabel(ministry.ministry ?? ministry.label))}</span><strong>${escapeHtml(formatCad(ministry.positive_amount_cad, { compact: true }))}</strong><i aria-hidden="true"></i></div>`).join('')}
    </div>
    <p class="positive-payment-note flow-adjustment"><sup>*</sup> The forward flow uses positive published payments. A separate ${escapeHtml(formatCad(adjustment, { compact: true }))} pharmacy adjustment is documented in the methodology.</p>
  </div>`;
}

function renderPurposeUmbrella(categories) {
  const width = 1400;
  const height = 330;
  const centre = width / 2;
  const column = width / Math.max(1, categories.length);
  return `<svg class="purpose-umbrella" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    ${categories.map((category, index) => {
      const target = column * (index + 0.5);
      const share = Number(category.share_percent ?? 0);
      const bandWidth = Math.max(5, share * 7.5);
      const selectedClass = category.selected ? ' is-selected' : '';
      return `<path class="purpose-band${selectedClass}" data-category-band="${escapeHtml(category.category_id)}" d="M ${centre} 0 C ${centre} 112 ${target} 176 ${target} ${height}" style="--band-width:${bandWidth.toFixed(3)}"></path>`;
    }).join('')}
  </svg>`;
}

export function renderCategoryPage(overview, selectedCategoryId = '') {
  const categories = (overview?.categories ?? []).map((category) => ({
    ...category,
    selected: category.category_id === selectedCategoryId,
  }));
  return `<div class="purpose-flow-shell">
    <span class="category-entry-flow" aria-hidden="true"></span>
    ${renderPurposeUmbrella(categories)}
    <div class="purpose-flow" aria-label="Fourteen funding purposes">
    ${categories.map((category) => {
      const selected = category.selected;
      const residual = Boolean(category.residual) || category.category_id === 'ministry_operations_and_other_published_payments';
      return `<button type="button" class="purpose-ribbon${selected ? ' is-selected' : ''}${residual ? ' is-residual' : ''}"
        data-category-id="${escapeHtml(category.category_id)}" aria-pressed="${selected}"
        style="--ribbon-share:${Number(category.share_percent ?? 0).toFixed(6)}">
        <span class="purpose-ribbon__line" aria-hidden="true"></span>
        <strong>${escapeHtml(category.label)}</strong>
        <span>${escapeHtml(formatCad(category.amount_cad, { compact: true }))}</span>
      </button>`;
    }).join('')}
    </div>
  </div>`;
}

export function renderCategoriesCanvas(overview, selectedCategoryId = '') {
  const categories = renderCategoryPage(overview, selectedCategoryId);
  const table = (overview?.categories ?? []).map((category) => `<tr><th scope="row">${escapeHtml(category.label)}</th><td>${escapeHtml(formatCad(category.amount_cad, { compact: true }))}</td><td>${Number(category.share_percent).toFixed(1)}%</td></tr>`).join('');
  return `<div class="categories-canvas">
    ${renderTotalPage(overview)}
    <div class="categories-continuation" aria-hidden="true"></div>
    ${categories}
    <details class="structured-alternative"><summary>View categories as a table</summary><table><thead><tr><th>Category</th><th>Amount</th><th>Share</th></tr></thead><tbody>${table}</tbody></table></details>
  </div>`;
}

const HOSPITAL_OPERATIONS_NOTE = 'Operation of Hospitals combines multiple funding mechanisms, including base, targeted, activity-based and one-time funding. A consistent recipient-level breakdown is not publicly available.';

export function renderProgramsPage(category, selectedProgramId = '') {
  if (!category) return '<p class="no-published-amounts">Choose a category</p>';
  const denominator = Number(category.positive_amount_cad) || 1;
  const programs = category.programs ?? [];
  return `<div class="programs-flow">
    <header class="programs-origin"><span>Selected category</span><h2>${escapeHtml(category.label)}</h2><strong>${escapeHtml(formatCad(category.positive_amount_cad, { compact: true }))}</strong></header>
    <svg class="programs-ribbons" viewBox="0 0 1200 270" preserveAspectRatio="none" aria-hidden="true">${programs.map((program, index) => {
      const target = (1200 / Math.max(1, programs.length)) * (index + .5);
      const share = Number(program.positive_amount_cad) / denominator * 100;
      return `<path class="flow-ribbon${program.program_id === selectedProgramId ? ' is-selected' : ''}" d="M600 0 C600 90 ${target} 145 ${target} 270" style="--flow-width:${Math.max(3, share * 5.4).toFixed(3)}"></path>`;
    }).join('')}</svg>
    <div class="programs-grid">${programs.map((program) => {
      const share = Number(program.positive_amount_cad) / denominator * 100;
      return `<button type="button" class="program-card${program.program_id === selectedProgramId ? ' is-selected' : ''}" data-program-id="${escapeHtml(program.program_id)}" style="--program-share:${share.toFixed(6)}"><span class="program-card__bar" aria-hidden="true"></span><strong>${escapeHtml(program.label)}</strong><span>${escapeHtml(formatCad(program.positive_amount_cad, { compact: true }))}</span></button>`;
    }).join('')}</div>
    ${programs.some((program) => program.label === 'Operation Of Hospitals') ? `<aside class="program-note">${escapeHtml(HOSPITAL_OPERATIONS_NOTE)}</aside>` : ''}
    <details class="structured-alternative"><summary>View programs as a table</summary><table><thead><tr><th>Program</th><th>Amount</th></tr></thead><tbody>${programs.map((program) => `<tr><th scope="row">${escapeHtml(program.label)}</th><td>${escapeHtml(formatCad(program.positive_amount_cad, { compact: true }))}</td></tr>`).join('')}</tbody></table></details>
  </div>`;
}

function recipientMatches(row, query) {
  return !query || String(row.display_label ?? row.label ?? '').toLocaleLowerCase('en-CA').includes(query);
}

export function renderRecipientsPage(convergence, program = null, options = {}) {
  if (!convergence) return '<p class="no-published-amounts">No published amounts</p>';
  const query = String(options.query ?? '').trim().toLocaleLowerCase('en-CA');
  const limit = Number(options.limit ?? 50);
  const rows = program
    ? (program.destinations ?? []).filter((row) => row.selectable).map((row) => ({
        payment_label_id: row.destination_id, display_label: row.label, payee_type: row.payee_type ?? row.destination_type,
        program_amount_cad: row.amount_cad, published_payment_total_cad: row.global_total_cad ?? row.amount_cad,
        global_rank: row.global_rank, program_rank: row.program_rank, path: row.path,
      }))
    : (convergence.payees ?? convergence.organizations ?? []);
  const matched = rows.filter((row) => recipientMatches(row, query));
  const shown = matched.slice(0, limit);
  const terminals = program ? (program.destinations ?? []).filter((row) => !row.selectable) : [];
  const concentration = convergence.concentration ?? {};
  return `<div class="recipient-ranking" data-total="${matched.length}">
    <header class="recipient-ranking__header"><span>${program ? 'Selected program' : 'All named payees'}</span><h2>${escapeHtml(program?.label ?? 'Where the money converged')}</h2>${program ? `<strong>${escapeHtml(formatCad(program.positive_amount_cad, { compact: true }))}</strong>` : '<p>All named organizations are ranked together. Type labels distinguish providers, intermediaries, municipalities and vendors.</p>'}</header>
    <div class="concentration-strip" aria-label="Concentration among named payees"><span><b>${escapeHtml(concentration.top_1_share_of_named_payees_percent ?? '—')}%</b> to the largest named payee</span><span><b>${escapeHtml(concentration.top_5_share_of_named_payees_percent ?? '—')}%</b> to the five largest</span><span><b>${escapeHtml(concentration.top_10_share_of_named_payees_percent ?? '—')}%</b> to the ten largest</span><span><b>${escapeHtml(concentration.payees_to_50_percent ?? '—')}</b> payees reach half</span><span><b>${escapeHtml(concentration.payees_to_80_percent ?? '—')}</b> payees reach four-fifths</span></div>
    <div class="recipient-list" aria-label="Ranked named payees">${shown.map((row, index) => `<button type="button" class="recipient-row" data-payee-id="${escapeHtml(row.payment_label_id)}" data-payee-path="${escapeHtml(row.path)}"><span class="recipient-row__rank">${program ? `No. ${row.program_rank ?? index + 1} in program` : `No. ${row.global_rank ?? index + 1}`}</span><span class="recipient-row__name"><strong>${escapeHtml(row.display_label)}</strong><small>${escapeHtml(row.payee_type ?? 'published payee')}${program && row.global_rank ? ` · Global No. ${Number(row.global_rank).toLocaleString('en-CA')}` : ''}</small></span><span class="recipient-row__bar" style="--recipient-share:${Number(program ? Number(row.program_amount_cad) / Number(program.positive_amount_cad) * 100 : row.share_of_named_payees_percent ?? 0).toFixed(6)}" aria-hidden="true"></span><span class="recipient-row__amount"><strong>${escapeHtml(formatCad(program ? row.program_amount_cad : row.published_payment_total_cad, { compact: true }))}</strong>${program ? `<small>${escapeHtml(formatCad(row.published_payment_total_cad, { compact: true }))} globally</small>` : ''}</span></button>`).join('')}</div>
    ${shown.length < matched.length ? `<button type="button" class="load-more" data-recipient-more>Show more of ${matched.length.toLocaleString('en-CA')} payees</button>` : ''}
    ${terminals.map((row) => `<aside class="terminal-node evidence-stop"><strong>${escapeHtml(row.evidence_stop ?? row.label)}</strong><span>${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</span></aside>`).join('')}
    <details class="structured-alternative"><summary>View recipients as a table</summary><table><thead><tr><th>Rank</th><th>Named payee</th><th>Type</th><th>Amount</th></tr></thead><tbody>${shown.map((row, index) => `<tr><td>${program ? row.program_rank ?? index + 1 : row.global_rank ?? index + 1}</td><th scope="row">${escapeHtml(row.display_label)}</th><td>${escapeHtml(row.payee_type ?? 'published payee')}</td><td>${escapeHtml(formatCad(program ? row.program_amount_cad : row.published_payment_total_cad, { compact: true }))}</td></tr>`).join('')}</tbody></table></details>
  </div>`;
}

export function renderDestinationsPage(category, options = {}) {
  if (!category) return '<p class="no-published-amounts">No published amounts</p>';
  const filtered = filterCategoryDestinations(category, options);
  const denominator = Number(category.positive_amount_cad ?? category.amount_cad) || 1;
  const rowsByProgram = new Map();
  for (const destination of filtered.rows) {
    if (!rowsByProgram.has(destination.program_id)) rowsByProgram.set(destination.program_id, []);
    rowsByProgram.get(destination.program_id).push(destination);
  }
  const programBranches = (category.programs ?? []).map((program) => {
    const destinations = rowsByProgram.get(program.program_id) ?? [];
    if (!destinations.length) return '';
    const programShare = Number(program.positive_amount_cad) / denominator * 100;
    const destinationRows = destinations.map((destination) => {
      const destinationType = String(destination.destination_type ?? 'organization').replaceAll('_', '-');
      const selectable = Boolean(destination.selectable ?? destination.payee_path ?? destination.path);
      const tag = selectable ? 'button' : 'div';
      const attributes = selectable
        ? `type="button" data-payee-id="${escapeHtml(destination.payee_id ?? destination.destination_id)}" data-payee-path="${escapeHtml(destination.payee_path ?? destination.path)}"`
        : '';
      const categoryShare = Number(destination.amount_cad) / denominator * 100;
      return `<${tag} class="destination-ribbon destination destination--${escapeHtml(destinationType)}" ${attributes} style="--category-share:${categoryShare.toFixed(6)};--destination-share:${categoryShare.toFixed(6)}">
        <span class="destination-ribbon__line" aria-hidden="true"></span>
        <span class="destination-ribbon__text"><strong>${escapeHtml(destination.label)}</strong><span>${escapeHtml(formatCad(destination.amount_cad, { compact: true }))}</span>${selectable ? '' : '<small>No published amounts</small>'}</span>
      </${tag}>`;
    }).join('');
    return `<section class="program-branch" style="--category-share:${programShare.toFixed(6)}">
      <span class="program-branch__line" aria-hidden="true"></span>
      <div class="program-node"><small>Official program</small><strong>${escapeHtml(program.label)}</strong><span>${escapeHtml(formatCad(program.positive_amount_cad, { compact: true }))}</span></div>
      <div class="program-destinations">${destinationRows}</div>
    </section>`;
  }).join('');
  return `<div class="category-program-recipient-flow" data-window-total="${filtered.total}" data-window-has-more="${filtered.hasMore}">
    <div class="category-origin"><small>Selected funding purpose</small><strong>${escapeHtml(category.label)}</strong><span>${escapeHtml(formatCad(category.positive_amount_cad ?? category.amount_cad, { compact: true }))}</span></div>
    <span class="category-flow-spine" aria-hidden="true"></span>
    <div class="program-branches">${programBranches || '<p class="no-published-amounts">No published amounts</p>'}</div>
    ${filtered.hasMore ? `<button type="button" class="load-more" data-load-more>Show more of ${filtered.total.toLocaleString('en-CA')} destinations</button>` : ''}
  </div>`;
}

export function renderConvergencePage(convergence, options = {}) {
  if (!convergence) return '<p class="no-published-amounts">No published amounts</p>';
  const limit = Number(options.limit ?? 40);
  const query = String(options.query ?? '').trim().toLocaleLowerCase('en-CA');
  const organizations = (convergence.organizations ?? [])
    .filter((row) => !query || String(row.display_label ?? '').toLocaleLowerCase('en-CA').includes(query))
    .slice(0, limit);
  const totalMatching = (convergence.organizations ?? [])
    .filter((row) => !query || String(row.display_label ?? '').toLocaleLowerCase('en-CA').includes(query)).length;
  const intermediaries = convergence.intermediaries ?? [];
  const nonItemizedShare = Number(convergence.not_itemized_share_percent ?? 0);
  return `<div class="convergence-story" data-convergence-total="${totalMatching}" data-convergence-has-more="${organizations.length < totalMatching}">
    <div class="convergence-callout">
      <span>Not itemized to a public recipient</span>
      <strong>${escapeHtml(formatCad(convergence.not_itemized_to_public_recipient_cad, { compact: true }))}</strong>
      <b>${nonItemizedShare.toFixed(1)}%</b>
    </div>
    <div class="convergence-heading">
      <h2>Where the money converged</h2>
      <p>Organizations are ranked by the total of every compatible payment published to their name.</p>
    </div>
    <div class="concentration-strip" aria-label="Funding concentration among named organizations">
      <span><b>${escapeHtml(convergence.concentration?.top_5_share_of_named_organizations_percent ?? '—')}%</b> to the five largest</span>
      <span><b>${escapeHtml(convergence.concentration?.organizations_to_50_percent ?? '—')}</b> organizations reach half</span>
      <span><b>${escapeHtml(convergence.concentration?.organizations_to_80_percent ?? '—')}</b> organizations reach four-fifths</span>
    </div>
    <div class="convergence-ranking" role="list" aria-label="Named organizations ranked by published payments">
      ${organizations.map((row) => `<button type="button" role="listitem" class="convergence-row" data-payee-id="${escapeHtml(row.payment_label_id)}" data-payee-path="${escapeHtml(row.path)}" style="--global-share:${Number(row.share_of_all_positive_percent ?? 0).toFixed(4)}">
        <span class="convergence-rank">No. ${Number(row.global_rank).toLocaleString('en-CA')}</span>
        <span class="convergence-name"><strong>${escapeHtml(row.display_label)}</strong><small>${Number(row.category_count ?? 0)} funding purpose${Number(row.category_count ?? 0) === 1 ? '' : 's'}${row.identity_status === 'reviewed_resolved' ? ' · verified organization' : ' · published payee'}</small></span>
        <span class="convergence-ribbon" aria-hidden="true"></span>
        <strong class="convergence-amount">${escapeHtml(formatCad(row.published_payment_total_cad, { compact: true }))}</strong>
      </button>`).join('')}
    </div>
    ${organizations.length < totalMatching ? `<button type="button" class="load-more load-more--dark" data-convergence-more>Show more of ${totalMatching.toLocaleString('en-CA')} organizations</button>` : ''}
    <section class="intermediary-ranking">
      <p class="folio">Amount-bearing intermediaries</p>
      <div>${intermediaries.map((row) => `<button type="button" class="intermediary-rank-row" data-payee-id="${escapeHtml(row.payment_label_id)}" data-payee-path="${escapeHtml(row.path)}"><strong>${escapeHtml(row.display_label)}</strong><span>${escapeHtml(formatCad(row.published_payment_total_cad, { compact: true }))}</span></button>`).join('')}</div>
    </section>
  </div>`;
}

function renderIntermediaryExpenseFrame(intermediary) {
  if (!intermediary?.groups?.length) return '';
  const total = Number(intermediary.reported_expense_total_cad) || 1;
  return `<section class="intermediary-expense-frame">
    <div class="intermediary-expense-frame__heading"><small>Published expense breakdown</small><h3>Inside ${escapeHtml(intermediary.intermediary_label)}</h3><strong>${escapeHtml(formatCad(intermediary.reported_expense_total_cad, { compact: true }))}</strong></div>
    <div class="intermediary-groups">
      ${intermediary.groups.map((group) => `<section class="intermediary-group intermediary-group--${escapeHtml(group.group_id)}" style="--group-share:${(Number(group.amount_cad) / total * 100).toFixed(6)}">
        <span class="intermediary-group__bar" aria-hidden="true"></span>
        <div class="intermediary-group__title"><strong>${escapeHtml(group.group_label)}</strong><span>${escapeHtml(formatCad(group.amount_cad, { compact: true }))}</span></div>
        <div class="intermediary-components">${(group.components ?? []).map((component) => {
          const content = `<span>${escapeHtml(component.source_label)}</span><strong>${escapeHtml(formatCad(component.amount_cad, { compact: true }))}</strong>`;
          return component.target_payee_path
            ? `<button type="button" data-payee-id="${escapeHtml(component.target_payee_id)}" data-payee-path="${escapeHtml(component.target_payee_path)}">${content}</button>`
            : `<div>${content}</div>`;
        }).join('')}</div>
      </section>`).join('')}
    </div>
  </section>`;
}

export function renderPayeePage(payee, intermediary = null, options = {}) {
  const routes = payee?.incoming_routes ?? payee?.routes ?? [];
  if (!routes.length) return '<p class="no-published-amounts">No published amounts</p>';
  const total = Number(payee.published_payment_total_cad ?? payee.total_amount_cad)
    || routes.reduce((sum, route) => sum + Number(route.amount_cad), 0)
    || 1;
  const rankLabel = payee.global_rank
    ? `No. ${Number(payee.global_rank).toLocaleString('en-CA')} among named payees`
    : '';
  const sourceLabels = (payee.published_labels ?? []).filter((label) => label !== payee.published_label);
  return `<div class="payee-flow">
    ${options.programLabel ? `<button type="button" class="back-to-program" data-back-to-program>Back to recipients in ${escapeHtml(options.programLabel)}</button>` : ''}
    ${rankLabel ? `<p class="payee-global-rank">${escapeHtml(rankLabel)}</p>` : ''}
    <h2 class="payee-received-title"><strong>${escapeHtml(payee.published_label)}</strong> received <strong>${escapeHtml(formatCad(payee.published_payment_total_cad ?? payee.total_amount_cad, { compact: true }))}</strong> in payments published by Ontario’s health ministries.</h2>
    <p class="payee-type">${escapeHtml(payee.payee_type ?? payee.destination_type ?? 'published payee')}</p>
    ${sourceLabels.length > 1 ? `<p class="payee-source-labels">Published under: ${sourceLabels.map(escapeHtml).join(' · ')}</p>` : ''}
    <div class="payee-flow__routes">
      ${routes.map((route) => `<div class="incoming-payment-route${options.programLabel && route.program_label !== options.programLabel ? ' is-context' : ' is-selected'}" style="--route-share:${Number(route.share_percent ?? Number(route.amount_cad) / total * 100).toFixed(6)}">
        <span class="incoming-route__ministry">${escapeHtml(ministryLabel(route.ministry))}</span>
        <span class="incoming-route__category">${escapeHtml(route.category_label)}</span>
        <span class="incoming-route__program">${escapeHtml(route.program_label)}</span>
        <span class="incoming-route__ribbon" aria-hidden="true"></span>
        <strong>${escapeHtml(formatCad(route.amount_cad, { compact: true }))}</strong>
      </div>`).join('')}
    </div>
    <button type="button" class="payee-junction"><strong>${escapeHtml(payee.published_label)}</strong><span>${escapeHtml(formatCad(payee.published_payment_total_cad ?? payee.total_amount_cad, { compact: true }))}</span></button>
    ${renderIntermediaryExpenseFrame(intermediary)}
    ${(payee.evidence_stops ?? []).map((stop) => `<aside class="terminal-node evidence-stop"><strong>${escapeHtml(stop.state)}</strong><span>${escapeHtml(stop.limitation)}</span></aside>`).join('')}
  </div>`;
}

function statementBar(title, total, components = []) {
  if (total === null || total === undefined || total === '') return '';
  const denominator = Math.abs(Number(total)) || 1;
  const className = title === 'Expenses' ? 'expense' : title.toLocaleLowerCase('en-CA');
  return `<section class="statement-bar statement-bar--${className}">
    <div class="statement-bar__total"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(formatCad(total, { compact: true }))}</span></div>
    <div class="statement-bar__components">
      ${(components ?? []).map((component) => `<div class="statement-component" style="--component-share:${Math.max(0, Math.min(100, Math.abs(Number(component.amount_cad)) / denominator * 100)).toFixed(6)}">
        <span class="statement-component__bar" aria-hidden="true"></span><strong>${escapeHtml(component.source_label)}</strong><span>${escapeHtml(formatCad(component.amount_cad, { compact: true }))}</span>
      </div>`).join('')}
    </div>
  </section>`;
}

export function renderProfilePage(profile, unavailableReason = '2025–26 financial statement unavailable') {
  if (!profile) return `<aside class="profile-evidence-stop evidence-stop"><strong>${escapeHtml(unavailableReason)}</strong><span>The published payment trail ends here.</span></aside>`;
  const revenue = statementBar('Revenue', profile.revenue_total_cad, profile.revenue_components);
  const expenses = statementBar('Expenses', profile.expense_total_cad, profile.expense_components);
  if (!revenue && !expenses) return '<p class="no-published-amounts">No published amounts</p>';
  return `<div class="statement-profile">
    <p class="statement-profile__entity">${escapeHtml(profile.reporting_entity)}</p>
    <p class="statement-profile__period">${escapeHtml(profile.period_label ?? profile.fiscal_year ?? '')}</p>
    ${revenue}${expenses}
    ${profile.source?.url ? `<p class="statement-source"><a href="${escapeHtml(profile.source.url)}" rel="noreferrer">View the ${escapeHtml(profile.source.period ?? profile.fiscal_year ?? '')} financial statement</a></p>` : ''}
  </div>`;
}

export function renderCategoryCards(categories, activeCategory = '') {
  return categories.map((category, index) => {
    const selected = category.category_id === activeCategory;
    return `
      <button class="category-card category-${(index % 7) + 1}${selected ? ' is-active' : ''}"
        type="button" data-service-category="${escapeHtml(category.category_id)}"
        aria-pressed="${selected}">
        <span class="category-card__value">$${Number(category.per_100_dollars).toFixed(2)}</span>
        <span class="category-card__label">${escapeHtml(humanizeCategory(category.category_id))}</span>
        <span class="category-card__amount">${escapeHtml(formatCad(category.amount_cad, { compact: true }))}</span>
      </button>`;
  }).join('');
}

export function renderRankingRows(rows, profileByPaymentLabel, limit = 100) {
  if (!rows.length) {
    return '<tr><td colspan="4" class="empty-state">No published recipient labels match these filters.</td></tr>';
  }
  return rows.slice(0, limit).map((row, index) => {
    const hasProfile = profileByPaymentLabel.has(row.payment_label_id);
    return `
      <tr>
        <td class="rank-cell">${index + 1}</td>
        <td>
          <button class="recipient-button" type="button" data-payment-label-id="${escapeHtml(row.payment_label_id)}">
            <span>${escapeHtml(row.recipient_label)}</span>
            ${hasProfile ? '<span class="evidence-badge">Financial profile</span>' : ''}
          </button>
          <span class="recipient-class">${escapeHtml(humanizeCategory(row.recipient_class))}</span>
        </td>
        <td class="amount-cell">${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</td>
        <td class="line-cell">${Number(row.payment_line_count).toLocaleString('en-CA')}</td>
      </tr>`;
  }).join('');
}

function renderComposition(title, total, components) {
  if (!total || !components?.length) {
    return `<section class="profile-section"><h3>${escapeHtml(title)}</h3><p class="muted">A complete composition is not available.</p></section>`;
  }
  const denominator = Number(total);
  return `
    <section class="profile-section">
      <div class="profile-section__heading"><h3>${escapeHtml(title)}</h3><strong>${escapeHtml(formatCad(total, { compact: true }))}</strong></div>
      <div class="composition-list">
        ${components.map((row) => {
          const share = denominator > 0 ? Number(row.amount_cad) / denominator * 100 : 0;
          return `<div class="composition-row">
            <div class="composition-row__labels"><span>${escapeHtml(row.source_label)}</span><strong>${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</strong></div>
            <div class="composition-track" aria-label="${escapeHtml(row.source_label)}: ${share.toFixed(1)} percent">
              <span style="width:${Math.max(0, Math.min(100, share)).toFixed(2)}%"></span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

function renderInsight(label, insight) {
  if (!insight) return '';
  return `<aside class="insight-card">
    <span class="eyebrow">What stands out</span>
    <strong>${escapeHtml(insight.source_label)} represents ${Number(insight.share_percent).toFixed(1)}% of reported ${escapeHtml(label)}.</strong>
    <small>${escapeHtml(insight.limitation ?? 'Source-native composition; not a performance comparison.')}</small>
  </aside>`;
}

export function renderProfile(profile) {
  const linked = profile.payment_link_status === 'reviewed_resolved';
  const result = profile.annual_result
    ? `<div class="profile-stat"><span>${escapeHtml(profile.annual_result.source_label)}</span><strong>${escapeHtml(formatCad(profile.annual_result.amount_cad, { compact: true }))}</strong></div>`
    : '';
  const paymentPanel = linked
    ? `<section class="profile-section payment-frame">
        <div class="profile-section__heading"><h3>Disclosed payments</h3><strong>${escapeHtml(formatCad(profile.linked_disclosed_payment_cad, { compact: true }))}</strong></div>
        <p>This amount comes from a different accounting frame. It is not automatically the same money as the revenue reported above.</p>
      </section>`
    : `<aside class="evidence-stop"><strong>No payment-label connection has been verified.</strong><span>This audited corporation profile is published independently and has no ranking amount.</span></aside>`;
  return `
    <div class="profile-header">
      <span class="eyebrow">${linked ? 'Linked audited profile' : 'Standalone audited profile'}</span>
      <h2>${escapeHtml(profile.reporting_entity)}</h2>
      ${profile.reporting_scope ? `<p>${escapeHtml(profile.reporting_scope)}</p>` : ''}
    </div>
    <div class="profile-stats">
      ${profile.revenue_total_cad ? `<div class="profile-stat"><span>Reported revenue</span><strong>${escapeHtml(formatCad(profile.revenue_total_cad, { compact: true }))}</strong></div>` : ''}
      ${profile.expense_total_cad ? `<div class="profile-stat"><span>Reported expenses</span><strong>${escapeHtml(formatCad(profile.expense_total_cad, { compact: true }))}</strong></div>` : ''}
      ${result}
    </div>
    ${renderInsight('expenses', profile.expense_insight)}
    ${renderComposition('Reported expenses', profile.expense_total_cad, profile.expense_components)}
    ${renderInsight('revenue', profile.revenue_insight)}
    ${renderComposition('Reported revenue', profile.revenue_total_cad, profile.revenue_components)}
    ${paymentPanel}
    <section class="profile-section source-note"><h3>Evidence</h3><p>Audited statement values are shown at the reporting-entity scope and retain the source’s own categories. They are not rankings or measures of efficiency.</p></section>`;
}

export function renderPaymentOnlyProfile(row) {
  return `
    <div class="profile-header">
      <span class="eyebrow">Published payment label</span>
      <h2>${escapeHtml(row.recipient_label)}</h2>
      <p>${escapeHtml(humanizeCategory(row.recipient_class))}</p>
    </div>
    <div class="profile-stats">
      <div class="profile-stat"><span>Disclosed payments</span><strong>${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</strong></div>
      <div class="profile-stat"><span>Included payment lines</span><strong>${Number(row.payment_line_count ?? 0).toLocaleString('en-CA')}</strong></div>
    </div>
    <aside class="evidence-stop">
      <strong>No validated financial profile is connected to this published label.</strong>
      <span>The evidence trail stops at the disclosed-payment record. Missing financial-statement detail is not treated as zero.</span>
    </aside>
    <section class="profile-section source-note"><h3>Evidence</h3><p>This amount is the sum of non-negative disclosed payment lines for the raw published label. It is not necessarily the recipient’s total revenue or funding.</p></section>`;
}

function edgeVisualClass(edge) {
  if (edge.amount_status === 'relationship_disclosed_amount_not_disclosed') return 'undisclosed';
  if (edge.funding_mechanism === 'recovery_or_settlement') return 'recovery';
  if (edge.topology === 'composition') return 'composition';
  if (edge.relationship_type === 'context_only' || edge.amount_status === 'period_or_scope_incompatible') return 'context';
  return edge.amount_cad !== null && edge.amount_cad !== undefined ? 'funding' : 'institutional';
}

function shortLabel(value, length = 34) {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function edgeWidth(edge, maxima) {
  if (edge.amount_cad === null || edge.amount_cad === undefined) return 2;
  const amount = Math.abs(Number(edge.amount_cad));
  const maximum = maxima.get(edge.denominator_id) || amount || 1;
  return Math.max(2.5, Math.min(34, 2.5 + Math.sqrt(amount / maximum) * 31.5));
}

export function renderSystemMap(view, selectedEdgeId = '') {
  const focal = view.focalNode;
  const nodeById = new Map(view.nodes.map((node) => [node.node_id, node]));
  const incoming = view.edges.filter((edge) => edge.target_node_id === focal.node_id);
  const outgoing = view.edges.filter((edge) => edge.source_node_id === focal.node_id);
  const maxima = new Map();
  const denominatorLabels = new Map();
  for (const node of [focal, ...view.nodes]) {
    if (node.denominator_id && node.denominator_amount_cad) {
      maxima.set(node.denominator_id, Math.max(maxima.get(node.denominator_id) ?? 0, Math.abs(Number(node.denominator_amount_cad))));
      denominatorLabels.set(node.denominator_id, node.denominator_label ?? node.denominator_id);
    }
  }
  for (const edge of view.edges) {
    if (edge.amount_cad === null || edge.amount_cad === undefined || !edge.denominator_id) continue;
    if (!maxima.has(edge.denominator_id)) {
      maxima.set(edge.denominator_id, Math.max(maxima.get(edge.denominator_id) ?? 0, Math.abs(Number(edge.amount_cad))));
    }
  }
  const rowCount = Math.max(incoming.length, outgoing.length, 1);
  const height = Math.max(410, 150 + rowCount * 92);
  const focalY = height / 2;
  const positions = new Map([[focal.node_id, { x: 490, y: focalY }]]);
  incoming.forEach((edge, index) => positions.set(edge.source_node_id, { x: 30, y: 100 + index * 92 }));
  outgoing.forEach((edge, index) => positions.set(edge.target_node_id, { x: 770, y: 100 + index * 92 }));
  const edgeMarkup = view.edges.map((edge) => {
    const start = positions.get(edge.source_node_id);
    const end = positions.get(edge.target_node_id);
    if (!start || !end) return '';
    const visual = edgeVisualClass(edge);
    const selected = edge.edge_id === selectedEdgeId ? ' is-selected' : '';
    const x1 = start.x + (edge.source_node_id === focal.node_id ? 220 : 200);
    const x2 = end.x;
    const y1 = start.y;
    const y2 = end.y;
    const mid = (x1 + x2) / 2;
    const width = edgeWidth(edge, maxima).toFixed(2);
    const amountLabel = edge.amount_cad === null || edge.amount_cad === undefined
      ? 'Amount not disclosed'
      : formatCad(edge.amount_cad, { compact: true });
    return `<g class="map-connection${selected}" tabindex="0" role="button" data-edge-id="${escapeHtml(edge.edge_id)}" aria-label="${escapeHtml(edge.relationship_type)}: ${escapeHtml(amountLabel)}">
      <path data-edge-id="${escapeHtml(edge.edge_id)}" class="map-edge map-edge--${visual}" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" style="--edge-width:${width}px"${visual === 'funding' ? ' marker-end="url(#map-arrow)"' : ''}></path>
      <text class="map-edge-label" x="${mid}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle">${escapeHtml(amountLabel)}</text>
    </g>`;
  }).join('');
  const relatedMarkup = [...nodeById.values()].map((node) => {
    const position = positions.get(node.node_id);
    if (!position) return '';
    return `<g class="map-node map-node--${escapeHtml(node.node_type)}" role="button" tabindex="0" data-node-id="${escapeHtml(node.node_id)}" transform="translate(${position.x} ${position.y - 34})">
      <rect width="200" height="68" rx="${node.node_type === 'legal_organization' ? 34 : 3}"></rect>
      <text x="14" y="27">${escapeHtml(shortLabel(node.label))}</text>
      <text class="map-node-amount" x="14" y="49">${escapeHtml(node.amount_cad ? formatCad(node.amount_cad, { compact: true }) : humanizeCategory(node.node_type))}</text>
    </g>`;
  }).join('');
  const focalMarkup = `<g class="map-node map-node--focal map-node--${escapeHtml(focal.node_type)}" transform="translate(490 ${focalY - 48})">
    <rect width="220" height="96" rx="${focal.node_type === 'legal_organization' ? 48 : 3}"></rect>
    <text x="16" y="35">${escapeHtml(shortLabel(focal.label, 36))}</text>
    <text class="map-node-amount" x="16" y="65">${escapeHtml(focal.amount_cad ? formatCad(focal.amount_cad, { compact: true }) : humanizeCategory(focal.node_type))}</text>
  </g>`;
  const scales = [...new Set(view.edges.map((edge) => edge.denominator_id).filter(Boolean))];
  return `<div class="system-map-shell">
    <div class="map-scale">${scales.length ? scales.map((scale) => `<span>Scale: ${escapeHtml(denominatorLabels.get(scale) ?? scale)}${maxima.get(scale) ? ` · ${escapeHtml(formatCad(maxima.get(scale), { compact: true }))}` : ''}</span>`).join('') : '<span>No comparable dollar scale in this neighbourhood</span>'}</div>
    <div class="map-scroll"><svg class="system-map" viewBox="0 0 1000 ${height}" role="img" aria-label="Connections around ${escapeHtml(focal.label)}">
      <defs><marker id="map-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z"></path></marker></defs>
      ${edgeMarkup}${relatedMarkup}${focalMarkup}
    </svg></div>
    <p class="map-count">Showing ${Number(view.shownConnections ?? view.edges.length).toLocaleString('en-CA')} of ${Number(view.totalConnections ?? view.edges.length).toLocaleString('en-CA')} connections${view.hasMore ? '; more are available' : ''}.</p>
  </div>`;
}

function structuredRows(rows, focalId, nodeById) {
  if (!rows.length) return '<p class="muted">None in the current evidence neighbourhood.</p>';
  return `<ul class="structured-list">${rows.map((edge) => {
    const relatedId = edge.source_node_id === focalId ? edge.target_node_id : edge.source_node_id;
    const related = nodeById.get(relatedId);
    const amount = edge.amount_cad === null || edge.amount_cad === undefined
      ? 'Amount not disclosed'
      : formatCad(edge.amount_cad);
    return `<li><button type="button" data-node-id="${escapeHtml(relatedId)}" data-edge-id="${escapeHtml(edge.edge_id)}"><strong>${escapeHtml(related?.label ?? relatedId)}</strong><span>${escapeHtml(humanizeCategory(edge.relationship_type))} · ${escapeHtml(amount)}</span><small>${escapeHtml(humanizeCategory(related?.node_type ?? 'node'))} · ${escapeHtml(humanizeCategory(edge.amount_status))}</small></button></li>`;
  }).join('')}</ul>`;
}

export function renderStructuredNeighbourhood(view) {
  const focalId = view.focalNode.node_id;
  const nodeById = new Map(view.nodes.map((node) => [node.node_id, node]));
  const incoming = view.edges.filter((edge) => edge.target_node_id === focalId);
  const outgoing = view.edges.filter((edge) => edge.source_node_id === focalId);
  const related = view.edges.filter((edge) => edge.source_node_id !== focalId && edge.target_node_id !== focalId);
  return `<div class="structured-neighbourhood">
    <section><h3>Incoming relationships</h3>${structuredRows(incoming, focalId, nodeById)}</section>
    <section><h3>Outgoing relationships</h3>${structuredRows(outgoing, focalId, nodeById)}</section>
    ${related.length ? `<section><h3>Related entities</h3>${structuredRows(related, focalId, nodeById)}</section>` : ''}
  </div>`;
}

export function renderEvidencePanel(focalNode, edges) {
  const disclosed = edges.filter((edge) => edge.amount_status === 'amount_disclosed').length;
  const undisclosed = edges.filter((edge) => edge.amount_status === 'relationship_disclosed_amount_not_disclosed').length;
  const incompatible = edges.filter((edge) => edge.amount_status === 'period_or_scope_incompatible').length;
  return `<div class="evidence-panel"><span class="eyebrow">Evidence stop</span><h3>${escapeHtml(focalNode.label)}</h3>
    <dl><div><dt>Amount-bearing</dt><dd>${disclosed}</dd></div><div><dt>Relationship only</dt><dd>${undisclosed}</dd></div><div><dt>Separate frame</dt><dd>${incompatible}</dd></div></dl>
    <p>${escapeHtml(focalNode.description ?? 'This node shows only relationships that passed the publication gates.')}</p></div>`;
}

function amountRibbon(amount, denominator, extraClass = '') {
  const share = flowWidth(amount, denominator);
  if (share === null) return `<span class="line line--relationship ${extraClass}" aria-hidden="true"></span>`;
  return `<span class="line line--amount ${extraClass}" style="--line-share:${share.toFixed(4)}" aria-hidden="true"></span>`;
}

export function renderOverviewFlow(overview, selectedBucketId = '') {
  return overview.buckets.map((bucket) => {
    const selected = bucket.bucket_id === selectedBucketId;
    return `<button class="flow-ribbon${selected ? ' is-selected' : ''}" type="button"
      data-bucket-id="${escapeHtml(bucket.bucket_id)}" aria-pressed="${selected}"
      style="--flow-share:${Number(bucket.share_percent).toFixed(4)}">
      <span class="flow-ribbon__line" aria-hidden="true"></span>
      <span class="flow-ribbon__text"><strong>${escapeHtml(bucket.label)}</strong><span>${escapeHtml(formatCad(bucket.amount_cad, { compact: true }))}</span></span>
    </button>`;
  }).join('');
}

function renderSpecialRoute(route, denominator) {
  if (route.route_type === 'ontario_health_athome') {
    return `<article class="special-route">
      <h4>${escapeHtml(route.label)}</h4>
      <div class="route-chain route-chain--special">
        <span class="node">Ministry of Health</span>
        <span class="segment"><strong>${escapeHtml(formatCad(route.ministry_to_intermediary_cad, { compact: true }))}</strong>${amountRibbon(route.ministry_to_intermediary_cad, denominator)}</span>
        <span class="node node--intermediary">Ontario Health</span>
        <span class="segment"><strong>${escapeHtml(formatCad(route.intermediary_to_athome_cad, { compact: true }))}</strong>${amountRibbon(route.intermediary_to_athome_cad, denominator)}</span>
        <span class="node node--intermediary">Ontario Health atHome</span>
        <span class="line line--relationship" aria-hidden="true"></span>
        <span class="node">Contracted providers <small>No published amounts</small></span>
      </div>
      <p>${escapeHtml(route.explanation ?? 'Published amounts stop before provider-level contracts.')}</p>
    </article>`;
  }
  const nodes = route.nodes ?? [];
  return `<article class="special-route">
    <h4>${escapeHtml(route.label)}</h4>
    <div class="route-chain route-chain--special">${nodes.map((node, index) => `${index ? '<span class="line line--relationship" aria-hidden="true"></span>' : ''}<span class="node${index > 0 && index < nodes.length - 1 ? ' node--intermediary' : ''}">${escapeHtml(node)}</span>`).join('')}</div>
    <p>${escapeHtml(route.explanation ?? 'No published amount')}</p>
  </article>`;
}

export function renderBucketFlow(bucket, options = {}) {
  const selectedProgramId = options.selectedProgramId || bucket.programs?.[0]?.program_id || '';
  const program = bucket.programs?.find((row) => row.program_id === selectedProgramId) ?? bucket.programs?.[0];
  if (!program) return '<p class="evidence-stop">No published amount</p>';
  const filtered = filterFlowRecipients(program, options);
  const positiveDenominator = program.positive_destination_cad ?? program.amount_cad;
  const signedAdjustment = Number(program.signed_adjustment_cad ?? 0);
  const recipientRows = filtered.rows.map((recipient) => `<button class="recipient-flow" type="button" data-payment-label-id="${escapeHtml(recipient.payment_label_id)}">
      ${amountRibbon(recipient.amount_cad, positiveDenominator)}
      ${recipient.intermediary ? `<span class="node node--intermediary">${escapeHtml(recipient.intermediary)}</span><span class="line line--relationship" aria-hidden="true"></span>` : ''}
      <span class="node node--recipient">${recipient.incoming_bucket_count > 1 ? '<i class="junction-marker" aria-label="Multiple funding routes"></i>' : ''}<strong>${escapeHtml(recipient.recipient_label)}</strong><small>${escapeHtml(formatCad(recipient.amount_cad, { compact: true }))}${recipient.has_financial_profile || recipient.has_profile ? ' · statement available' : ''}</small></span>
    </button>`).join('');
  const evidenceStops = [
    Number(program.aggregate_destination_cad) > 0 ? `<div class="evidence-stop"><strong>Other published destination groups</strong><span>${escapeHtml(formatCad(program.aggregate_destination_cad, { compact: true }))} · recipient names not itemized</span></div>` : '',
    Number(program.withheld_person_cad) > 0 ? `<div class="evidence-stop"><strong>Individual payment records withheld from this product</strong><span>${escapeHtml(formatCad(program.withheld_person_cad, { compact: true }))}</span></div>` : '',
    signedAdjustment < 0 ? `<div class="evidence-stop adjustment-stop"><strong>Signed adjustment</strong><span>${escapeHtml(formatCad(program.signed_adjustment_cad, { compact: true }))} · shown separately from positive destinations</span></div>` : '',
    !recipientRows ? '<div class="evidence-stop"><strong>No published amount</strong><span>No named organization appears under this selected program.</span></div>' : '',
  ].join('');
  return `<div class="bucket-flow">
    <div class="program-tabs" role="list" aria-label="Programs in ${escapeHtml(bucket.label)}">${bucket.programs.map((row) => `<button type="button" data-program-id="${escapeHtml(row.program_id)}" class="program-tab${row.program_id === program.program_id ? ' is-selected' : ''}">${escapeHtml(row.label)} <span>${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</span></button>`).join('')}</div>
    <div class="route-origin"><span class="node node--ministry">${escapeHtml(program.ministry)}</span>${amountRibbon(program.amount_cad, bucket.amount_cad)}<span class="node node--program"><strong>${escapeHtml(program.label)}</strong><small>${signedAdjustment < 0 ? `Net ${escapeHtml(formatCad(program.amount_cad, { compact: true }))} · positive destinations ${escapeHtml(formatCad(positiveDenominator, { compact: true }))}` : escapeHtml(formatCad(program.amount_cad, { compact: true }))}</small></span></div>
    <div class="recipient-flow-list">${recipientRows}${evidenceStops}</div>
    ${filtered.hasMore ? `<button type="button" class="load-more" data-load-more>Show more of ${filtered.total.toLocaleString('en-CA')} recipients</button>` : ''}
    <div class="special-routes">${(bucket.special_routes ?? []).map((route) => renderSpecialRoute(route, bucket.amount_cad)).join('')}</div>
  </div>`;
}

function renderFinancialFlow(profile) {
  if (!profile) return `<aside class="evidence-stop evidence-stop--large"><strong>No published amounts</strong><span>No validated audited revenue-and-expense profile is connected to this published payee label.</span></aside>`;
  return `<div class="statement-flow">
    <section><h3>Reported revenue</h3><strong>${escapeHtml(formatCad(profile.revenue_total_cad, { compact: true }))}</strong>${renderComposition('Revenue buckets', profile.revenue_total_cad, profile.revenue_components)}</section>
    <span class="statement-boundary">Audited reporting entity</span>
    <section><h3>Reported expenses</h3><strong>${escapeHtml(formatCad(profile.expense_total_cad, { compact: true }))}</strong>${renderComposition('Expense buckets', profile.expense_total_cad, profile.expense_components)}</section>
  </div>`;
}

export function renderRecipientDetail(recipient) {
  const routes = recipient.incoming_routes ?? [];
  const denominator = recipient.published_payment_total_cad
    ?? routes.reduce((sum, row) => sum + Number(row.amount_cad || 0), 0);
  const routeMarkup = routes.map((route) => `<div class="incoming-route">
    <span class="node node--ministry">${escapeHtml(route.ministry ?? 'Published funding source')}</span>
    ${amountRibbon(route.amount_cad, denominator)}
    <span class="node node--program"><strong>${escapeHtml(route.bucket_label)}</strong><small>${escapeHtml(route.program_label)} · ${escapeHtml(formatCad(route.amount_cad, { compact: true }))}</small></span>
  </div>`).join('');
  return `<article class="recipient-detail-flow">
    <header><span class="eyebrow">Published recipient trail</span><h2>${escapeHtml(recipient.recipient_label)}</h2></header>
    <div class="incoming-routes">${routeMarkup}</div>
    <div class="funding-junction"><i class="junction-marker"></i><strong>${escapeHtml(recipient.recipient_label)}</strong><span>${routes.length > 1 ? `${routes.length} published routes meet here` : 'Published recipient'}</span></div>
    <p class="boundary-note">The funding trail stops at the recipient. The audited statement below covers the whole reporting entity; its expenses are not assigned back to individual funding streams.</p>
    ${renderFinancialFlow(recipient.financial_profile)}
  </article>`;
}
