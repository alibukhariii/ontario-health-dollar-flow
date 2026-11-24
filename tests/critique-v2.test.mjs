import assert from 'node:assert/strict';
import test from 'node:test';

let visual = {};
try {
  visual = await import('../src/critique-v2/visual.mjs');
} catch {
  visual = {};
}

const fixture = {
  positive_published_payments_cad: '1000.00',
  signed_adjustments_cad: '-40.00',
  net_published_payments_cad: '960.00',
  named_destination_amount_cad: '700.00',
  not_itemized_to_public_recipient_cad: '300.00',
  named_recipient_count: 5,
  ministries: [
    { ministry: 'Ministry Of Health', positive_amount_cad: '900.00' },
    { ministry: 'Ministry Of Long-Term Care', positive_amount_cad: '100.00' },
  ],
  categories: [
    { category_id: 'a', label: 'A', amount_cad: '300.00', share_percent: '30.00', ministry_amounts: [] },
    { category_id: 'b', label: 'B', amount_cad: '220.00', share_percent: '22.00', ministry_amounts: [] },
    { category_id: 'c', label: 'C', amount_cad: '170.00', share_percent: '17.00', ministry_amounts: [] },
    { category_id: 'd', label: 'D', amount_cad: '120.00', share_percent: '12.00', ministry_amounts: [] },
    { category_id: 'e', label: 'E', amount_cad: '90.00', share_percent: '9.00', ministry_amounts: [] },
    { category_id: 'f', label: 'F', amount_cad: '60.00', share_percent: '6.00', ministry_amounts: [] },
    { category_id: 'g', label: 'G', amount_cad: '40.00', share_percent: '4.00', ministry_amounts: [] },
  ],
  programs: [
    { program_key: 'm␟a␟Alpha', label: 'Alpha', category_id: 'a', ministry: 'Ministry Of Health', amount_cad: '300.00' },
    { program_key: 'm␟b␟Beta', label: 'Beta', category_id: 'b', ministry: 'Ministry Of Health', amount_cad: '220.00' },
  ],
  recipients: [
    { recipient_id: 'one', label: 'Ontario Health', payee_type: 'intermediary', amount_cad: '250.00', global_rank: 1, is_intermediary: true },
    { recipient_id: 'two', label: 'Two Hospital', payee_type: 'hospital corporation', amount_cad: '160.00', global_rank: 2 },
    { recipient_id: 'three', label: 'City of Three', payee_type: 'municipality', amount_cad: '120.00', global_rank: 3 },
    { recipient_id: 'four', label: 'Four Provider', payee_type: 'provider', amount_cad: '100.00', global_rank: 4 },
    { recipient_id: 'five', label: 'Five Vendor', payee_type: 'vendor', amount_cad: '70.00', global_rank: 5 },
  ],
  named_routes: [
    { recipient_id: 'one', program_key: 'm␟a␟Alpha', amount_cad: '250.00' },
    { recipient_id: 'two', program_key: 'm␟a␟Alpha', amount_cad: '160.00' },
    { recipient_id: 'three', program_key: 'm␟b␟Beta', amount_cad: '120.00' },
    { recipient_id: 'four', program_key: 'm␟b␟Beta', amount_cad: '100.00' },
    { recipient_id: 'five', program_key: 'm␟a␟Alpha', amount_cad: '70.00' },
  ],
};

test('concentration keeps the named long tail separate from non-itemized payments', () => {
  assert.equal(typeof visual.buildConcentration, 'function');
  const result = visual.buildConcentration(fixture, { topCount: 2 });
  assert.deepEqual(result.map((row) => [row.id, row.amount]), [
    ['largest', 250],
    ['next', 160],
    ['named_tail', 290],
    ['not_itemized', 300],
  ]);
  assert.equal(result.reduce((sum, row) => sum + row.amount, 0), 1000);
});
test('category view shows the five largest purposes and an expandable smaller group', () => {
  assert.equal(typeof visual.groupCategories, 'function');
  const groups = visual.groupCategories(fixture, 5);
  assert.equal(groups.length, 6);
  assert.equal(groups.at(-1).label, 'Two smaller purposes');
  assert.equal(groups.at(-1).amount_cad, 100);
  assert.equal(groups.at(-1).members.length, 2);
});

test('editorial lists keep one visible dollar unit at a time', () => {
  assert.equal(typeof visual.formatBillions, 'function');
  assert.equal(typeof visual.formatMillions, 'function');
  assert.equal(visual.formatBillions(27_488_000_000), '$27.488B');
  assert.equal(visual.formatBillions(179_500_000), '$0.180B');
  assert.equal(visual.formatMillions(1_004_000), '$1.004M');
  assert.equal(visual.formatMillions(851_700), '$0.852M');
});

test('recipient answer card explains routes, shares, rank, type and intermediary accounting', () => {
  assert.equal(typeof visual.renderAnswerCard, 'function');
  const html = visual.renderAnswerCard({
    payment_label_id: 'one', display_label: 'Ontario Health', payee_type: 'intermediary',
    global_rank: 1, published_payment_total_cad: '250.00',
    incoming_routes: [
      { ministry: 'Ministry Of Health', category_id: 'a', category_label: 'A', program_label: 'Alpha', amount_cad: '250.00' },
    ],
  }, fixture, {
    reported_expense_total_cad: '600.00',
    groups: [{ group_label: 'Money passed onward', amount_cad: '550.00', components: [] }],
  });
  assert.match(html, /rank 1 of 5/i);
  assert.match(html, /100\.0%/);
  assert.match(html, /intermediary/i);
  assert.match(html, /not added to the \$1\.0K published-payment total/i);
  assert.match(html, /\$550/);
  assert.match(html, /data-compare-recipient/);
});

test('globe rendering exposes purpose, program, recipient and dust layers without hover', () => {
  assert.equal(typeof visual.layoutGlobe, 'function');
  assert.equal(typeof visual.renderGlobe, 'function');
  const layout = visual.layoutGlobe(fixture);
  const html = visual.renderGlobe(layout, fixture);
  assert.match(html, /class="flow-globe"/);
  assert.match(html, /Purpose meridians/);
  assert.match(html, /Program marks/);
  assert.match(html, /Named recipients/);
  assert.match(html, /recipient-node--intermediary/);
  assert.match(html, /recipient-dust/);
  assert.match(html, /recipient-label__leader/);
  assert.match(html, /not to scale below 1%/i);
});
