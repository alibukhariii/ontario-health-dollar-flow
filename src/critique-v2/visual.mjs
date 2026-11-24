const WIDTH = 1040;
const HEIGHT = 820;
const CX = 520;
const CY = 430;
const RADIUS = 350;
const MOH = 'Ministry Of Health';

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

export function formatCad(value, { exact = false } = {}) {
  const amount = Number(value ?? 0);
  if (exact) return amount.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  const absolute = Math.abs(amount);
  if (absolute >= 1e9) return `$${(amount / 1e9).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}B`;
  if (absolute >= 1e6) return `$${(amount / 1e6).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (absolute >= 1e3) return `$${(amount / 1e3).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  return amount.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
}

export function formatBillions(value) {
  const amount = Number(value ?? 0) / 1e9;
  return `$${amount.toLocaleString('en-CA', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}B`;
}

export function formatMillions(value) {
  const amount = Number(value ?? 0) / 1e6;
  return `$${amount.toLocaleString('en-CA', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}M`;
}

export function buildConcentration(contract, { topCount = 25 } = {}) {
  const recipients = contract.recipients ?? [];
  const largest = Number(recipients[0]?.amount_cad ?? 0);
  const next = recipients.slice(1, topCount).reduce((sum, row) => sum + Number(row.amount_cad), 0);
  const namedTail = recipients.slice(topCount).reduce((sum, row) => sum + Number(row.amount_cad), 0);
  const notItemized = Number(contract.not_itemized_to_public_recipient_cad ?? 0);
  return [
    { id: 'largest', label: recipients[0]?.label ?? 'Largest named recipient', amount: largest, count: largest ? 1 : 0 },
    { id: 'next', label: `Next ${Math.max(0, Math.min(topCount, recipients.length) - 1)} named recipients`, amount: next, count: Math.max(0, Math.min(topCount, recipients.length) - 1) },
    { id: 'named_tail', label: `Other ${Math.max(0, recipients.length - topCount).toLocaleString('en-CA')} named recipients`, amount: namedTail, count: Math.max(0, recipients.length - topCount) },
    { id: 'not_itemized', label: 'Not itemized to a named recipient', amount: notItemized, count: null },
  ];
}

export function groupCategories(contract, visibleCount = 5) {
  const rows = [...(contract.categories ?? [])]
    .sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
  const visible = rows.slice(0, visibleCount).map((row) => ({ ...row, amount_cad: Number(row.amount_cad), payment_line_count: Number(row.payment_line_count ?? 0), members: [row] }));
  const smaller = rows.slice(visibleCount);
  if (!smaller.length) return visible;
  const countWords = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const countLabel = countWords[smaller.length] ?? smaller.length.toLocaleString('en-CA');
  visible.push({
    category_id: '__smaller_purposes__',
    label: `${countLabel} smaller purposes`,
    amount_cad: smaller.reduce((sum, row) => sum + Number(row.amount_cad), 0),
    payment_line_count: smaller.reduce((sum, row) => sum + Number(row.payment_line_count ?? 0), 0),
    members: smaller,
    is_group: true,
  });
  return visible;
}

function amountRadius(amount, maximum, min = 7, max = 54) {
  if (!maximum || !amount) return min;
  return Math.max(min, Math.sqrt(Number(amount) / Number(maximum)) * max);
}

function dominantGroup(recipientId, contract, groupByCategory, programByKey) {
  const totals = new Map();
  for (const route of contract.named_routes ?? []) {
    if (route.recipient_id !== recipientId) continue;
    const program = programByKey.get(route.program_key);
    const group = groupByCategory.get(program?.category_id);
    if (group) totals.set(group.category_id, (totals.get(group.category_id) ?? 0) + Number(route.amount_cad));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '__smaller_purposes__';
}

function placeTopRecipients(rows, groupMap, contract, programByKey) {
  const maximum = Number(rows[0]?.amount_cad ?? 1);
  const placed = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (const [index, row] of rows.entries()) {
    const r = amountRadius(row.amount_cad, maximum);
    let candidate;
    for (let attempt = 0; attempt < 3000; attempt += 1) {
      const angle = attempt * golden + index * 0.7;
      const distance = 30 + 10.8 * Math.sqrt(attempt);
      candidate = { x: CX + Math.cos(angle) * distance, y: CY + 35 + Math.sin(angle) * distance, r };
      const inside = Math.hypot(candidate.x - CX, candidate.y - CY) + r < RADIUS - 18;
      const clear = placed.every((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) >= r + other.r + 7);
      if (inside && clear) break;
    }
    const groupId = dominantGroup(row.recipient_id, contract, groupMap, programByKey);
    placed.push({ ...row, ...candidate, group_id: groupId });
  }
  return placed;
}

function dustPoints(count = 140) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const fraction = (index + 1) / (count + 1);
    const radius = 170 + 150 * Math.sqrt(fraction);
    const angle = index * golden + 0.3;
    points.push({ x: CX + Math.cos(angle) * radius, y: CY + 35 + Math.sin(angle) * radius, r: index % 11 === 0 ? 2.4 : 1.55 });
  }
  return points;
}

export function layoutGlobe(contract) {
  const groups = groupCategories(contract, 5);
  const programByKey = new Map((contract.programs ?? []).map((row) => [row.program_key, row]));
  const groupByCategory = new Map();
  groups.forEach((group, index) => {
    group.index = index;
    group.angle = -1.1 + index * (2.2 / Math.max(1, groups.length - 1));
    group.anchor = { x: CX + Math.sin(group.angle) * 275, y: CY - Math.cos(group.angle) * 275 };
    for (const member of group.members) groupByCategory.set(member.category_id, group);
  });
  const programs = [];
  for (const group of groups) {
    const memberIds = new Set(group.members.map((row) => row.category_id));
    const rows = (contract.programs ?? []).filter((row) => memberIds.has(row.category_id)).sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
    rows.slice(0, 4).forEach((row, index) => {
      const t = 0.28 + index * 0.16;
      programs.push({ ...row, group_id: group.category_id, x: CX + (group.anchor.x - CX) * t, y: 132 + (group.anchor.y - 132) * t, index: index + 1 });
    });
  }
  const recipients = placeTopRecipients((contract.recipients ?? []).slice(0, 25), groupByCategory, contract, programByKey);
  return { width: WIDTH, height: HEIGHT, cx: CX, cy: CY, radius: RADIUS, groups, programs, recipients, dust: dustPoints(), groupByCategory, programByKey };
}

function purposePath(group) {
  return `M ${CX} 112 Q ${CX + (group.anchor.x - CX) * 0.35} 210 ${group.anchor.x.toFixed(1)} ${group.anchor.y.toFixed(1)} Q ${group.anchor.x.toFixed(1)} 580 ${CX + (group.anchor.x - CX) * 0.5} 710`;
}

function nodeShape(row) {
  const className = row.is_intermediary ? ' recipient-node--intermediary' : '';
  const type = String(row.payee_type ?? '').toLowerCase();
  const common = `class="recipient-node${className}" data-recipient-id="${escapeHtml(row.recipient_id)}" tabindex="0" role="button" aria-label="${escapeHtml(`${displayLabel(row.label)}, ${formatCad(row.amount_cad)}, rank ${row.global_rank}`)}"`;
  if (row.is_intermediary) return `<circle ${common} cx="${row.x.toFixed(1)}" cy="${row.y.toFixed(1)}" r="${row.r.toFixed(1)}"/>`;
  if (type.includes('municip')) return `<rect ${common} x="${(row.x - row.r * 0.72).toFixed(1)}" y="${(row.y - row.r * 0.72).toFixed(1)}" width="${(row.r * 1.44).toFixed(1)}" height="${(row.r * 1.44).toFixed(1)}" transform="rotate(45 ${row.x.toFixed(1)} ${row.y.toFixed(1)})"/>`;
  if (type.includes('vendor') || type.includes('pharmacy')) return `<rect ${common} x="${(row.x - row.r).toFixed(1)}" y="${(row.y - row.r).toFixed(1)}" width="${(row.r * 2).toFixed(1)}" height="${(row.r * 2).toFixed(1)}" rx="3"/>`;
  return `<circle ${common} cx="${row.x.toFixed(1)}" cy="${row.y.toFixed(1)}" r="${row.r.toFixed(1)}"/>`;
}

export function renderGlobe(layout, contract) {
  const total = Number(contract.positive_published_payments_cad);
  const meridians = layout.groups.map((group) => {
    const width = Math.max(3, Number(group.amount_cad) / total * 72);
    return `<path class="purpose-meridian${group.is_group ? ' purpose-meridian--grouped' : ''}" data-purpose-id="${escapeHtml(group.category_id)}" d="${purposePath(group)}" stroke-width="${width.toFixed(1)}"><title>${escapeHtml(`${group.label}: ${formatCad(group.amount_cad)}`)}</title></path>`;
  }).join('');
  const programs = layout.programs.map((program) => `<g class="program-mark" data-program-key="${escapeHtml(program.program_key)}"><rect x="${(program.x - 5).toFixed(1)}" y="${(program.y - 5).toFixed(1)}" width="10" height="10"/><title>${escapeHtml(`${displayLabel(program.label)}: ${formatCad(program.amount_cad)}`)}</title></g>`).join('');
  const labelSlots = [
    { x: 805, y: 255, anchor: 'start' }, { x: 805, y: 300, anchor: 'start' }, { x: 805, y: 345, anchor: 'start' },
    { x: 220, y: 255, anchor: 'end' }, { x: 220, y: 300, anchor: 'end' },
  ];
  const labels = layout.recipients.filter((row) => Number(row.global_rank) <= 5).map((row, index) => {
    const slot = labelSlots[index];
    const lineEnd = slot.anchor === 'start' ? slot.x - 8 : slot.x + 8;
    return `<line class="recipient-label__leader" x1="${row.x.toFixed(1)}" y1="${row.y.toFixed(1)}" x2="${lineEnd}" y2="${slot.y - 4}"/><text class="recipient-label" x="${slot.x}" y="${slot.y}" text-anchor="${slot.anchor}">${escapeHtml(displayLabel(row.label))}</text>`;
  }).join('');
  const dust = layout.dust.map((point) => `<circle class="recipient-dust" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${point.r}"/>`).join('');
  return `<svg class="flow-globe" viewBox="0 0 ${layout.width} ${layout.height}" role="group" aria-labelledby="globe-title globe-desc"><title id="globe-title">Ontario health published-payment globe</title><desc id="globe-desc">Purpose meridians connect a ministry hub to visible program marks and the 25 largest named recipients. Dust represents the other named recipients.</desc><defs><pattern id="small-purpose-hatch" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 2L2-2M0 8L8 0M6 10L10 6"/></pattern></defs><circle class="globe-shell" cx="${layout.cx}" cy="${layout.cy}" r="${layout.radius}"/><g aria-label="Purpose meridians">${meridians}</g><g aria-label="Program marks">${programs}</g><g aria-label="Named recipients">${dust}${layout.recipients.map(nodeShape).join('')}${labels}</g><g id="selection-overlay"></g><g class="pole-hub"><circle cx="${CX}" cy="112" r="37"/><text x="${CX}" y="106" text-anchor="middle">MOH + MLTC</text><text x="${CX}" y="124" text-anchor="middle">${formatCad(total)}</text></g><text class="layer-label" x="24" y="38">Purpose meridians</text><text class="layer-label" x="24" y="58">Program marks</text><text class="layer-label" x="24" y="78">Named recipients</text><text class="scale-note" x="1010" y="794" text-anchor="end">Ribbon floor: not to scale below 1%</text></svg>`;
}

function categorySplit(payload) {
  const rows = new Map();
  for (const route of payload.incoming_routes ?? []) {
    const current = rows.get(route.category_id) ?? { id: route.category_id, label: route.category_label, amount: 0 };
    current.amount += Number(route.amount_cad);
    rows.set(route.category_id, current);
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount);
}

export function renderSelectionOverlay(layout, payload) {
  const total = Number(payload.published_payment_total_cad);
  const splits = categorySplit(payload);
  const weighted = splits.reduce((sum, row) => {
    const group = layout.groupByCategory.get(row.id);
    return sum + (group?.anchor.x ?? CX) * row.amount;
  }, 0) / Math.max(1, total);
  const target = { x: Math.max(CX - 240, Math.min(CX + 240, weighted)), y: 410 };
  const lines = (payload.incoming_routes ?? []).map((route) => {
    const program = layout.programByKey.get(`${route.ministry}␟${route.category_id}␟${route.program_label}`);
    const group = layout.groupByCategory.get(route.category_id);
    const source = program ? { x: CX + ((group?.anchor.x ?? CX) - CX) * 0.52, y: 132 + ((group?.anchor.y ?? CY) - 132) * 0.52 } : group?.anchor;
    if (!source) return '';
    const width = Math.max(2, Number(route.amount_cad) / Math.max(1, total) * 22);
    return `<path class="selection-route" d="M ${source.x.toFixed(1)} ${source.y.toFixed(1)} Q ${((source.x + target.x) / 2).toFixed(1)} ${(source.y + target.y - 40).toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}" stroke-width="${width.toFixed(1)}"><title>${escapeHtml(`${displayLabel(route.program_label)}: ${formatCad(route.amount_cad)}`)}</title></path>`;
  }).join('');
  const intermediary = payload.payee_type === 'intermediary' ? ' selection-recipient--intermediary' : '';
  return `${lines}<g class="selection-recipient${intermediary}" transform="translate(${target.x.toFixed(1)} ${target.y.toFixed(1)})"><circle r="26"/><text y="45" text-anchor="middle">${escapeHtml(displayLabel(payload.display_label ?? payload.published_label))}</text></g>`;
}

export function renderAnswerCard(payload, contract, intermediary = null, { comparison = false } = {}) {
  const total = Number(payload.published_payment_total_cad);
  const categories = categorySplit(payload);
  const routes = [...(payload.incoming_routes ?? [])].sort((a, b) => Number(b.amount_cad) - Number(a.amount_cad));
  const split = categories.map((row, index) => {
    const share = total ? row.amount / total * 100 : 0;
    return `<span class="answer-split__segment answer-split__segment--${index % 6}" style="width:${share.toFixed(4)}%" title="${escapeHtml(`${row.label}: ${formatCad(row.amount)}, ${share.toFixed(1)}%`)}"><b>${share >= 12 ? `${share.toFixed(1)}%` : ''}</b></span>`;
  }).join('');
  const answerAmount = total >= 1e9 ? formatBillions : formatMillions;
  const legend = categories.map((row, index) => `<li><i class="answer-key answer-key--${index % 6}"></i><span>${escapeHtml(row.label)}</span><strong title="${escapeHtml(formatCad(row.amount, { exact: true }))}">${answerAmount(row.amount)} · ${(row.amount / Math.max(1, total) * 100).toFixed(1)}%</strong></li>`).join('');
  const programs = routes.slice(0, 8).map((route) => `<li><span><b>${escapeHtml(displayLabel(route.program_label))}</b><small>${escapeHtml(displayLabel(route.ministry))} · ${escapeHtml(route.category_label)}</small></span><strong title="${escapeHtml(formatCad(route.amount_cad, { exact: true }))}">${answerAmount(route.amount_cad)}<small>${(Number(route.amount_cad) / Math.max(1, total) * 100).toFixed(1)}%</small></strong></li>`).join('');
  const outflows = intermediary?.groups?.length ? `<section class="intermediary-frame"><h4>Reported onward and operating expenses</h4><p>These audited-statement amounts use a different reporting frame. They are shown as context and are <strong>not added to the ${formatCad(contract.positive_published_payments_cad)} published-payment total</strong>.</p>${intermediary.groups.map((group) => `<div><span>${escapeHtml(group.group_label)}</span><strong>${formatCad(group.amount_cad)}</strong></div>`).join('')}</section>` : '';
  return `<article class="answer-card${comparison ? ' answer-card--comparison' : ''}" data-answer-recipient="${escapeHtml(payload.payment_label_id)}"><button type="button" class="answer-card__close" data-close-answer aria-label="Close recipient answer">Close</button><p class="eyebrow">Selected recipient</p><h3>${escapeHtml(displayLabel(payload.display_label ?? payload.published_label))}</h3><p class="answer-card__meta"><strong>${formatCad(total)}</strong> · rank ${escapeHtml(payload.global_rank)} of ${contract.named_recipient_count.toLocaleString('en-CA')} · ${escapeHtml(payload.payee_type)}</p><h4>Why its published payments arrived</h4><div class="answer-split" aria-label="Funding-purpose share">${split}</div><ul class="answer-split__key">${legend}</ul><h4>Top published programs</h4><ol class="answer-programs">${programs}</ol>${outflows}<div class="answer-actions"><button type="button" data-compare-recipient>Compare with another recipient</button>${payload.profile_path ? '<button type="button" data-open-profile>View reported revenue and expenses</button>' : ''}</div></article>`;
}
