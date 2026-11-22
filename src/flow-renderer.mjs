import { formatCad } from './app-model.mjs';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function shortLabel(value, length = 30) {
  const text = String(value ?? '');
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function curvePath(row) {
  const mid = (row.source_point.x + row.target_point.x) / 2;
  return `M ${row.source_point.x} ${row.source_point.y} C ${mid} ${row.source_point.y}, ${mid} ${row.target_point.y}, ${row.target_point.x} ${row.target_point.y}`;
}

function amountPath(row) {
  const midX = (row.source_point.x + row.target_point.x) / 2;
  const midY = (row.source_point.y + row.target_point.y) / 2;
  return `<g class="flow-route-group">
    <path data-route-id="${escapeHtml(row.route_id)}" data-source-id="${escapeHtml(row.source_id)}" data-target-id="${escapeHtml(row.target_id)}"
      class="flow-path flow-path--amount" d="${curvePath(row)}" style="--route-width:${Number(row.width ?? 2).toFixed(1)}px"
      aria-label="${escapeHtml(row.relationship_label)}: ${escapeHtml(formatCad(row.amount_cad))}"></path>
    <text class="flow-route-label" x="${midX}" y="${midY - 7}" text-anchor="middle">${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</text>
  </g>`;
}

function relationshipPath(row) {
  return `<path data-route-id="${escapeHtml(row.route_id)}" data-source-id="${escapeHtml(row.source_id)}" data-target-id="${escapeHtml(row.target_id)}"
    data-amount-status="${escapeHtml(row.amount_status)}" class="flow-path flow-path--relationship" d="${curvePath(row)}"
    stroke-dasharray="3 7" aria-label="${escapeHtml(row.relationship_label)}; no compatible published amount"></path>`;
}

function renderNode(row, state, incomingCounts) {
  const selected = row.node_id === state.selectedNodeId;
  const context = state.contextNodeIds?.includes(row.node_id);
  const actionable = state.actionableNodeIds === undefined || state.actionableNodeIds.includes(row.node_id);
  const className = `flow-node flow-node--${escapeHtml(row.node_type)}${actionable ? '' : ' flow-node--static'}${selected ? ' is-selected' : ''}${context ? ' is-context' : ''}`;
  const amount = row.amount_cad === null || row.amount_cad === undefined
    ? ''
    : `<span class="flow-node__amount">${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</span>`;
  const junction = row.node_type === 'recipient' && (incomingCounts.get(row.node_id) ?? 0) > 1
    ? '<i class="junction-marker-svg" aria-label="Multiple published routes"></i>'
    : '';
  const tag = actionable ? 'button' : 'div';
  const type = actionable ? ' type="button"' : '';
  return `<${tag}${type} data-node-id="${escapeHtml(row.node_id)}" class="${className}"
      style="left:${row.x}px;top:${row.y}px;width:${row.width}px;height:${row.height}px"
      aria-label="${escapeHtml(row.label)}${row.amount_cad ? `, ${escapeHtml(formatCad(row.amount_cad))}` : ''}">
    <span class="flow-node__label">${escapeHtml(shortLabel(row.label))}</span>${amount}${junction}
  </${tag}>`;
}

function renderComponentRows(total, components = []) {
  const denominator = Number(total);
  if (!denominator || !components.length) return '<p class="muted">No published component amounts.</p>';
  return `<div class="statement-components">${components.map((row) => {
    const share = Math.max(0, Math.min(100, Number(row.amount_cad) / denominator * 100));
    return `<div class="statement-component"><div><span>${escapeHtml(row.source_label)}</span><strong>${escapeHtml(formatCad(row.amount_cad, { compact: true }))}</strong></div><i style="--component-share:${share.toFixed(3)}%"></i></div>`;
  }).join('')}</div>`;
}

function renderStatementLayer(layout) {
  if (layout.view !== 'recipient') return '';
  if (layout.statement_status !== 'available' || !layout.financial_profile) {
    return `<section class="statement-layer statement-layer--empty"><span class="statement-connector" aria-hidden="true"></span><strong>No published amounts</strong><p>No validated audited revenue-and-expense profile is connected to this published payee label.</p></section>`;
  }
  const profile = layout.financial_profile;
  return `<section class="statement-layer"><span class="statement-connector" aria-hidden="true"></span>
    <div class="statement-layer__heading"><span>Audited reporting entity</span><h3>${escapeHtml(profile.reporting_entity)}</h3><p>Reported accounts cover the whole entity and are not assigned back to individual funding routes.</p></div>
    <div class="statement-columns">
      <article><header><span>Reported revenue</span><strong>${escapeHtml(formatCad(profile.revenue_total_cad, { compact: true }))}</strong></header>${renderComponentRows(profile.revenue_total_cad, profile.revenue_components)}</article>
      <article><header><span>Reported expenses</span><strong>${escapeHtml(formatCad(profile.expense_total_cad, { compact: true }))}</strong></header>${renderComponentRows(profile.expense_total_cad, profile.expense_components)}</article>
    </div>
  </section>`;
}

export function renderConnectedFlow(layout, state = {}) {
  const incomingCounts = new Map();
  for (const row of layout.solid_routes ?? []) {
    incomingCounts.set(row.target_id, (incomingCounts.get(row.target_id) ?? 0) + 1);
  }
  return `<div class="connected-flow" data-flow-view="${escapeHtml(layout.view)}">
    <div class="flow-scale-note">Line widths use the current view’s published-payment denominator. Dotted paths carry no amount.</div>
    <div class="flow-canvas-scroll">
      <div class="flow-canvas-surface" style="width:${layout.width}px;height:${layout.height}px">
        <svg class="flow-canvas-svg" viewBox="0 0 ${layout.width} ${layout.height}" width="${layout.width}" height="${layout.height}" aria-hidden="true">
          <g class="flow-routes">${(layout.solid_routes ?? []).map(amountPath).join('')}${(layout.dotted_routes ?? []).map(relationshipPath).join('')}</g>
        </svg>
        <div class="flow-node-layer">${(layout.nodes ?? []).map((row) => renderNode(row, state, incomingCounts)).join('')}</div>
      </div>
    </div>
    ${renderStatementLayer(layout)}
  </div>`;
}

export function renderStructuredFlow(layout) {
  const rows = layout.structured_rows ?? [];
  const body = rows.length ? rows.map((row) => `<tr>
      <td>${escapeHtml(row.source)}</td>
      <td>${escapeHtml(row.bucket ?? '—')}</td>
      <td>${escapeHtml(row.program ?? row.relationship_label ?? '—')}</td>
      <td>${escapeHtml(row.target)}</td>
      <td>${row.amount_cad === null || row.amount_cad === undefined ? 'No published amounts' : escapeHtml(formatCad(row.amount_cad))}</td>
      <td>${escapeHtml(row.relationship_label ?? row.amount_status)}</td>
    </tr>`).join('') : '<tr><td colspan="6">No published routes in this view.</td></tr>';
  const stop = layout.view === 'recipient' && layout.statement_status !== 'available'
    ? '<p class="structured-evidence-stop"><strong>No published amounts.</strong> No linked audited revenue-and-expense profile is available.</p>'
    : '';
  return `<div class="structured-flow"><table><thead><tr><th>Source</th><th>Bucket</th><th>Program or role</th><th>Destination</th><th>Amount</th><th>Evidence</th></tr></thead><tbody>${body}</tbody></table>${stop}</div>`;
}
