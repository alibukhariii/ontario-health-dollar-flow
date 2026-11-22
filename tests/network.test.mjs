import assert from 'node:assert/strict';
import test from 'node:test';

let network = {};
try {
  network = await import('../src/network.mjs');
} catch {
  network = {};
}

const fixture = {
  positive_published_payments_cad: '175.00',
  named_recipient_count: 3,
  not_itemized_to_public_recipient_cad: '25.00',
  not_itemized_share_percent: '14.29',
  categories: [
    {
      category_id: 'hospital_care', label: 'Hospital care', amount_cad: '100.00', share_percent: '57.14',
      ministry_amounts: [{ ministry: 'Ministry Of Health', amount_cad: '100.00' }],
    },
    {
      category_id: 'long_term_care', label: 'Long-term care', amount_cad: '50.00', share_percent: '28.57',
      ministry_amounts: [{ ministry: 'Ministry Of Long-Term Care', amount_cad: '50.00' }],
    },
  ],
  programs: [
    { program_key: 'Ministry Of Health␟hospital_care␟Operations', label: 'Operations', category_id: 'hospital_care', ministry: 'Ministry Of Health', amount_cad: '100.00' },
    { program_key: 'Ministry Of Long-Term Care␟long_term_care␟Transfers', label: 'Transfers', category_id: 'long_term_care', ministry: 'Ministry Of Long-Term Care', amount_cad: '50.00' },
  ],
  recipients: [
    { recipient_id: 'a', label: 'Alpha Hospital', payee_type: 'hospital corporation', amount_cad: '90.00', global_rank: 1, path: 'payees/a.json', label_by_default: true, is_intermediary: false },
    { recipient_id: 'b', label: 'Ontario Health', payee_type: 'intermediary', amount_cad: '40.00', global_rank: 2, path: 'payees/b.json', label_by_default: true, is_intermediary: true },
    { recipient_id: 'c', label: 'Tiny Provider', payee_type: 'provider', amount_cad: '1.00', global_rank: 3, path: 'payees/c.json', label_by_default: false, is_intermediary: false },
  ],
  default_routes: [{ recipient_id: 'a', program_key: 'Ministry Of Health␟hospital_care␟Operations', amount_cad: '90.00' }],
};

test('recipient radii use area rather than diameter to encode amount', () => {
  assert.equal(typeof network.amountRadius, 'function');
  const large = network.amountRadius(100, 100, { minRadius: 0, maxRadius: 40 });
  const quarter = network.amountRadius(25, 100, { minRadius: 0, maxRadius: 40 });
  assert.equal(large, 40);
  assert.equal(quarter, 20);
});

test('network layout is deterministic, keeps recipients inside the centre and avoids overlap', () => {
  assert.equal(typeof network.layoutFundingNetwork, 'function');
  const first = network.layoutFundingNetwork(fixture);
  const second = network.layoutFundingNetwork(fixture);
  assert.deepEqual(first.recipients, second.recipients);
  for (const recipient of first.recipients) {
    const distance = Math.hypot(recipient.x - first.cx, recipient.y - first.cy);
    assert.ok(distance + recipient.r <= first.recipientBoundary + 0.01);
  }
  for (let i = 0; i < first.recipients.length; i += 1) {
    for (let j = i + 1; j < first.recipients.length; j += 1) {
      const left = first.recipients[i];
      const right = first.recipients[j];
      assert.ok(Math.hypot(left.x - right.x, left.y - right.y) + 0.01 >= left.r + right.r);
    }
  }
});

test('renderer includes all recipient nodes, ministry legend, intermediary styling and non-itemized callout', () => {
  assert.equal(typeof network.renderFundingNetwork, 'function');
  const layout = network.layoutFundingNetwork(fixture);
  const html = network.renderFundingNetwork(layout, fixture);
  assert.equal((html.match(/data-recipient-id=/g) ?? []).length, 3);
  assert.match(html, /recipient-node--intermediary/);
  assert.match(html, /Ministry of Health/);
  assert.match(html, /Ministry of Long-Term Care/);
  assert.match(html, /Not itemized to a named recipient/);
  assert.match(html, /aria-label="Funding network/);
});

test('active route renderer ranks every published route and uses dotted paths for intermediaries', () => {
  assert.equal(typeof network.renderRecipientFocus, 'function');
  const layout = network.layoutFundingNetwork(fixture);
  const payload = {
    payment_label_id: 'b', display_label: 'Ontario Health', payee_type: 'intermediary',
    published_payment_total_cad: '40.00', global_rank: 2,
    incoming_routes: [
      { ministry: 'Ministry Of Health', category_id: 'hospital_care', program_label: 'Operations', amount_cad: '30.00' },
      { ministry: 'Ministry Of Long-Term Care', category_id: 'long_term_care', program_label: 'Transfers', amount_cad: '10.00' },
    ],
  };
  const result = network.renderRecipientFocus(layout, payload);
  assert.match(result.routes, /active-route--intermediary/);
  assert.ok(result.tooltip.indexOf('$30') < result.tooltip.indexOf('$10'));
  assert.match(result.tooltip, /#2/);
});
