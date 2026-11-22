import assert from 'node:assert/strict';
import test from 'node:test';

import {
  layoutBucketFlow,
  layoutOverviewFlow,
  layoutRecipientFlow,
  ribbonWidth,
} from '../src/flow-layout.mjs';

test('overview connects both ministries through the total to all exclusive buckets', () => {
  const layout = layoutOverviewFlow({
    net_published_payments_cad: '100.00',
    ministries: [
      { ministry: 'Ministry Of Health', amount_cad: '90.00' },
      { ministry: 'Ministry Of Long-Term Care', amount_cad: '10.00' },
    ],
    buckets: [
      { bucket_id: 'hospitals', label: 'Hospitals', amount_cad: '60.00' },
      { bucket_id: 'long_term_care', label: 'Long-term care', amount_cad: '40.00' },
    ],
  });

  assert.equal(layout.nodes.filter((row) => row.node_type === 'ministry').length, 2);
  assert.equal(layout.solid_routes.length, 4);
  assert.deepEqual(layout.solid_routes.map((row) => [row.source_id, row.target_id]), [
    ['ministry_ministry_of_health', 'payment_total'],
    ['ministry_ministry_of_long_term_care', 'payment_total'],
    ['payment_total', 'bucket_hospitals'],
    ['payment_total', 'bucket_long_term_care'],
  ]);
  assert.ok(layout.solid_routes.every((row) => row.source_point.x < row.target_point.x));
});

test('bucket focus retains source bucket and program above directly connected recipients', () => {
  const layout = layoutBucketFlow({
    bucket_id: 'public_health', label: 'Public health', amount_cad: '100.00',
    programs: [{
      program_id: 'official', ministry: 'Ministry Of Health', label: 'Official Local Health Agencies',
      amount_cad: '100.00', positive_destination_cad: '100.00',
      recipients: [
        { payment_label_id: 'toronto', recipient_label: 'City Of Toronto', amount_cad: '70.00' },
        { payment_label_id: 'ottawa', recipient_label: 'City Of Ottawa', amount_cad: '30.00' },
      ],
    }],
    special_routes: [{
      route_type: 'municipal_cofunding', label: 'Provincial and municipal co-funding',
      nodes: ['Province', 'Municipality or board', 'Public health service'],
      amount_status: 'period_or_scope_incompatible',
    }],
  }, { selectedProgramId: 'official' });

  const recipientEdges = layout.solid_routes.filter((row) => row.source_id === 'program_official');
  assert.deepEqual(recipientEdges.map((row) => row.target_id), ['recipient_toronto', 'recipient_ottawa']);
  assert.deepEqual(recipientEdges.map((row) => row.share), [0.7, 0.3]);
  assert.ok(layout.dotted_routes.length > 0);
});

test('recipient focus connects every City of Toronto amount route and keeps context dotted', () => {
  const layout = layoutRecipientFlow({
    recipient_label: 'City Of Toronto', payment_label_id: 'city', published_payment_total_cad: '422016270.00',
    incoming_routes: [
      {
        route_id: 'route-ph', ministry: 'Ministry Of Health', bucket_id: 'public_health',
        bucket_label: 'Public health', program_label: 'Official Local Health Agencies',
        amount_cad: '156512601.00', amount_status: 'amount_disclosed', target_label: 'City Of Toronto',
      },
      {
        route_id: 'route-ltc', ministry: 'Ministry Of Long-Term Care', bucket_id: 'long_term_care',
        bucket_label: 'Long-term care', program_label: 'Transfer Payments',
        amount_cad: '265503669.00', amount_status: 'amount_disclosed', target_label: 'City Of Toronto',
      },
    ],
    institutional_context: [
      {
        context_id: 'oh-ltc', bucket_id: 'long_term_care', route_type: 'ltc_ontario_health_role',
        source_label: 'Ontario Health', target_label: 'City Of Toronto',
        relationship_label: 'Funding and accountability role',
        amount_status: 'relationship_disclosed_amount_not_disclosed', amount_cad: null, path_placement: 'parallel',
      },
      {
        context_id: 'municipal', bucket_id: 'public_health', route_type: 'municipal_cofunding',
        source_label: 'Municipal co-funding', target_label: 'City Of Toronto',
        relationship_label: 'Separate calendar-year contribution context',
        amount_status: 'period_or_scope_incompatible', amount_cad: null, path_placement: 'parallel',
      },
    ],
    financial_profile: null,
  });

  const finalMoneyEdges = layout.solid_routes.filter((row) => row.target_id === 'recipient_city');
  assert.deepEqual(finalMoneyEdges.map((row) => row.amount_cad), ['265503669.00', '156512601.00']);
  assert.ok(finalMoneyEdges.every((row) => row.source_id.startsWith('program_')));
  assert.ok(layout.dotted_routes.some((row) => row.source_id === 'context_oh_ltc' && row.target_id === 'recipient_city'));
  assert.ok(layout.dotted_routes.some((row) => row.source_id === 'context_municipal' && row.target_id === 'recipient_city'));
  assert.ok(layout.solid_routes.every((row) => !row.source_id.startsWith('context_') && !row.target_id.startsWith('context_')));
  assert.equal(layout.statement_status, 'no_published_amounts');
});

test('recipient layout is stable regardless of input route order', () => {
  const payload = {
    recipient_label: 'Provider', payment_label_id: 'provider', published_payment_total_cad: '100.00',
    incoming_routes: [
      { route_id: 'b', ministry: 'Ministry Of Health', bucket_id: 'capital', bucket_label: 'Capital', program_label: 'Renewal', amount_cad: '20.00', amount_status: 'amount_disclosed' },
      { route_id: 'a', ministry: 'Ministry Of Health', bucket_id: 'hospitals', bucket_label: 'Hospitals', program_label: 'Operations', amount_cad: '80.00', amount_status: 'amount_disclosed' },
    ],
    institutional_context: [], financial_profile: { reporting_entity: 'Provider' },
  };
  const first = layoutRecipientFlow(payload);
  const second = layoutRecipientFlow({ ...payload, incoming_routes: [...payload.incoming_routes].reverse() });
  assert.deepEqual(first.nodes, second.nodes);
  assert.deepEqual(first.solid_routes, second.solid_routes);
});

test('ribbon width uses a local linear denominator with a visible minimum', () => {
  assert.equal(ribbonWidth('50', '100'), 21);
  assert.equal(ribbonWidth('1', '100'), 2);
  assert.equal(ribbonWidth(null, '100'), null);
});
