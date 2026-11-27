const SVG_WIDTH = 1760;
const SVG_HEIGHT = 1760;
const CENTRE_X = SVG_WIDTH / 2;
const CENTRE_Y = SVG_HEIGHT / 2;
const CATEGORY_RING = 760;
const PROGRAM_RING = 545;
const RECIPIENT_BOUNDARY = 430;
const MAX_VISIBLE_RECIPIENTS = 24;
const MOH = 'Ministry Of Health';
const MLTC = 'Ministry Of Long-Term Care';
const SMALLER_ID = '__smaller_recipients__';

export function recipientPageSize(contract) {
  return Math.min(Number(contract.displayed_recipient_count) || MAX_VISIBLE_RECIPIENTS, MAX_VISIBLE_RECIPIENTS);
}

export function recipientOffsetForIndex(index, contract) {
  const pageSize = recipientPageSize(contract);
  return Math.floor(Math.max(0, Number(index) || 0) / pageSize) * pageSize;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function displayLabel(value) {
  return String(value ?? '').replace(/\bOf\b/g, 'of').replace(/\bAnd\b/g, 'and');
}

export function formatCad(value) {
  const amount = Number(value ?? 0);
  const absolute = Math.abs(amount);
  const options = { maximumFractionDigits: 1, minimumFractionDigits: 1 };
  if (absolute >= 1e9) return `$${(amount / 1e9).toLocaleString('en-CA', options)}B`;
  if (absolute >= 1e6) return `$${(amount / 1e6).toLocaleString('en-CA', options)}M`;
  if (absolute >= 1e3) return `$${(amount / 1e3).toLocaleString('en-CA', options)}K`;
  return amount.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}

export function amountRadius(amount, maximum, { minRadius = 2, maxRadius = 72 } = {}) {
  if (Number(maximum) <= 0 || Number(amount) <= 0) return minRadius;
  return Math.max(minRadius, Math.sqrt(Number(amount) / Number(maximum)) * maxRadius);
}

function globalRadius(amount, total, minRadius = 8) {
  return amountRadius(amount, total, { minRadius, maxRadius: 180 });
}

function polar(cx, cy, radius, angle) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function packRecipients(recipients, cx, cy, boundary, total) {
  if (!recipients.length) return [];
  const sized = recipients
    .map((row) => ({ ...row, r: globalRadius(row.amount_cad, total, row.aggregate_kind ? 18 : 8) }))
    .sort((a, b) => b.r - a.r || Number(a.global_rank ?? 99999) - Number(b.global_rank ?? 99999));
  const placed = [];
  const grid = new Map();
  const cellSize = 40;
  const golden = Math.PI * (3 - Math.sqrt(5));
  function gridCells(candidate) {
    const cells = [];
    const left = Math.floor((candidate.x - candidate.r - 12) / cellSize);
    const right = Math.floor((candidate.x + candidate.r + 12) / cellSize);
    const top = Math.floor((candidate.y - candidate.r - 12) / cellSize);
    const bottom = Math.floor((candidate.y + candidate.r + 12) / cellSize);
    for (let x = left; x <= right; x += 1) for (let y = top; y <= bottom; y += 1) cells.push(`${x}:${y}`);
    return cells;
  }
  function addToGrid(candidate) {
    for (const key of gridCells(candidate)) {
      const rows = grid.get(key) ?? [];
      rows.push(candidate);
      grid.set(key, rows);
    }
  }
  function collides(candidate) {
    const nearby = new Set();
    for (const key of gridCells(candidate)) for (const row of grid.get(key) ?? []) nearby.add(row);
    return [...nearby].some((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) < candidate.r + other.r + 12);
  }
  for (const recipient of sized) {
    let found = null;
    for (let attempt = 0; attempt < 5000 && !found; attempt += 1) {
      const radius = Math.min(boundary - recipient.r, 6 * Math.sqrt(attempt));
      const angle = attempt * golden + Number(recipient.global_rank ?? attempt) * 0.17;
      const candidate = { ...recipient, ...polar(cx, cy, radius, angle) };
      if (!collides(candidate)) found = candidate;
    }
    if (!found) {
      const angle = Number(recipient.global_rank ?? placed.length) * golden;
      found = { ...recipient, ...polar(cx, cy, Math.max(0, boundary - recipient.r), angle) };
    }
    placed.push(found);
    addToGrid(found);
  }
  return placed;
}

function placeRecipientLabels(recipients, cx, cy, boundary) {
  const labelled = recipients.map((recipient) => ({
    ...recipient,
    labelMode: recipient.aggregate_kind || recipient.r >= 52 ? 'inside' : 'outside',
  }));
  for (const side of [-1, 1]) {
    const rows = labelled
      .filter((row) => row.labelMode === 'outside' && (row.x >= cx ? 1 : -1) === side)
      .sort((a, b) => a.y - b.y || Number(a.global_rank ?? 99999) - Number(b.global_rank ?? 99999));
    if (!rows.length) continue;
    const minimum = cy - boundary + 28;
    const maximum = cy + boundary - 28;
    const gap = Math.min(58, (maximum - minimum) / Math.max(1, rows.length - 1));
    const positions = rows.map((row) => Math.max(minimum, Math.min(maximum, row.y)));
    for (let index = 1; index < positions.length; index += 1) {
      positions[index] = Math.max(positions[index], positions[index - 1] + gap);
    }
    if (positions.at(-1) > maximum) {
      positions[positions.length - 1] = maximum;
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        positions[index] = Math.min(positions[index], positions[index + 1] - gap);
      }
    }
    rows.forEach((row, index) => {
      row.labelX = cx + side * (boundary + 42);
      row.labelY = positions[index];
      row.labelAnchor = side > 0 ? 'start' : 'end';
      row.labelSide = side;
    });
  }
  return labelled;
}

function categoryColour(ministryAmounts) {
  const amounts = new Map((ministryAmounts ?? []).map((row) => [row.ministry, Number(row.amount_cad)]));
  const moh = amounts.get(MOH) ?? 0;
  const mltc = amounts.get(MLTC) ?? 0;
  if (moh && mltc) return 'mixed';
  return mltc ? 'mltc' : 'moh';
}

function typeClass(value) {
  const normalized = String(value ?? '').toLocaleLowerCase('en-CA');
  if (normalized.includes('intermediary')) return 'intermediary';
  if (normalized.includes('government') || normalized.includes('municip')) return 'government';
  if (normalized.includes('vendor') || normalized.includes('pharmacy')) return 'vendor';
  if (normalized.includes('hospital') || normalized.includes('provider') || normalized.includes('care')) return 'provider';
  return 'other';
}

function shortProgramLabel(label) {
  const replacements = new Map([
    ['Payments Made For Services And Care Provided By Physicians And Practitioners', 'Physician and practitioner services'],
    ['Payments Made For Services and Care Provided By Physicians And Practitioners', 'Physician and practitioner services'],
    ['Operation Of Hospitals', 'Operation of Hospitals'],
    ['Long-term Care Transfer Payments', 'Long-term care transfers'],
  ]);
  const clean = displayLabel(replacements.get(label) ?? label);
  return clean.length > 32 ? `${clean.slice(0, 29).trim()}…` : clean;
}

export function layoutFundingNetwork(contract, { recipientOffset = 0, focusedCategoryId = null, focusedProgramKey = null } = {}) {
  const total = contract.positive_published_payments_cad;
  const categories = contract.categories.map((row, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / contract.categories.length);
    return { ...row, ...polar(CENTRE_X, CENTRE_Y, CATEGORY_RING, angle), angle,
      r: globalRadius(row.amount_cad, total, 18), colour: categoryColour(row.ministry_amounts) };
  });
  const byCategory = new Map();
  for (const program of contract.programs) {
    const group = byCategory.get(program.category_id) ?? [];
    group.push(program);
    byCategory.set(program.category_id, group);
  }
  const allPrograms = [];
  for (const category of categories) {
    const group = (byCategory.get(category.category_id) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
    const sector = Math.PI * 2 / categories.length;
    group.forEach((row, index) => {
      const offset = group.length > 1
        ? (index - (group.length - 1) / 2) * (sector * 0.92 / (group.length - 1))
        : 0;
      const angle = category.angle + offset;
      const radialOffset = ((index % 3) - 1) * 38;
      allPrograms.push({ ...row, ...polar(CENTRE_X, CENTRE_Y, PROGRAM_RING + radialOffset, angle),
        angle, r: 9, labelByDefault: index === 0 });
    });
  }
  let programs = allPrograms.map((row) => ({ ...row, isContext: !focusedCategoryId }));
  if (focusedCategoryId) {
    const focusedRows = allPrograms.filter((row) => row.category_id === focusedCategoryId);
    const focusedIndexes = new Map(focusedRows.map((row, index) => [row.program_key, index]));
    programs = allPrograms.map((row) => {
      if (!focusedIndexes.has(row.program_key)) return { ...row, isContext: true, labelByDefault: false };
      const index = focusedIndexes.get(row.program_key);
      return { ...row,
        r: row.program_key === focusedProgramKey ? 20 : 14, labelByDefault: false,
        categoryFocused: true, programIndex: index + 1, isContext: false,
        isSelected: row.program_key === focusedProgramKey };
    });
  }
  const focusedProgram = programs.find((row) => row.program_key === focusedProgramKey) ?? null;
  const programRouteAmounts = new Map();
  if (focusedProgram) {
    for (const route of contract.named_routes ?? []) {
      if (route.program_key !== focusedProgram.program_key) continue;
      programRouteAmounts.set(route.recipient_id, (programRouteAmounts.get(route.recipient_id) ?? 0) + Number(route.amount_cad));
    }
  }
  const recipientUniverse = focusedProgram
    ? [...programRouteAmounts.entries()].map(([recipientId, amount]) => {
      const recipient = contract.recipients.find((row) => row.recipient_id === recipientId);
      return recipient ? { ...recipient, global_amount_cad: recipient.amount_cad, amount_cad: amount, program_amount_cad: amount } : null;
    }).filter(Boolean).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad) || Number(a.global_rank) - Number(b.global_rank))
    : contract.recipients;
  const pageSize = recipientPageSize(contract);
  const offset = Math.max(0, Math.min(Number(recipientOffset) || 0, Math.max(0, recipientUniverse.length - 1)));
  const recipientGroup = recipientUniverse.slice(offset);
  const displayed = recipientGroup.slice(0, pageSize);
  const remaining = recipientGroup.slice(pageSize);
  const recipientScaleTotal = recipientGroup.reduce((sum, row) => sum + Number(row.amount_cad), 0);
  const remainingAmount = remaining.reduce((sum, row) => sum + Number(row.amount_cad), 0);
  const visualRecipients = [
    ...displayed,
    { recipient_id: SMALLER_ID, label: `${remaining.length.toLocaleString('en-CA')} smaller ${remaining.length === 1 ? 'recipient' : 'recipients'}`,
      payee_type: 'aggregated named recipients', amount_cad: remainingAmount, aggregate_kind: 'smaller',
      zoomOffset: offset + pageSize, zoomCount: Math.min(pageSize, remaining.length) },
  ].filter((row) => Number(row.amount_cad) > 0);
  const recipients = placeRecipientLabels(
    packRecipients(visualRecipients, CENTRE_X, CENTRE_Y, RECIPIENT_BOUNDARY, recipientScaleTotal),
    CENTRE_X,
    CENTRE_Y,
    RECIPIENT_BOUNDARY,
  );
  const recipientById = new Map(recipients.map((row) => [row.recipient_id, row]));
  const smaller = recipientById.get(SMALLER_ID);
  for (const recipient of remaining) {
    if (smaller) recipientById.set(recipient.recipient_id, { ...smaller, hiddenRecipientId: recipient.recipient_id });
  }
  const visibleIds = new Set(displayed.map((row) => row.recipient_id));
  const remainingIds = new Set(remaining.map((row) => row.recipient_id));
  const aggregateRoutes = new Map();
  const visibleRoutes = [];
  for (const route of contract.named_routes ?? []) {
    if (focusedProgram && route.program_key !== focusedProgram.program_key) continue;
    if (visibleIds.has(route.recipient_id)) visibleRoutes.push({ ...route, target_type: 'named_recipient' });
    else if (remainingIds.has(route.recipient_id)) {
      aggregateRoutes.set(route.program_key, (aggregateRoutes.get(route.program_key) ?? 0) + Number(route.amount_cad));
    }
  }
  for (const [programKey, amount] of aggregateRoutes) {
    visibleRoutes.push({ recipient_id: SMALLER_ID, program_key: programKey, amount_cad: amount, target_type: 'smaller_recipients' });
  }
  const visibleProgramKeys = new Set(programs.map((row) => row.program_key));
  const filteredRoutes = visibleRoutes.filter((row) => visibleProgramKeys.has(row.program_key));
  const focusedCategory = categories.find((row) => row.category_id === focusedCategoryId) ?? null;
  const focusScale = focusedProgram ? 'recipients' : focusedCategory ? 'programs' : 'categories';
  return { width: SVG_WIDTH, height: SVG_HEIGHT, cx: CENTRE_X, cy: CENTRE_Y,
    recipientBoundary: RECIPIENT_BOUNDARY, categories, programs, allPrograms, recipients,
    recipientOffset: offset, recipientPageSize: pageSize, recipientScaleTotal,
    recipientWindowStart: displayed.length ? offset + 1 : 0, recipientWindowEnd: offset + displayed.length,
    recipientCount: recipientUniverse.length, remainingCount: remaining.length,
    focusedCategoryId, focusedCategory, focusedProgramKey, focusedProgram, focusScale, visibleRoutes: filteredRoutes,
    categoryById: new Map(categories.map((row) => [row.category_id, row])),
    programByKey: new Map(programs.map((row) => [row.program_key, row])), recipientById };
}

function lineBetween(source, target, className, extra = '') {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const startInset = Number(source.r ?? 0) + 2;
  const endInset = Number(target.r ?? 0) + 7;
  const x1 = source.x + dx / distance * startInset;
  const y1 = source.y + dy / distance * startInset;
  const x2 = target.x - dx / distance * endInset;
  const y2 = target.y - dy / distance * endInset;
  return `<line class="${className}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${extra}/>`;
}

function wrapLabel(label, max = 22, maxLines = 3) {
  const words = displayLabel(label).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > max) { lines.push(current); current = word; }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  visible[maxLines - 1] = `${visible[maxLines - 1].replace(/…$/, '')}…`;
  return visible;
}

function tspans(lines, x, y, lineHeight, className = '') {
  const offset = -((lines.length - 1) * lineHeight) / 2;
  return lines.map((part, index) => `<tspan class="${className}" x="${x.toFixed(1)}" y="${(y + offset + index * lineHeight).toFixed(1)}">${escapeHtml(part)}</tspan>`).join('');
}

function ministryClass(ministry) { return ministry === MLTC ? 'mltc' : 'moh'; }
function routeWidth(amount, total, { minimum = 1.1, maximum = 16 } = {}) {
  if (Number(total) <= 0 || Number(amount) <= 0) return minimum;
  const share = Math.max(0, Math.min(1, Number(amount) / Number(total)));
  return minimum + Math.pow(share, 0.4) * (maximum - minimum);
}

function recipientNode(recipient) {
  const aggregateClass = recipient.aggregate_kind ? ` recipient-node--${recipient.aggregate_kind.replace('_', '-')}` : '';
  const intermediaryClass = recipient.is_intermediary ? ' recipient-node--intermediary' : '';
  const type = ` recipient-node--type-${typeClass(recipient.payee_type)}`;
  const interactive = !recipient.aggregate_kind;
  const zoomControl = recipient.aggregate_kind === 'smaller';
  const insideLabel = recipient.labelMode === 'inside';
  const controlAttributes = interactive
    ? `data-recipient-id="${escapeHtml(recipient.recipient_id)}" data-recipient-path="${escapeHtml(recipient.path)}" role="button" tabindex="0"`
    : zoomControl ? `data-recipient-zoom-offset="${recipient.zoomOffset}" role="button" tabindex="0"` : '';
  const zoomHint = zoomControl ? `Zoom to next ${Number(recipient.zoomCount).toLocaleString('en-CA')}` : '';
  const scaleClass = recipient.isContext ? ' is-context' : recipient.isScaleActive ? ' is-scale-active' : '';
  const outsideLines = insideLabel ? [] : wrapLabel(recipient.label, 21, 3);
  const leaderEndX = insideLabel ? recipient.x : recipient.labelX - recipient.labelSide * 9;
  const leaderEndY = insideLabel ? recipient.y : recipient.labelY;
  return `<g class="recipient-node${aggregateClass}${intermediaryClass}${type}${scaleClass}" data-visual-recipient-id="${escapeHtml(recipient.recipient_id)}" data-payee-type="${escapeHtml(recipient.payee_type)}" ${controlAttributes} aria-label="${escapeHtml(`${displayLabel(recipient.label)}, ${formatCad(recipient.amount_cad)}${recipient.global_rank ? `, rank ${recipient.global_rank}` : ''}${zoomControl ? `, ${zoomHint}` : ''}`)}">
    <circle cx="${recipient.x.toFixed(1)}" cy="${recipient.y.toFixed(1)}" r="${recipient.r.toFixed(1)}"/>
    ${insideLabel ? `<text x="${recipient.x.toFixed(1)}" y="${recipient.y.toFixed(1)}" text-anchor="middle">${tspans(wrapLabel(recipient.label, recipient.aggregate_kind ? 21 : 16), recipient.x, recipient.y - (zoomControl ? 17 : 7), 14)}<tspan class="recipient-node__amount" x="${recipient.x.toFixed(1)}" y="${(recipient.y + Math.min(recipient.r * 0.38, 23)).toFixed(1)}">${formatCad(recipient.amount_cad)}</tspan>${zoomControl ? `<tspan class="recipient-node__hint" x="${recipient.x.toFixed(1)}" y="${(recipient.y + Math.min(recipient.r * 0.62, 40)).toFixed(1)}">${escapeHtml(zoomHint)}</tspan>` : ''}</text>` : `<line class="recipient-node__label-leader" x1="${recipient.x.toFixed(1)}" y1="${recipient.y.toFixed(1)}" x2="${leaderEndX.toFixed(1)}" y2="${leaderEndY.toFixed(1)}" marker-end="url(#arrow-label)"/><text class="recipient-node__external-label" x="${recipient.labelX.toFixed(1)}" y="${recipient.labelY.toFixed(1)}" text-anchor="${recipient.labelAnchor}">${tspans(outsideLines, recipient.labelX, recipient.labelY - 7, 13)}<tspan class="recipient-node__amount" x="${recipient.labelX.toFixed(1)}" y="${(recipient.labelY + outsideLines.length * 6 + 11).toFixed(1)}">${formatCad(recipient.amount_cad)}</tspan></text>`}
  </g>`;
}

export function renderFundingNetwork(layout, contract) {
  const categoryProgramDenominator = Number(layout.focusedCategory?.amount_cad ?? contract.positive_published_payments_cad);
  const categoryProgramLines = layout.programs.map((program) => {
    const category = layout.categoryById.get(program.category_id);
    return lineBetween(category, program, `network-edge network-edge--${ministryClass(program.ministry)}${program.isContext ? ' is-context' : ''}${program.isSelected ? ' is-selected' : ''}`,
      `stroke-width="${routeWidth(program.amount_cad, categoryProgramDenominator, { maximum: 14 }).toFixed(2)}" marker-end="url(#arrow-${ministryClass(program.ministry)})"`);
  }).join('');
  const defaultLines = layout.visibleRoutes.map((route) => {
    const program = layout.programByKey.get(route.program_key);
    const recipient = layout.recipientById.get(route.recipient_id);
    if (!program || !recipient) return '';
    const intermediary = recipient.is_intermediary ? ' network-edge--intermediary' : '';
    const administered = route.intermediary_context ? ' network-edge--administered' : '';
    const focused = layout.focusedProgramKey && route.program_key === layout.focusedProgramKey ? ' is-selected' : '';
    const context = focused ? '' : ' is-context';
    return lineBetween(program, recipient, `network-edge network-edge--recipient${intermediary}${administered}${focused}${context}`,
      `data-target_type="${escapeHtml(route.target_type)}" stroke-width="${routeWidth(route.amount_cad, layout.recipientScaleTotal, { maximum: 13 }).toFixed(2)}" marker-end="url(#arrow-recipient)"`);
  }).join('');
  const gradients = layout.categories.filter((row) => row.colour === 'mixed').map((category) => {
    const moh = Number(category.ministry_amounts.find((row) => row.ministry === MOH)?.amount_cad ?? 0);
    const split = Number(category.amount_cad) ? (moh / Number(category.amount_cad) * 100).toFixed(2) : '50';
    return `<linearGradient id="split-${escapeHtml(category.category_id)}" x1="0" x2="1"><stop offset="${split}%" stop-color="var(--moh)"/><stop offset="${split}%" stop-color="var(--mltc)"/></linearGradient>`;
  }).join('');
  const categoryNodes = layout.categories.map((category) => {
    const fill = category.colour === 'mixed' ? `url(#split-${category.category_id})` : `var(--${category.colour})`;
    const labelLines = wrapLabel(category.label, 19, 3);
    const leaderStart = polar(category.x, category.y, category.r + 8, category.angle);
    const leaderEnd = polar(category.x, category.y, category.r + 50, category.angle);
    const outward = polar(category.x, category.y, category.r + 96, category.angle);
    const amountY = outward.y + ((labelLines.length - 1) * 16) / 2 + 25;
    const selected = layout.focusedCategoryId === category.category_id ? ' is-category-selected' : '';
    const context = layout.focusedCategoryId && !selected ? ' is-context' : '';
    return `<g class="category-node${selected}${context}" data-category-id="${escapeHtml(category.category_id)}" role="button" tabindex="0" aria-label="${escapeHtml(`${displayLabel(category.label)}, ${formatCad(category.amount_cad)}. Select to spread out its programs.`)}"><line class="category-node__hit" x1="${category.x.toFixed(1)}" y1="${category.y.toFixed(1)}" x2="${outward.x.toFixed(1)}" y2="${amountY.toFixed(1)}"/><line class="category-node__leader" x1="${leaderStart.x.toFixed(1)}" y1="${leaderStart.y.toFixed(1)}" x2="${leaderEnd.x.toFixed(1)}" y2="${leaderEnd.y.toFixed(1)}"/><circle cx="${category.x.toFixed(1)}" cy="${category.y.toFixed(1)}" r="${category.r.toFixed(1)}" fill="${fill}"/><text class="category-node__label text-halo" text-anchor="middle">${tspans(labelLines, outward.x, outward.y, 16)}</text><text class="category-node__amount text-halo" x="${outward.x.toFixed(1)}" y="${amountY.toFixed(1)}" text-anchor="middle">${formatCad(category.amount_cad)}</text></g>`;
  }).join('');
  const programNodes = layout.programs.map((program) => {
    const labelPoint = polar(program.x, program.y, program.categoryFocused ? 58 : 42, program.angle);
    const anchor = Math.cos(program.angle) > 0.25 ? 'start' : Math.cos(program.angle) < -0.25 ? 'end' : 'middle';
    const lines = program.categoryFocused ? wrapLabel(program.label, 26, 4) : [shortProgramLabel(program.label)];
    const focusedIndex = program.categoryFocused
      ? `<text class="program-node__index" x="${program.x.toFixed(1)}" y="${(program.y + 4).toFixed(1)}" text-anchor="middle">${program.programIndex}</text>` : '';
    const state = `${program.isContext ? ' is-context' : ''}${program.isSelected ? ' is-selected' : program.categoryFocused ? ' is-scale-active' : ''}`;
    return `<g class="program-node${state} network-program--${ministryClass(program.ministry)}" data-program-key="${escapeHtml(program.program_key)}" role="button" tabindex="0" aria-label="${escapeHtml(`${displayLabel(program.label)}, ${formatCad(program.amount_cad)}. Select to view its named recipients.`)}"><title>${escapeHtml(`${displayLabel(program.label)}, ${formatCad(program.amount_cad)}`)}</title><circle cx="${program.x.toFixed(1)}" cy="${program.y.toFixed(1)}" r="${program.r.toFixed(1)}"/>${focusedIndex}${program.labelByDefault ? `<text class="program-node__label text-halo" text-anchor="${anchor}">${tspans(lines, labelPoint.x, labelPoint.y, 16)}</text>` : ''}</g>`;
  }).join('');
  const focusedCategoryPrograms = layout.programs.filter((row) => row.category_id === layout.focusedCategoryId);
  const focusedStatus = layout.focusedProgram
    ? `<div class="program-focus-status network-view-status"><button type="button" data-program-focus-back>Back to ${escapeHtml(layout.focusedCategory.label)} programs</button><span>Recipients of <strong>${escapeHtml(displayLabel(layout.focusedProgram.label))}</strong></span></div>`
    : layout.focusedCategory
    ? `<div class="program-focus-status network-view-status"><button type="button" data-program-focus-back>All funding purposes</button><span>Showing ${focusedCategoryPrograms.length} ${focusedCategoryPrograms.length === 1 ? 'program' : 'programs'} in <strong>${escapeHtml(layout.focusedCategory.label)}</strong></span></div>`
    : '<p class="network-view-prompt">Select a funding purpose to spread out and read every program.</p>';
  const programFocusList = layout.focusedCategory && !layout.focusedProgram
    ? `<ol class="program-focus-list" aria-label="Programs in ${escapeHtml(layout.focusedCategory.label)}">${focusedCategoryPrograms.map((program) => `<li class="program-focus-list__item" data-program-key="${escapeHtml(program.program_key)}" role="button" tabindex="0"><span class="program-focus-list__index">${program.programIndex}</span><span><strong>${escapeHtml(displayLabel(program.label))}</strong><small>${escapeHtml(displayLabel(program.ministry))}</small>${Number(program.intermediary_amount_cad) ? `<small class="program-focus-list__intermediary">${formatCad(program.intermediary_amount_cad)} published under an intermediary</small>` : ''}</span><b>${formatCad(program.amount_cad)}</b></li>`).join('')}</ol>`
    : '';
  const intermediaryStop = layout.focusedProgram && Number(layout.focusedProgram.intermediary_amount_cad)
    ? `<aside class="intermediary-evidence-stop" aria-label="Intermediary evidence stop"><span>Published under an intermediary</span><strong>${formatCad(layout.focusedProgram.intermediary_amount_cad)}</strong><p>The public payment record names the intermediary. A complete recipient-level allocation is not published, so this amount stops here.</p></aside>`
    : '';
  const zoomBack = layout.recipientOffset > 0
    ? `<button type="button" data-recipient-zoom-back="${Math.max(0, layout.recipientOffset - layout.recipientPageSize)}">Back one recipient level</button>` : '';
  const zoomStatus = `<div class="recipient-zoom-status network-view-status">${zoomBack}<span>Ranks ${layout.recipientWindowStart}–${layout.recipientWindowEnd} of ${layout.recipientCount.toLocaleString('en-CA')} named organizations</span></div>`;
  const note = contract.intermediary_note ?? {};
  const sourceLink = note.source_url
    ? `<a href="${escapeHtml(note.source_url)}">Ontario Health’s 2025–26 audited statements</a>`
    : 'Ontario Health’s 2025–26 audited statements';
  const athomeSourceLink = note.athome_source_url
    ? `<a href="${escapeHtml(note.athome_source_url)}">Ontario Health atHome’s 2025–26 audited statements</a>`
    : 'Ontario Health atHome’s 2025–26 audited statements';
  const coverageNote = note.source_url
    ? `<aside class="recipient-coverage-note"><details class="intermediary-figures"><summary>How intermediaries fit in</summary><p>Public Accounts lists ${formatCad(note.ontario_health_public_accounts_amount_cad)} paid to Ontario Health. Ontario Health reports ${formatCad(note.ontario_health_reported_expense_total_cad)} in expenses, including ${formatCad(note.ontario_health_passed_on_cad)} in transfers and ${formatCad(note.ontario_health_own_operations_cad)} for its own operations. The ${formatCad(note.ontario_health_transfer_gap_vs_public_accounts_cad)} difference reflects funding Ontario Health oversees that ministries may pay directly; these published views overlap and are not amounts to add together. Ontario Health atHome reports ${formatCad(note.ontario_health_athome_reported_expense_total_cad)} in expenses, including ${formatCad(note.ontario_health_athome_contracted_services_cad)} in contracted care. Do not add these figures to recipient amounts.</p><p>Sources: ${sourceLink}; ${athomeSourceLink}.</p></details><nav class="evidence-links" aria-label="Evidence and project information"><a href="https://github.com/alibukhariii/ontario-health-dollar-flow/blob/main/docs/METHODOLOGY.md">Methodology</a><a href="https://github.com/alibukhariii/ontario-health-dollar-flow/blob/main/docs/LIMITATIONS.md">Limitations</a><a href="https://github.com/alibukhariii/ontario-health-dollar-flow/tree/main/data/derived">Download data</a><a href="https://github.com/alibukhariii/ontario-health-dollar-flow/issues/new?template=data-error.yml">Report a data error</a><a href="https://github.com/alibukhariii/ontario-health-dollar-flow/blob/main/docs/CORRECTIONS.md">Corrections</a></nav><p class="source-attribution">Payment data: Ontario Public Accounts 2025–26, © King’s Printer for Ontario, used under the <a href="https://www.ontario.ca/page/terms-use">Ontario.ca Terms of Use</a>. This project is not endorsed by the Government of Ontario.</p></aside>`
    : '';
  const scaleGuide = `<p class="network-guidance">Hover, focus or search to reveal every published route into an organization.</p><p class="taxonomy-note">Funding purposes are project groupings; program names come from published records.</p><div class="network-scale" aria-label="Current network scale"><span class="scale-step scale-step--categories"${layout.focusScale === 'categories' ? ' aria-current="step"' : ''}>1 · Funding purposes</span><span class="scale-step scale-step--programs"${layout.focusScale === 'programs' ? ' aria-current="step"' : ''}>2 · Programs</span><span class="scale-step scale-step--recipients"${layout.focusScale === 'recipients' ? ' aria-current="step"' : ''}>3 · Named recipients</span></div>`;
  const recipientRows = layout.recipients.map((recipient) => recipientNode({ ...recipient, isContext: layout.focusScale !== 'recipients', isScaleActive: layout.focusScale === 'recipients' })).join('');
  return `${scaleGuide}${focusedStatus}${programFocusList}${intermediaryStop}${zoomStatus}<svg class="funding-network" data-focus-scale="${layout.focusScale}" viewBox="-140 -160 ${layout.width + 280} ${layout.height + 320}" role="group" aria-labelledby="network-svg-title network-svg-desc"><title id="network-svg-title">Ontario health-ministry published-payment network</title><desc id="network-svg-desc">Fourteen funding purposes connect to published programs and a zoomable view of named recipients. The selected scale is emphasized while the other system layers remain visible as context.</desc><defs>${gradients}<pattern id="vendor-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#c8c8c3" stroke-width="2"/></pattern><marker id="arrow-moh" markerUnits="userSpaceOnUse" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="16" markerHeight="16" orient="auto"><path d="M0 0L12 6L0 12z" fill="var(--moh)"/></marker><marker id="arrow-mltc" markerUnits="userSpaceOnUse" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="16" markerHeight="16" orient="auto"><path d="M0 0L12 6L0 12z" fill="var(--mltc)"/></marker><marker id="arrow-recipient" markerUnits="userSpaceOnUse" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="15" markerHeight="15" orient="auto"><path d="M0 0L12 6L0 12z" fill="#555"/></marker><marker id="arrow-focus" markerUnits="userSpaceOnUse" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="15" markerHeight="15" orient="auto"><path d="M0 0L12 6L0 12z" fill="var(--ink)"/></marker><marker id="arrow-label" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#555"/></marker></defs><g class="category-program-edges">${categoryProgramLines}</g><g class="default-recipient-edges">${defaultLines}</g><g id="active-routes"></g><g class="category-nodes">${categoryNodes}</g><g class="program-nodes">${programNodes}</g><g class="recipient-nodes">${recipientRows}</g></svg><div class="network-footer"><div class="network-legend" aria-label="Network legend"><span><i class="legend-swatch legend-swatch--moh"></i>Ministry of Health</span><span><i class="legend-swatch legend-swatch--mltc"></i>Ministry of Long-Term Care</span><span><i class="legend-line"></i>Published payment</span><span><i class="legend-line legend-line--dotted"></i>Ontario Health or Ontario Health atHome helped transfer some or all of this funding; exact share not published. Line width shows recipient amount.</span><span><i class="legend-outline legend-outline--provider"></i>Provider</span><span><i class="legend-outline legend-outline--government"></i>Government or municipality</span><span><i class="legend-outline legend-outline--vendor"></i>Vendor</span></div>${coverageNote}</div>${renderMobileNetwork(contract)}`;
}

export function renderRecipientFocus(layout, payload) {
  const recipient = layout.recipientById.get(payload.payment_label_id);
  if (!recipient) return { routes: '', tooltip: '', visualRecipientId: null };
  const routes = [...payload.incoming_routes].sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
  const paths = routes.map((route) => {
    const program = layout.programByKey.get(`${route.ministry}␟${route.category_id}␟${route.program_label}`);
    if (!program) return '';
    const width = routeWidth(route.amount_cad, payload.published_payment_total_cad, { maximum: 13 }).toFixed(2);
    return route.intermediary_context
      ? lineBetween(program, recipient, 'active-route active-route--administered',
        `stroke-width="${width}" marker-end="url(#arrow-focus)" data-intermediary="${escapeHtml(route.intermediary_context.label)}"`)
      : lineBetween(program, recipient, 'active-route',
        `stroke-width="${width}" marker-end="url(#arrow-focus)"`);
  }).join('');
  const total = Number(payload.published_payment_total_cad);
  const routeRow = (route) => {
    const share = total ? Number(route.amount_cad) / total * 100 : 0;
    return `<li><i class="ministry-chip ministry-chip--${ministryClass(route.ministry)}" aria-label="${escapeHtml(displayLabel(route.ministry))}"></i><span><b>${escapeHtml(displayLabel(route.program_label))}</b><small>${escapeHtml(displayLabel(route.category_label))}</small><span class="route-share"><i style="width:${share.toFixed(2)}%"></i></span></span><strong>${formatCad(route.amount_cad)}<small>${share.toFixed(1)}%</small></strong></li>`;
  };
  const rows = routes.slice(0, 8).map(routeRow).join('');
  const moreRoutes = routes.slice(8);
  const more = moreRoutes.length ? `<details class="network-tooltip__more"><summary>Show ${moreRoutes.length} more published routes</summary><ol start="9">${moreRoutes.map(routeRow).join('')}</ol></details>` : '';
  const sourceLinks = payload.source?.url
    ? `<nav class="recipient-source-links" aria-label="Recipient payment evidence"><a href="${escapeHtml(payload.source.url)}" target="_blank" rel="noopener">Open the Ontario Public Accounts payment schedule</a><a href="https://github.com/alibukhariii/ontario-health-dollar-flow/blob/main/data/derived/recipient-funding-routes.csv" target="_blank" rel="noopener">Download the recipient route data (CSV)</a></nav>`
    : '';
  const tooltip = `<button type="button" class="network-tooltip__close" data-close-tooltip aria-label="Close recipient details">Close</button><div class="network-tooltip__heading"><span>#${escapeHtml(payload.global_rank ?? recipient.global_rank)} · ${escapeHtml(payload.payee_type)}</span><h3>${escapeHtml(displayLabel(payload.display_label ?? payload.published_label))}</h3><strong>${formatCad(payload.published_payment_total_cad)}</strong></div><ol>${rows}</ol>${more}${sourceLinks}${payload.profile_path ? '<button type="button" data-open-profile>View reported revenue and expenses</button>' : ''}`;
  return {
    routes: paths,
    tooltip,
    visualRecipientId: recipient.recipient_id,
    programKeys: routes.map((route) => `${route.ministry}␟${route.category_id}␟${route.program_label}`),
    categoryIds: [...new Set(routes.map((route) => route.category_id))],
  };
}

export function renderMobileNetwork(contract) {
  const recipients = new Map(contract.recipients.map((row) => [row.recipient_id, row]));
  const routesByProgram = new Map();
  for (const route of contract.default_routes) { const rows = routesByProgram.get(route.program_key) ?? []; rows.push(route); routesByProgram.set(route.program_key, rows); }
  const programsByCategory = new Map();
  for (const program of contract.programs) { const rows = programsByCategory.get(program.category_id) ?? []; rows.push(program); programsByCategory.set(program.category_id, rows); }
  return `<div class="mobile-network" aria-label="Mobile funding network">${contract.categories.map((category) => {
    const programs = (programsByCategory.get(category.category_id) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
    return `<details class="mobile-category"><summary><span>${escapeHtml(category.label)}</span><strong>${formatCad(category.amount_cad)}</strong></summary><div>${programs.map((program) => {
      const routes = (routesByProgram.get(program.program_key) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
      const named = routes.filter((route) => route.target_type === 'named_recipient').slice(0, 5);
      const grouped = routes.filter((route) => route.target_type === 'smaller_recipients');
      const intermediary = routes.filter((route) => route.target_type === 'intermediary_stop');
      const notItemized = routes.filter((route) => route.target_type === 'not_itemized');
      return `<section class="mobile-program"><h3>${escapeHtml(displayLabel(program.label))}<span>${formatCad(program.amount_cad)}</span></h3><ul>${named.map((route) => {
        const recipient = recipients.get(route.recipient_id);
        return `<li><button type="button" data-recipient-id="${escapeHtml(route.recipient_id)}"><span>${escapeHtml(displayLabel(recipient?.label ?? 'Named recipient'))}</span><strong>${formatCad(route.amount_cad)}</strong></button></li>`;
      }).join('')}${grouped.map((route) => `<li><span>Other smaller named recipients</span><strong>${formatCad(route.amount_cad)}</strong></li>`).join('')}${intermediary.map((route) => `<li class="mobile-program__stop"><span>Published under an intermediary; downstream allocation unavailable</span><strong>${formatCad(route.amount_cad)}</strong></li>`).join('')}${notItemized.map((route) => `<li class="mobile-program__stop"><span>Not itemized to a named payee</span><strong>${formatCad(route.amount_cad)}</strong></li>`).join('')}</ul></section>`;
    }).join('')}</div></details>`;
  }).join('')}</div>`;
}

export function renderNetworkTable(contract) {
  const categories = contract.categories.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${formatCad(row.amount_cad)}</td><td>${escapeHtml(row.share_percent)}%</td></tr>`).join('');
  const recipients = contract.recipients.slice(0, 100).map((row) => `<tr data-table-recipient-type="${escapeHtml(row.payee_type)}"><td>${row.global_rank}</td><td><a href="recipient/${escapeHtml(row.recipient_id)}/">${escapeHtml(displayLabel(row.label))}</a></td><td>${escapeHtml(row.payee_type)}</td><td>${formatCad(row.amount_cad)}</td></tr>`).join('');
  return `<details class="network-table"><summary>View the data as tables</summary><h3>Funding purposes</h3><table><thead><tr><th>Purpose</th><th>Amount</th><th>Share</th></tr></thead><tbody>${categories}</tbody></table><h3>100 largest named organizations</h3><table><thead><tr><th>Rank</th><th>Organization</th><th>Type</th><th>Amount</th></tr></thead><tbody>${recipients}</tbody></table><p><a href="recipients/">Browse all ${contract.named_recipient_count.toLocaleString('en-CA')} named organizations</a></p></details>`;
}
