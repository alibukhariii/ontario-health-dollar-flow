export function formatCad(value, { compact = false } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  if (compact) {
    const absolute = Math.abs(amount);
    if (absolute >= 1_000_000_000) return `${amount < 0 ? '-' : ''}$${(absolute / 1_000_000_000).toFixed(1)}B`;
    if (absolute >= 1_000_000) return `${amount < 0 ? '-' : ''}$${(absolute / 1_000_000).toFixed(1)}M`;
    if (absolute >= 1_000) return `${amount < 0 ? '-' : ''}$${(absolute / 1_000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function humanizeCategory(value) {
  if (!value) return 'All services';
  const text = value.replaceAll('_', ' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function flowWidth(amount, denominator) {
  if (amount === null || amount === undefined || amount === '') return null;
  const numerator = Math.abs(Number(amount));
  const total = Math.abs(Number(denominator));
  if (!Number.isFinite(numerator) || !Number.isFinite(total) || total === 0) return null;
  return Math.min(100, numerator / total * 100);
}

export function filterFlowRecipients(program, options = {}) {
  const { query = '', limit = 40, offset = 0 } = options;
  const normalized = query.trim().toLocaleLowerCase('en-CA');
  const matching = [...(program?.recipients ?? [])]
    .filter((row) => !normalized || row.recipient_label.toLocaleLowerCase('en-CA').includes(normalized))
    .sort((left, right) => Number(right.amount_cad) - Number(left.amount_cad)
      || left.recipient_label.localeCompare(right.recipient_label));
  const rows = matching.slice(offset, offset + limit);
  return {
    rows,
    total: matching.length,
    hasMore: offset + rows.length < matching.length,
  };
}

export function filterCategoryDestinations(category, options = {}) {
  const { query = '', limit = 80, offset = 0 } = options;
  const normalized = query.trim().toLocaleLowerCase('en-CA');
  const matching = (category?.programs ?? []).flatMap((program) => (program.destinations ?? []).map((destination) => ({
    ...destination,
    program_id: program.program_id,
    program_label: program.label,
    ministry: program.ministry,
  }))).filter((row) => {
    if (!normalized) return true;
    return [row.label, row.program_label, row.ministry]
      .some((value) => String(value ?? '').toLocaleLowerCase('en-CA').includes(normalized));
  }).sort((left, right) => Number(right.amount_cad) - Number(left.amount_cad)
    || left.label.localeCompare(right.label)
    || left.program_label.localeCompare(right.program_label));

  const rows = matching.slice(offset, offset + limit);
  return {
    rows,
    total: matching.length,
    hasMore: offset + rows.length < matching.length,
  };
}

const FLOW_V2_PAGES = new Set(['landing', 'categories', 'programs', 'recipients', 'profile']);

export function parseFlowV2State(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const page = params.get('page');
  return {
    page: FLOW_V2_PAGES.has(page) ? page : 'landing',
    category: params.get('category') || null,
    program: params.get('program') || null,
    payee: params.get('payee') || null,
  };
}

export function serializeFlowV2State(state = {}) {
  const params = new URLSearchParams();
  if (state.page && state.page !== 'landing' && FLOW_V2_PAGES.has(state.page)) params.set('page', state.page);
  if (state.category) params.set('category', state.category);
  if (state.program) params.set('program', state.program);
  if (state.payee) params.set('payee', state.payee);
  return params.toString();
}

function flowSnapshot(state) {
  return {
    view: state.view,
    selectedBucketId: state.selectedBucketId ?? null,
    selectedProgramId: state.selectedProgramId ?? null,
    selectedRecipientId: state.selectedRecipientId ?? null,
  };
}

export function transitionFlowState(state, action) {
  const history = [...(state.history ?? [])];
  if (action.type === 'OVERVIEW') {
    return { view: 'overview', selectedBucketId: null, selectedProgramId: null, selectedRecipientId: null, history: [] };
  }
  if (action.type === 'SELECT_BUCKET') {
    history.push(flowSnapshot(state));
    return {
      ...state, view: 'bucket', selectedBucketId: action.bucketId,
      selectedProgramId: action.programId ?? null, selectedRecipientId: null, history,
    };
  }
  if (action.type === 'SELECT_PROGRAM') {
    return { ...state, view: 'bucket', selectedProgramId: action.programId, selectedRecipientId: null };
  }
  if (action.type === 'SELECT_RECIPIENT') {
    history.push(flowSnapshot(state));
    return {
      ...state,
      view: 'recipient',
      selectedBucketId: action.resetAncestors ? null : state.selectedBucketId,
      selectedProgramId: action.resetAncestors ? null : state.selectedProgramId,
      selectedRecipientId: action.recipientId,
      history,
    };
  }
  if (action.type === 'BACK') {
    const previous = history.pop();
    return previous ? { ...state, ...previous, history } : state;
  }
  return state;
}

export function preferredScrollBehavior(reducedMotion) {
  return reducedMotion ? 'auto' : 'smooth';
}

export function filterAndRankLabels(rankings, filters = {}) {
  const { serviceCategory = '', paymentDetail = '', query = '' } = filters;
  const needsFacts = Boolean(serviceCategory || paymentDetail);
  const source = needsFacts ? rankings.facts : rankings.labels;
  const grouped = new Map();
  for (const row of source) {
    if (serviceCategory && row.service_category !== serviceCategory) continue;
    if (paymentDetail && row.payment_detail !== paymentDetail) continue;
    if (query && !row.recipient_label.toLocaleLowerCase('en-CA').includes(query.toLocaleLowerCase('en-CA'))) continue;
    const current = grouped.get(row.payment_label_id) ?? {
      payment_label_id: row.payment_label_id,
      recipient_label: row.recipient_label,
      recipient_class: row.recipient_class,
      amount_cad: 0,
      payment_line_count: 0,
    };
    current.amount_cad += Number(row.amount_cad);
    current.payment_line_count += Number(row.payment_line_count ?? 0);
    grouped.set(row.payment_label_id, current);
  }
  return [...grouped.values()]
    .map((row) => ({ ...row, amount_cad: row.amount_cad.toFixed(2) }))
    .sort((left, right) => Number(right.amount_cad) - Number(left.amount_cad)
      || left.payment_label_id.localeCompare(right.payment_label_id));
}

export function buildProfileLookup(profiles) {
  const byPaymentLabel = new Map();
  const byEntity = new Map();
  const standalone = [];
  for (const profile of profiles) {
    byEntity.set(profile.entity_id, profile);
    if (profile.payment_label_ids?.length) {
      for (const labelId of profile.payment_label_ids) byPaymentLabel.set(labelId, profile);
    } else {
      standalone.push(profile);
    }
  }
  standalone.sort((left, right) => left.reporting_entity.localeCompare(right.reporting_entity));
  return { byPaymentLabel, byEntity, standalone };
}

export function getSectorInsight(serviceCategory, insights) {
  const insightByCategory = {
    home_and_community_care: 'athome_contracted_share',
    physicians_and_practitioners: 'npdb_alternative_payment_share',
  };
  const insightId = insightByCategory[serviceCategory];
  if (!insightId) return null;
  return insights.find((insight) => insight.insight_id === insightId) ?? null;
}

const MAP_QUERY_KEYS = ['release', 'focal', 'edge', 'direction', 'period', 'query', 'type'];

export function parseMapState(search = '') {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  return Object.fromEntries(MAP_QUERY_KEYS
    .map((key) => [key, params.get(key)])
    .filter(([, value]) => value !== null && value !== ''));
}

export function serializeMapState(state = {}) {
  const params = new URLSearchParams();
  for (const key of MAP_QUERY_KEYS) {
    if (state[key] !== undefined && state[key] !== null && state[key] !== '') {
      params.set(key, state[key]);
    }
  }
  return params.toString();
}

export function navigateMap(state, { nodeId, edgeId = null, direction = null }) {
  const current = {
    focal: state.focal,
    edge: state.edge ?? null,
    direction: state.direction ?? null,
  };
  return {
    ...state,
    focal: nodeId,
    edge: edgeId,
    direction: direction ?? state.direction ?? 'downstream',
    history: [...(state.history ?? []), current],
  };
}

export function navigateBack(state) {
  const history = [...(state.history ?? [])];
  if (!history.length) return state;
  const previous = history.pop();
  return { ...state, ...previous, history };
}

export function prepareNeighbourhood(payload, options = {}) {
  const {
    page = 1, pageSize = 40, query = '', type = '', amountStatus = '', direction = 'all',
  } = options;
  const focalId = payload.focal_node.node_id;
  const nodes = new Map(payload.nodes.map((node) => [node.node_id, node]));
  const normalizedQuery = query.trim().toLocaleLowerCase('en-CA');
  let rows = payload.edges.map((edge) => {
    const relatedId = edge.source_node_id === focalId ? edge.target_node_id : edge.source_node_id;
    return { edge, related: nodes.get(relatedId) };
  }).filter(({ edge, related }) => {
    if (!related) return false;
    if (direction === 'upstream' && edge.target_node_id !== focalId) return false;
    if (direction === 'downstream' && edge.source_node_id !== focalId) return false;
    if (type && related.node_type !== type) return false;
    if (amountStatus && edge.amount_status !== amountStatus) return false;
    if (normalizedQuery && !related.label.toLocaleLowerCase('en-CA').includes(normalizedQuery)) return false;
    return true;
  });
  rows.sort((left, right) => left.edge.edge_id.localeCompare(right.edge.edge_id));
  const facets = { node_type: {}, amount_status: {} };
  for (const { edge, related } of rows) {
    facets.node_type[related.node_type] = (facets.node_type[related.node_type] ?? 0) + 1;
    facets.amount_status[edge.amount_status] = (facets.amount_status[edge.amount_status] ?? 0) + 1;
  }
  const end = Math.max(pageSize, page * pageSize);
  const pageRows = rows.slice(0, end);
  return {
    focalNode: payload.focal_node,
    nodes: pageRows.map((row) => row.related),
    edges: pageRows.map((row) => row.edge),
    totalConnections: rows.length,
    shownConnections: pageRows.length,
    hasMore: pageRows.length < rows.length,
    facets,
  };
}
