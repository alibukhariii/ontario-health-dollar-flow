import assert from 'node:assert/strict';
import test from 'node:test';

let renderers = {};
try {
  renderers = await import('../src/renderers.mjs');
} catch {
  renderers = {};
}

test('category renderer accounts for every supplied service without inventing other', () => {
  assert.equal(typeof renderers.renderCategoryCards, 'function');
  const html = renderers.renderCategoryCards([
    { category_id: 'hospitals', amount_cad: '60.00', per_100_dollars: '60.0000' },
    { category_id: 'public_health', amount_cad: '40.00', per_100_dollars: '40.0000' },
  ]);

  assert.match(html, /data-service-category="hospitals"/);
  assert.match(html, /data-service-category="public_health"/);
  assert.doesNotMatch(html, /data-service-category="other"/);
  assert.equal((html.match(/<button class="category-card /g) ?? []).length, 2);
});

test('ranking renderer escapes published labels and marks linked financial profiles', () => {
  assert.equal(typeof renderers.renderRankingRows, 'function');
  const profiles = new Map([['label-1', { entity_id: 'entity-1' }]]);
  const html = renderers.renderRankingRows([
    { payment_label_id: 'label-1', recipient_label: '<script>alert(1)</script>', recipient_class: 'hospital', amount_cad: '1000000.00', payment_line_count: 2 },
  ], profiles);

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Financial profile/);
  assert.match(html, /\$1\.0M/);
});

test('linked profile leads with financial composition and separates disclosed payment', () => {
  assert.equal(typeof renderers.renderProfile, 'function');
  const html = renderers.renderProfile({
    reporting_entity: 'Example Hospital',
    payment_link_status: 'reviewed_resolved',
    linked_disclosed_payment_cad: '600.00',
    expense_total_cad: '500.00',
    revenue_total_cad: '510.00',
    expense_components: [{ source_label: 'Compensation', amount_cad: '400.00' }],
    revenue_components: [{ source_label: 'Government funding', amount_cad: '510.00' }],
    expense_insight: { source_label: 'Compensation', share_percent: '80.0000' },
    revenue_insight: null,
    annual_result: { source_label: 'Excess of revenue over expenses', amount_cad: '10.00' },
    reporting_scope: 'Hospital corporation',
  });

  assert.ok(html.indexOf('Reported expenses') < html.indexOf('Disclosed payments'));
  assert.match(html, /different accounting frame/);
  assert.match(html, /80\.0%/);
});

test('standalone profile states that no payment link is verified', () => {
  assert.equal(typeof renderers.renderProfile, 'function');
  const html = renderers.renderProfile({
    reporting_entity: 'Standalone Hospital',
    payment_link_status: 'not_verified',
    linked_disclosed_payment_cad: '0.00',
    expense_total_cad: '500.00',
    revenue_total_cad: '510.00',
    expense_components: [],
    revenue_components: [],
    expense_insight: null,
    revenue_insight: null,
    annual_result: null,
    reporting_scope: '',
  });

  assert.match(html, /No payment-label connection has been verified/);
  assert.doesNotMatch(html, /Disclosed payments.*\$0/s);
});

test('payment-only profile never implies missing financial evidence is zero', () => {
  assert.equal(typeof renderers.renderPaymentOnlyProfile, 'function');
  const html = renderers.renderPaymentOnlyProfile({
    recipient_label: 'Community Provider',
    recipient_class: 'community_provider',
    amount_cad: '250000.00',
    payment_line_count: 3,
  });

  assert.match(html, /\$250\.0K/);
  assert.match(html, /No validated financial profile is connected/);
  assert.doesNotMatch(html, /Reported expenses.*\$0/s);
});

test('system map renders accounting composition differently from funding and undisclosed relationships', () => {
  assert.equal(typeof renderers.renderSystemMap, 'function');
  const html = renderers.renderSystemMap({
    focalNode: { node_id: 'root', node_type: 'accounting_frame', label: 'Combined expense', amount_cad: '100.00', denominator_id: 'd1' },
    nodes: [
      { node_id: 'source', node_type: 'ministry_source', label: 'Ministry source', amount_cad: '60.00' },
      { node_id: 'recipient', node_type: 'legal_organization', label: 'Provider', amount_cad: '40.00' },
      { node_id: 'unknown', node_type: 'legal_organization', label: 'Contractor', amount_cad: null },
    ],
    edges: [
      { edge_id: 'composition', source_node_id: 'source', target_node_id: 'root', topology: 'composition', relationship_type: 'classifies_expense', funding_mechanism: null, amount_cad: '60.00', amount_status: 'amount_disclosed', denominator_id: 'd1' },
      { edge_id: 'funding', source_node_id: 'root', target_node_id: 'recipient', topology: 'fan_out', relationship_type: 'funds', funding_mechanism: 'transfer_payment', amount_cad: '40.00', amount_status: 'amount_disclosed', denominator_id: 'd1' },
      { edge_id: 'unknown-edge', source_node_id: 'root', target_node_id: 'unknown', topology: 'chain', relationship_type: 'purchases_service_from', funding_mechanism: 'procurement_or_service_contract', amount_cad: null, amount_status: 'relationship_disclosed_amount_not_disclosed', denominator_id: null },
    ],
    totalConnections: 3,
    shownConnections: 3,
    hasMore: false,
    facets: {},
  });

  assert.match(html, /data-edge-id="composition"[^>]*class="map-edge map-edge--composition"/);
  assert.match(html, /data-edge-id="funding"[^>]*class="map-edge map-edge--funding"/);
  assert.match(html, /data-edge-id="unknown-edge"[^>]*class="map-edge map-edge--undisclosed"/);
  assert.match(html, /Amount not disclosed/);
  assert.match(html, /Scale: d1/);
});

test('structured neighbourhood is a non-graph equivalent with directions and evidence states', () => {
  assert.equal(typeof renderers.renderStructuredNeighbourhood, 'function');
  const html = renderers.renderStructuredNeighbourhood({
    focalNode: { node_id: 'root', label: 'Root' },
    nodes: [
      { node_id: 'up', label: 'Upstream' },
      { node_id: 'down', label: 'Downstream' },
    ],
    edges: [
      { edge_id: 'in', source_node_id: 'up', target_node_id: 'root', relationship_type: 'funds', amount_cad: '10', amount_status: 'amount_disclosed' },
      { edge_id: 'out', source_node_id: 'root', target_node_id: 'down', relationship_type: 'holds_accountable', amount_cad: null, amount_status: 'relationship_disclosed_amount_not_disclosed' },
    ],
  });
  assert.match(html, /Incoming relationships/);
  assert.match(html, /Outgoing relationships/);
  assert.match(html, /Upstream/);
  assert.match(html, /Amount not disclosed/);
});

test('overview flow renders one amount-width ribbon for every exclusive bucket', () => {
  assert.equal(typeof renderers.renderOverviewFlow, 'function');
  const html = renderers.renderOverviewFlow({
    net_published_payments_cad: '100.00',
    buckets: [
      { bucket_id: 'hospitals', label: 'Hospitals', amount_cad: '60.00', share_percent: '60.0000' },
      { bucket_id: 'capital', label: 'Capital', amount_cad: '40.00', share_percent: '40.0000' },
    ],
  }, 'hospitals');

  assert.equal((html.match(/data-bucket-id=/g) ?? []).length, 2);
  assert.match(html, /flow-ribbon is-selected/);
  assert.match(html, /--flow-share:60/);
});

test('bucket flow distinguishes exact amounts relationships intermediaries and junctions', () => {
  assert.equal(typeof renderers.renderBucketFlow, 'function');
  const html = renderers.renderBucketFlow({
    bucket_id: 'home_and_community_care', label: 'Home and community care', amount_cad: '100.00',
    programs: [{
      program_id: 'home', label: 'Home Care', amount_cad: '100.00',
      recipients: [{ payment_label_id: 'provider', recipient_label: 'Provider', amount_cad: '25.00', has_profile: true, incoming_bucket_count: 2 }],
      aggregate_destination_cad: '0.00', withheld_person_cad: '0.00',
      positive_destination_cad: '120.00', signed_adjustment_cad: '-20.00',
    }],
    special_routes: [{
      route_type: 'ontario_health_athome', label: 'Ontario Health atHome route',
      ministry_to_intermediary_cad: '80.00', intermediary_to_athome_cad: '90.00',
      downstream_amount_status: 'no_published_amount', segments_reconciled: false,
    }],
  }, { selectedProgramId: 'home', query: '', limit: 20 });

  assert.match(html, /line--amount/);
  assert.match(html, /line--relationship/);
  assert.match(html, /node--intermediary/);
  assert.match(html, /junction-marker/);
  assert.match(html, /No published amount/);
  assert.match(html, /Signed adjustment/);
});

test('recipient detail shows all incoming routes and safe stop when accounts are unavailable', () => {
  assert.equal(typeof renderers.renderRecipientDetail, 'function');
  const html = renderers.renderRecipientDetail({
    recipient_label: 'Example Provider',
    incoming_routes: [
      { bucket_id: 'hospitals', bucket_label: 'Hospitals', program_label: 'Operations', amount_cad: '80.00' },
      { bucket_id: 'capital', bucket_label: 'Capital', program_label: 'Renewal', amount_cad: '20.00' },
    ],
    profile_status: 'no_published_amounts',
    financial_profile: null,
  });

  assert.match(html, /Hospitals/);
  assert.match(html, /Capital/);
  assert.match(html, /funding-junction/);
  assert.match(html, /No published amounts/);
});
