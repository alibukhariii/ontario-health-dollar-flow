import assert from 'node:assert/strict';
import test from 'node:test';

let model = {};
try {
  model = await import('../src/app-model.mjs');
} catch {
  model = {};
}

test('ranking recomputes amounts from selected service facts', () => {
  assert.equal(typeof model.filterAndRankLabels, 'function');
  const rankings = {
    labels: [
      { payment_label_id: 'a', recipient_label: 'Alpha', recipient_class: 'hospital', amount_cad: '150.00' },
      { payment_label_id: 'b', recipient_label: 'Beta', recipient_class: 'hospital', amount_cad: '120.00' },
    ],
    facts: [
      { payment_label_id: 'a', recipient_label: 'Alpha', recipient_class: 'hospital', service_category: 'hospitals', payment_detail: 'Operations', amount_cad: '50.00', payment_line_count: 1 },
      { payment_label_id: 'a', recipient_label: 'Alpha', recipient_class: 'hospital', service_category: 'home_care', payment_detail: 'Home', amount_cad: '100.00', payment_line_count: 1 },
      { payment_label_id: 'b', recipient_label: 'Beta', recipient_class: 'hospital', service_category: 'hospitals', payment_detail: 'Operations', amount_cad: '120.00', payment_line_count: 1 },
    ],
  };

  const result = model.filterAndRankLabels(rankings, { serviceCategory: 'hospitals' });

  assert.deepEqual(result.map((row) => [row.payment_label_id, row.amount_cad]), [
    ['b', '120.00'],
    ['a', '50.00'],
  ]);
});

test('ranking search preserves published labels and never consolidates aliases', () => {
  assert.equal(typeof model.filterAndRankLabels, 'function');
  const rankings = {
    labels: [
      { payment_label_id: 'a', recipient_label: 'Alpha Hospital', recipient_class: 'hospital', amount_cad: '100.00' },
      { payment_label_id: 'b', recipient_label: 'Alpha Hospital Inc.', recipient_class: 'hospital', amount_cad: '70.00' },
    ],
    facts: [],
  };

  const result = model.filterAndRankLabels(rankings, { query: 'alpha' });

  assert.equal(result.length, 2);
  assert.notEqual(result[0].payment_label_id, result[1].payment_label_id);
});

test('profile lookup distinguishes linked and standalone audited profiles', () => {
  assert.equal(typeof model.buildProfileLookup, 'function');
  const profiles = [
    { entity_id: 'linked', reporting_entity: 'Linked Hospital', payment_label_ids: ['label-1'] },
    { entity_id: 'standalone', reporting_entity: 'Standalone Hospital', payment_label_ids: [] },
  ];

  const lookup = model.buildProfileLookup(profiles);

  assert.equal(lookup.byPaymentLabel.get('label-1').entity_id, 'linked');
  assert.equal(lookup.byPaymentLabel.has('standalone'), false);
  assert.deepEqual(lookup.standalone.map((row) => row.entity_id), ['standalone']);
});

test('formatters use release values without a fiscal-year constant', () => {
  assert.equal(typeof model.formatCad, 'function');
  assert.equal(model.formatCad('92286114278.00', { compact: true }), '$92.3B');
  assert.equal(model.humanizeCategory('home_and_community_care'), 'Home and community care');
});

test('flow state rejects retired pages and supports final product tabs', () => {
  assert.equal(model.parseFlowV2State('?page=convergence').page, 'landing');
  assert.equal(model.parseFlowV2State('?page=recipients').page, 'recipients');
  assert.equal(model.serializeFlowV2State({ page: 'recipients' }), 'page=recipients');
});

test('sector insights appear only for their compatible service category', () => {
  assert.equal(typeof model.getSectorInsight, 'function');
  const insights = [
    { insight_id: 'athome_contracted_share', value: '72.189374', limitation: 'Home-care limitation.' },
    { insight_id: 'npdb_alternative_payment_share', value: '34.910099', limitation: 'Physician limitation.' },
  ];

  assert.equal(model.getSectorInsight('home_and_community_care', insights).insight_id, 'athome_contracted_share');
  assert.equal(model.getSectorInsight('physicians_and_practitioners', insights).insight_id, 'npdb_alternative_payment_share');
  assert.equal(model.getSectorInsight('hospitals', insights), null);
});

test('map state round-trips focal route direction filters and period through the URL', () => {
  assert.equal(typeof model.parseMapState, 'function');
  assert.equal(typeof model.serializeMapState, 'function');
  const state = {
    release: 'release-1', focal: 'node-2', edge: 'edge-3', direction: 'upstream',
    period: '2025-26', query: 'hospital', type: 'legal_organization',
  };
  const serialized = model.serializeMapState(state);
  assert.deepEqual(model.parseMapState(`?${serialized}`), state);
});

test('neighbourhood navigation preserves route history and permits deliberate revisiting', () => {
  assert.equal(typeof model.navigateMap, 'function');
  let state = { focal: 'root', history: [] };
  state = model.navigateMap(state, { nodeId: 'category', edgeId: 'edge-1' });
  state = model.navigateMap(state, { nodeId: 'recipient', edgeId: 'edge-2' });
  assert.deepEqual(state.history.map((row) => row.focal), ['root', 'category']);
  state = model.navigateBack(state);
  assert.equal(state.focal, 'category');
  state = model.navigateMap(state, { nodeId: 'root', edgeId: 'edge-3' });
  assert.equal(state.focal, 'root');
});

test('high-degree neighbourhoods expose facets and deterministic pages', () => {
  assert.equal(typeof model.prepareNeighbourhood, 'function');
  const payload = {
    focal_node: { node_id: 'root' },
    nodes: [
      { node_id: 'root', node_type: 'accounting_frame', label: 'Root' },
      { node_id: 'a', node_type: 'legal_organization', label: 'Alpha', region: 'North' },
      { node_id: 'b', node_type: 'legal_organization', label: 'Beta', region: 'South' },
    ],
    edges: [
      { edge_id: '2', source_node_id: 'root', target_node_id: 'b', amount_status: 'amount_disclosed' },
      { edge_id: '1', source_node_id: 'root', target_node_id: 'a', amount_status: 'amount_disclosed' },
    ],
  };
  const view = model.prepareNeighbourhood(payload, { page: 1, pageSize: 1 });
  assert.equal(view.totalConnections, 2);
  assert.equal(view.edges[0].edge_id, '1');
  assert.equal(view.hasMore, true);
  assert.deepEqual(view.facets.node_type, { legal_organization: 2 });
});

test('flow recipient filtering keeps exact published labels and paginates deterministically', () => {
  assert.equal(typeof model.filterFlowRecipients, 'function');
  const program = {
    recipients: [
      { payment_label_id: 'b', recipient_label: 'Beta Hospital', amount_cad: '20.00' },
      { payment_label_id: 'a', recipient_label: 'Alpha Hospital', amount_cad: '30.00' },
      { payment_label_id: 'c', recipient_label: 'Gamma Clinic', amount_cad: '10.00' },
    ],
  };

  const result = model.filterFlowRecipients(program, { query: 'hospital', limit: 1 });

  assert.equal(result.total, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.rows[0].recipient_label, 'Alpha Hospital');
});

test('flow width is locally scaled and unknown amounts never become zero-width money', () => {
  assert.equal(typeof model.flowWidth, 'function');
  assert.equal(model.flowWidth('50', '100'), 50);
  assert.equal(model.flowWidth(null, '100'), null);
  assert.equal(model.flowWidth('-10', '100'), 10);
});

test('connected flow state retains selected ancestors and returns through history', () => {
  assert.equal(typeof model.transitionFlowState, 'function');
  let state = { view: 'overview', selectedBucketId: null, selectedProgramId: null, selectedRecipientId: null, history: [] };
  state = model.transitionFlowState(state, { type: 'SELECT_BUCKET', bucketId: 'public_health', programId: 'official' });
  state = model.transitionFlowState(state, { type: 'SELECT_PROGRAM', programId: 'outbreaks' });
  state = model.transitionFlowState(state, { type: 'SELECT_RECIPIENT', recipientId: 'city' });
  assert.deepEqual(
    [state.view, state.selectedBucketId, state.selectedProgramId, state.selectedRecipientId],
    ['recipient', 'public_health', 'outbreaks', 'city'],
  );
  state = model.transitionFlowState(state, { type: 'BACK' });
  assert.deepEqual(
    [state.view, state.selectedBucketId, state.selectedProgramId, state.selectedRecipientId],
    ['bucket', 'public_health', 'outbreaks', null],
  );
  state = model.transitionFlowState(state, { type: 'OVERVIEW' });
  assert.deepEqual(
    [state.view, state.selectedBucketId, state.selectedProgramId, state.selectedRecipientId, state.history.length],
    ['overview', null, null, null, 0],
  );
});

test('changing programs does not create a disconnected navigation page', () => {
  let state = { view: 'bucket', selectedBucketId: 'hospitals', selectedProgramId: 'operations', selectedRecipientId: null, history: [] };
  state = model.transitionFlowState(state, { type: 'SELECT_PROGRAM', programId: 'psychiatric' });
  assert.equal(state.view, 'bucket');
  assert.equal(state.selectedBucketId, 'hospitals');
  assert.equal(state.selectedProgramId, 'psychiatric');
  assert.equal(state.history.length, 0);
});

test('direct recipient search starts a clean recipient trail instead of retaining a stale bucket', () => {
  let state = {
    view: 'recipient', selectedBucketId: 'hospitals', selectedProgramId: 'operations',
    selectedRecipientId: 'uhn', history: [{ view: 'overview', selectedBucketId: null, selectedProgramId: null, selectedRecipientId: null }],
  };
  state = model.transitionFlowState(state, {
    type: 'SELECT_RECIPIENT', recipientId: 'ontario-health', resetAncestors: true,
  });
  assert.deepEqual(
    [state.view, state.selectedBucketId, state.selectedProgramId, state.selectedRecipientId],
    ['recipient', null, null, 'ontario-health'],
  );
  assert.deepEqual(state.history.at(-1), {
    view: 'recipient', selectedBucketId: 'hospitals', selectedProgramId: 'operations', selectedRecipientId: 'uhn',
  });
});

test('reduced-motion readers never receive smooth scripted scrolling', () => {
  assert.equal(model.preferredScrollBehavior(false), 'smooth');
  assert.equal(model.preferredScrollBehavior(true), 'auto');
});
