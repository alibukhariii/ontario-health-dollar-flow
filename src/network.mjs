const SVG_WIDTH = 1440;
const SVG_HEIGHT = 1480;
const CENTRE_X = SVG_WIDTH / 2;
const CENTRE_Y = 760;
const CATEGORY_RING = 620;
const RECIPIENT_BOUNDARY = 292;
const MOH = 'Ministry Of Health';
const MLTC = 'Ministry Of Long-Term Care';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatCad(value, { precise = false } = {}) {
  const amount = Number(value ?? 0);
  const absolute = Math.abs(amount);
  const options = precise ? { maximumFractionDigits: 1, minimumFractionDigits: 1 } : { maximumFractionDigits: 1 };
  if (absolute >= 1e9) return `$${(amount / 1e9).toLocaleString('en-CA', options)}B`;
  if (absolute >= 1e6) return `$${(amount / 1e6).toLocaleString('en-CA', options)}M`;
  if (absolute >= 1e3) return `$${(amount / 1e3).toLocaleString('en-CA', options)}K`;
  return amount.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}

export function amountRadius(amount, maximum, { minRadius = 2, maxRadius = 72 } = {}) {
  if (Number(maximum) <= 0 || Number(amount) <= 0) return minRadius;
  return Math.max(minRadius, Math.sqrt(Number(amount) / Number(maximum)) * maxRadius);
}

function polar(cx, cy, radius, angle) {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
}

function packRecipients(recipients, cx, cy, boundary) {
  if (!recipients.length) return [];
  const maximum = Math.max(...recipients.map((row) => Number(row.amount_cad)));
  const sized = recipients
    .map((row) => ({ ...row, r: amountRadius(row.amount_cad, maximum, { minRadius: 1.25, maxRadius: 62 }) }))
    .sort((a, b) => b.r - a.r || Number(a.global_rank) - Number(b.global_rank));
  const placed = [];
  const grid = new Map();
  const cellSize = 20;
  const golden = Math.PI * (3 - Math.sqrt(5));
  let extent = 0;
  let occupiedRadiusSquares = 0;

  function cellRange(candidate) {
    return {
      left: Math.floor((candidate.x - candidate.r - 2) / cellSize),
      right: Math.floor((candidate.x + candidate.r + 2) / cellSize),
      top: Math.floor((candidate.y - candidate.r - 2) / cellSize),
      bottom: Math.floor((candidate.y + candidate.r + 2) / cellSize),
    };
  }

  function addToGrid(candidate) {
    const range = cellRange(candidate);
    for (let column = range.left; column <= range.right; column += 1) {
      for (let row = range.top; row <= range.bottom; row += 1) {
        const key = `${column}:${row}`;
        const bucket = grid.get(key) ?? [];
        bucket.push(candidate);
        grid.set(key, bucket);
      }
    }
  }

  function hitsPlaced(candidate) {
    const range = cellRange(candidate);
    const candidates = new Set();
    for (let column = range.left; column <= range.right; column += 1) {
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (const other of grid.get(`${column}:${row}`) ?? []) candidates.add(other);
      }
    }
    for (const other of candidates) {
      if (Math.hypot(candidate.x - other.x, candidate.y - other.y) < candidate.r + other.r + 1.1) return true;
    }
    return false;
  }

  for (const recipient of sized) {
    if (!placed.length) {
      const first = { ...recipient, x: cx, y: cy };
      placed.push(first);
      addToGrid(first);
      extent = first.r;
      occupiedRadiusSquares += first.r ** 2;
      continue;
    }
    let found = null;
    const radialStep = Math.max(2.5, Math.min(6, recipient.r * 0.85));
    const packedRadiusEstimate = Math.sqrt(occupiedRadiusSquares / 0.55);
    const startRadius = Math.max(0, packedRadiusEstimate - recipient.r * 3 - 10);
    for (let radius = startRadius; radius <= boundary - recipient.r && !found; radius += radialStep) {
      const samples = Math.max(12, Math.ceil((Math.PI * 2 * Math.max(radius, 1)) / Math.max(4.5, recipient.r * 1.8)));
      const offset = (Number(recipient.global_rank) * golden) % (Math.PI * 2);
      for (let index = 0; index < samples; index += 1) {
        const angle = offset + index * (Math.PI * 2 / samples);
        const point = polar(cx, cy, radius, angle);
        const candidate = { ...recipient, ...point };
        if (!hitsPlaced(candidate)) {
          found = candidate;
          break;
        }
      }
    }
    if (!found) {
      // This fallback is deterministic and only reached if the source grows beyond the designed density.
      const angle = Number(recipient.global_rank) * golden;
      const radius = Math.max(0, boundary - recipient.r);
      found = { ...recipient, ...polar(cx, cy, radius, angle), r: Math.min(recipient.r, 1.4) };
    }
    placed.push(found);
    addToGrid(found);
    extent = Math.max(extent, Math.hypot(found.x - cx, found.y - cy) + found.r);
    occupiedRadiusSquares += found.r ** 2;
  }
  return placed;
}

function categoryColour(ministryAmounts) {
  const amounts = new Map((ministryAmounts ?? []).map((row) => [row.ministry, Number(row.amount_cad)]));
  const moh = amounts.get(MOH) ?? 0;
  const mltc = amounts.get(MLTC) ?? 0;
  if (moh && mltc) return 'mixed';
  return mltc ? 'mltc' : 'moh';
}

export function layoutFundingNetwork(contract) {
  const categories = contract.categories.map((row, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / contract.categories.length);
    return {
      ...row,
      ...polar(CENTRE_X, CENTRE_Y, CATEGORY_RING, angle),
      angle,
      r: amountRadius(row.amount_cad, contract.positive_published_payments_cad, { minRadius: 24, maxRadius: 158 }),
      colour: categoryColour(row.ministry_amounts),
    };
  });
  const categoryMap = new Map(categories.map((row) => [row.category_id, row]));
  const byCategory = new Map();
  for (const program of contract.programs) {
    const group = byCategory.get(program.category_id) ?? [];
    group.push(program);
    byCategory.set(program.category_id, group);
  }
  const maximumProgram = Math.max(...contract.programs.map((row) => Number(row.amount_cad)), 1);
  const programs = [];
  for (const category of categories) {
    const group = (byCategory.get(category.category_id) ?? []).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
    const sector = Math.PI * 2 / categories.length;
    group.forEach((row, index) => {
      const ring = 370 + (index % 3) * 68;
      const slot = Math.floor(index / 3);
      const direction = slot % 2 === 0 ? 1 : -1;
      const magnitude = Math.ceil(slot / 2) * sector * 0.21;
      const angle = category.angle + direction * magnitude + (index % 3 - 1) * sector * 0.08;
      programs.push({
        ...row,
        ...polar(CENTRE_X, CENTRE_Y, ring, angle),
        angle,
        r: amountRadius(row.amount_cad, maximumProgram, { minRadius: 7, maxRadius: 24 }),
        labelByDefault: index === 0,
      });
    });
  }
  const recipients = packRecipients(contract.recipients, CENTRE_X, CENTRE_Y, RECIPIENT_BOUNDARY);
  return {
    width: SVG_WIDTH,
    height: SVG_HEIGHT,
    cx: CENTRE_X,
    cy: CENTRE_Y,
    recipientBoundary: RECIPIENT_BOUNDARY,
    categories,
    programs,
    recipients,
    categoryById: new Map(categories.map((row) => [row.category_id, row])),
    programByKey: new Map(programs.map((row) => [row.program_key, row])),
    recipientById: new Map(recipients.map((row) => [row.recipient_id, row])),
  };
}

function line(x1, y1, x2, y2, className, extra = '') {
  return `<line class="${className}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${extra}/>`;
}

function wrapLabel(label, max = 22) {
  const words = String(label).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > max) {
      lines.push(current);
      current = word;
    } else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function tspans(lines, x, y, lineHeight, className = '') {
  const offset = -((lines.length - 1) * lineHeight) / 2;
  return lines.map((part, index) => `<tspan class="${className}" x="${x.toFixed(1)}" y="${(y + offset + index * lineHeight).toFixed(1)}">${escapeHtml(part)}</tspan>`).join('');
}

function ministryClass(ministry) {
  return ministry === MLTC ? 'mltc' : 'moh';
}

export function renderFundingNetwork(layout, contract) {
  const categoryProgramLines = layout.programs.map((program) => {
    const category = layout.categoryById.get(program.category_id);
    const width = Math.max(1, Math.sqrt(Number(program.amount_cad) / Number(contract.positive_published_payments_cad)) * 18);
    return line(category.x, category.y, program.x, program.y, `network-edge network-edge--${ministryClass(program.ministry)}`, `stroke-width="${width.toFixed(2)}" marker-end="url(#arrow-${ministryClass(program.ministry)})"`);
  }).join('');
  const defaultLines = contract.default_routes.map((route) => {
    const program = layout.programByKey.get(route.program_key);
    const recipient = layout.recipientById.get(route.recipient_id);
    if (!program || !recipient) return '';
    return line(program.x, program.y, recipient.x, recipient.y, `network-edge network-edge--recipient${recipient.is_intermediary ? ' network-edge--intermediary' : ''}`);
  }).join('');
  const gradients = layout.categories.filter((row) => row.colour === 'mixed').map((category) => {
    const moh = Number(category.ministry_amounts.find((row) => row.ministry === MOH)?.amount_cad ?? 0);
    const total = Number(category.amount_cad);
    const split = total ? (moh / total * 100).toFixed(2) : '50';
    return `<linearGradient id="split-${escapeHtml(category.category_id)}" x1="0" x2="1"><stop offset="${split}%" stop-color="var(--moh)"/><stop offset="${split}%" stop-color="var(--mltc)"/></linearGradient>`;
  }).join('');
  const categoryNodes = layout.categories.map((category) => {
    const fill = category.colour === 'mixed' ? `url(#split-${category.category_id})` : `var(--${category.colour})`;
    const labelX = category.x;
    const labelY = category.y + category.r + 21;
    return `<g class="category-node" data-category-id="${escapeHtml(category.category_id)}">
      <circle cx="${category.x.toFixed(1)}" cy="${category.y.toFixed(1)}" r="${category.r.toFixed(1)}" fill="${fill}"/>
      <text class="category-node__label" text-anchor="middle">${tspans(wrapLabel(category.label, 19), labelX, labelY, 15)}</text>
      <text class="category-node__amount" x="${labelX.toFixed(1)}" y="${(labelY + 31).toFixed(1)}" text-anchor="middle">${formatCad(category.amount_cad)}</text>
    </g>`;
  }).join('');
  const programNodes = layout.programs.map((program) => `<g class="program-node network-program--${ministryClass(program.ministry)}" data-program-key="${escapeHtml(program.program_key)}">
    <title>${escapeHtml(`${program.label}, ${formatCad(program.amount_cad)}`)}</title>
    <circle cx="${program.x.toFixed(1)}" cy="${program.y.toFixed(1)}" r="${program.r.toFixed(1)}"/>
    ${program.labelByDefault ? `<text x="${(program.x + Math.cos(program.angle) * (program.r + 7)).toFixed(1)}" y="${(program.y + Math.sin(program.angle) * (program.r + 7)).toFixed(1)}" text-anchor="middle">${escapeHtml(program.label)}</text>` : ''}
  </g>`).join('');
  const recipientNodes = layout.recipients.map((recipient) => `<g class="recipient-node${recipient.is_intermediary ? ' recipient-node--intermediary' : ''}" data-recipient-id="${escapeHtml(recipient.recipient_id)}" data-recipient-path="${escapeHtml(recipient.path)}" role="button" tabindex="${recipient.label_by_default ? '0' : '-1'}" aria-label="${escapeHtml(`${recipient.label}, ${formatCad(recipient.amount_cad)}, rank ${recipient.global_rank}`)}">
    <circle cx="${recipient.x.toFixed(1)}" cy="${recipient.y.toFixed(1)}" r="${recipient.r.toFixed(1)}"/>
    ${recipient.label_by_default && recipient.r >= 23 ? `<text x="${recipient.x.toFixed(1)}" y="${recipient.y.toFixed(1)}" text-anchor="middle">${tspans(wrapLabel(recipient.label, 15), recipient.x, recipient.y - 2, 12)}<tspan class="recipient-node__amount" x="${recipient.x.toFixed(1)}" y="${(recipient.y + Math.min(recipient.r * 0.54, 27)).toFixed(1)}">${formatCad(recipient.amount_cad)}</tspan></text>` : ''}
  </g>`).join('');
  return `<svg class="funding-network" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="Funding network connecting 14 purposes, published programs and ${contract.named_recipient_count.toLocaleString('en-CA')} named recipients">
    <defs>${gradients}
      <marker id="arrow-moh" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--moh)"/></marker>
      <marker id="arrow-mltc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--mltc)"/></marker>
      <marker id="arrow-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--ink)"/></marker>
    </defs>
    <circle class="orbit orbit--category" cx="${layout.cx}" cy="${layout.cy}" r="${CATEGORY_RING}"/>
    <circle class="orbit orbit--program" cx="${layout.cx}" cy="${layout.cy}" r="455"/>
    <g class="category-program-edges">${categoryProgramLines}</g>
    <g class="default-recipient-edges">${defaultLines}</g>
    <g id="active-routes"></g>
    <g class="category-nodes">${categoryNodes}</g>
    <g class="program-nodes">${programNodes}</g>
    <g class="recipient-nodes">${recipientNodes}</g>
    <text class="network-centre-label" x="${layout.cx}" y="${layout.cy - RECIPIENT_BOUNDARY - 20}" text-anchor="middle">Named recipients</text>
  </svg>
  <div class="network-legend" aria-label="Network legend">
    <span><i class="legend-swatch legend-swatch--moh"></i>Ministry of Health</span>
    <span><i class="legend-swatch legend-swatch--mltc"></i>Ministry of Long-Term Care</span>
    <span><i class="legend-line"></i>Published payment</span>
    <span><i class="legend-line legend-line--dotted"></i>Intermediary</span>
  </div>
  <aside class="not-itemized-callout"><strong>${formatCad(contract.not_itemized_to_public_recipient_cad)}</strong><span>Not itemized to a named recipient · ${escapeHtml(contract.not_itemized_share_percent)}%</span></aside>`;
}

export function renderRecipientFocus(layout, payload) {
  const recipient = layout.recipientById.get(payload.payment_label_id);
  if (!recipient) return { routes: '', tooltip: '' };
  const routes = [...payload.incoming_routes].sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
  const paths = routes.map((route) => {
    const key = `${route.ministry}␟${route.category_id}␟${route.program_label}`;
    const program = layout.programByKey.get(key);
    if (!program) return '';
    const width = Math.max(1.2, Math.sqrt(Number(route.amount_cad) / Number(payload.published_payment_total_cad)) * 8);
    return line(program.x, program.y, recipient.x, recipient.y, `active-route${payload.payee_type === 'intermediary' ? ' active-route--intermediary' : ''}`, `stroke-width="${width.toFixed(2)}" marker-end="url(#arrow-focus)"`);
  }).join('');
  const tooltip = `<div class="network-tooltip__heading"><span>#${escapeHtml(payload.global_rank ?? recipient.global_rank)} · ${escapeHtml(payload.payee_type)}</span><h3>${escapeHtml(payload.display_label ?? payload.published_label)}</h3><strong>${formatCad(payload.published_payment_total_cad)}</strong></div>
    <ol>${routes.map((route) => `<li><span><b>${escapeHtml(route.program_label)}</b><small>${escapeHtml(route.category_label)}</small></span><strong>${formatCad(route.amount_cad)}</strong></li>`).join('')}</ol>
    ${payload.profile_path ? '<button type="button" data-open-profile>View reported revenue and expenses</button>' : ''}`;
  return { routes: paths, tooltip };
}

export function renderNetworkTable(contract) {
  const categories = contract.categories.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td>${formatCad(row.amount_cad)}</td><td>${escapeHtml(row.share_percent)}%</td></tr>`).join('');
  const recipients = contract.recipients.slice(0, 100).map((row) => `<tr><td>${row.global_rank}</td><td>${escapeHtml(row.label)}</td><td>${escapeHtml(row.payee_type)}</td><td>${formatCad(row.amount_cad)}</td></tr>`).join('');
  return `<details class="network-table"><summary>View the data as tables</summary><h3>Funding purposes</h3><table><thead><tr><th>Purpose</th><th>Amount</th><th>Share</th></tr></thead><tbody>${categories}</tbody></table><h3>100 largest named recipients</h3><table><thead><tr><th>Rank</th><th>Recipient</th><th>Type</th><th>Amount</th></tr></thead><tbody>${recipients}</tbody></table></details>`;
}
