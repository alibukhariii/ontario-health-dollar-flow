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
  signed_adjustments_cad: '-5.00',
  net_published_payments_cad: '170.00',
  named_destination_amount_cad: '150.00',
  named_recipient_count: 3,
  not_itemized_to_public_recipient_cad: '25.00',
  not_itemized_share_percent: '14.29',
  ministries: [
    { ministry: 'Ministry Of Health', positive_amount_cad: '125.00' },
    { ministry: 'Ministry Of Long-Term Care', positive_amount_cad: '50.00' },
  ],
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
    { program_key: 'Ministry Of Health␟hospital_care␟Operations', label: 'Operations', category_id: 'hospital_care', ministry: 'Ministry Of Health', amount_cad: '100.00', not_itemized_amount_cad: '10.00' },
    { program_key: 'Ministry Of Long-Term Care␟long_term_care␟Transfers', label: 'Transfers', category_id: 'long_term_care', ministry: 'Ministry Of Long-Term Care', amount_cad: '50.00', not_itemized_amount_cad: '15.00' },
  ],
  recipients: [
    { recipient_id: 'a', label: 'Alpha Hospital', payee_type: 'hospital corporation', amount_cad: '90.00', global_rank: 1, path: 'payees/a.json', label_by_default: true, is_intermediary: false },
    { recipient_id: 'b', label: 'Ontario Health', payee_type: 'intermediary', amount_cad: '40.00', global_rank: 2, path: 'payees/b.json', label_by_default: true, is_intermediary: true },
    { recipient_id: 'c', label: 'Tiny Provider', payee_type: 'provider', amount_cad: '1.00', global_rank: 3, path: 'payees/c.json', label_by_default: false, is_intermediary: false },
  ],
  displayed_recipient_count: 2,
  collapsed_recipient_count: 1,
  collapsed_recipient_amount_cad: '1.00',
  named_routes: [
    { recipient_id: 'a', program_key: 'Ministry Of Health␟hospital_care␟Operations', amount_cad: '90.00' },
    { recipient_id: 'b', program_key: 'Ministry Of Long-Term Care␟long_term_care␟Transfers', amount_cad: '40.00' },
    { recipient_id: 'c', program_key: 'Ministry Of Health␟hospital_care␟Operations', amount_cad: '1.00' },
  ],
  default_routes: [
    { recipient_id: 'a', target_type: 'named_recipient', program_key: 'Ministry Of Health␟hospital_care␟Operations', amount_cad: '90.00' },
    { recipient_id: 'b', target_type: 'named_recipient', program_key: 'Ministry Of Long-Term Care␟long_term_care␟Transfers', amount_cad: '35.00' },
    { recipient_id: '__smaller_recipients__', target_type: 'smaller_recipients', program_key: 'Ministry Of Long-Term Care␟long_term_care␟Transfers', amount_cad: '1.00' },
    { recipient_id: '__not_itemized__', target_type: 'not_itemized', program_key: 'Ministry Of Health␟hospital_care␟Operations', amount_cad: '10.00' },
    { recipient_id: '__not_itemized__', target_type: 'not_itemized', program_key: 'Ministry Of Long-Term Care␟long_term_care␟Transfers', amount_cad: '15.00' },
  ],
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

test('recipient layout excludes non-itemized money and pages through the named-recipient long tail', () => {
  assert.equal(typeof network.renderFundingNetwork, 'function');
  const layout = network.layoutFundingNetwork(fixture);
  const html = network.renderFundingNetwork(layout, fixture);
  assert.equal((html.match(/<g class="recipient-node[^>]+data-recipient-id=/g) ?? []).length, 2);
  assert.match(html, /1 smaller recipient/);
  assert.doesNotMatch(html, /recipient-node--not-itemized/);
  assert.match(html, /data-recipient-zoom-offset="2"/);
  assert.match(html, /target_type/);
  assert.match(html, /recipient-node--intermediary/);
  assert.match(html, /Ministry of Health/);
  assert.match(html, /Ministry of Long-Term Care/);
  assert.match(html, /\$25.*stops before the named-recipient layer/i);
  assert.doesNotMatch(html, /Source note/);
  assert.doesNotMatch(html, /coverage-split__itemized/);
  assert.doesNotMatch(html, /coverage-split__aggregate/);
  assert.match(html, /Zoom to next 1/);
  assert.match(html, /role="group"/);
  assert.match(html, /Funding purposes/);
  assert.match(html, /Programs/);
  assert.match(html, /Named recipients/);
  assert.doesNotMatch(html, /class="orbit(?: |")/);
  assert.doesNotMatch(html, /class="orbit-label/);
  assert.doesNotMatch(html, /Recipient scale/);

  const tail = network.layoutFundingNetwork(fixture, { recipientOffset: 2 });
  assert.equal(tail.recipients.length, 1);
  assert.equal(tail.recipients[0].recipient_id, 'c');
  assert.equal(tail.recipientScaleTotal, 1);
  const tailHtml = network.renderFundingNetwork(tail, fixture);
  assert.match(tailHtml, /Ranks 3–3 of 3/);
  assert.match(tailHtml, /data-recipient-zoom-back="0"/);
});

test('category focus spreads every program in the selected category and exposes readable labels', () => {
  const focused = network.layoutFundingNetwork(fixture, { focusedCategoryId: 'hospital_care' });
  const html = network.renderFundingNetwork(focused, fixture);
  assert.equal(focused.programs.length, fixture.programs.length);
  assert.equal(focused.focusScale, 'programs');
  assert.equal(focused.programs.filter((row) => row.isContext).length, 1);
  assert.equal((html.match(/class="program-node__label/g) ?? []).length, 0);
  assert.equal((html.match(/class="program-focus-list__item/g) ?? []).length, 1);
  assert.match(html, /class="program-node__index"/);
  assert.match(html, /program-node is-context/);
  assert.match(html, /category-node is-context/);
  assert.match(html, /recipient-node[^>]*is-context/);
  assert.match(html, /data-focus-scale="programs"/);
  assert.match(html, /scale-step--programs" aria-current="step"/);
  assert.match(html, /Showing 1 program in <strong>Hospital care<\/strong>/);
  assert.match(html, /data-program-focus-back/);
  assert.match(html, /category-node__leader/);
  assert.match(html, /category-node__hit/);
});

test('category focus preserves every program coordinate', () => {
  const secondProgram = {
    program_key: 'Ministry Of Health␟hospital_care␟Targeted care',
    label: 'Targeted care', category_id: 'hospital_care', ministry: 'Ministry Of Health',
    amount_cad: '20.00', not_itemized_amount_cad: '0.00',
  };
  const contract = { ...fixture, programs: [...fixture.programs, secondProgram] };
  const base = network.layoutFundingNetwork(contract);
  const focused = network.layoutFundingNetwork(contract, { focusedCategoryId: 'hospital_care' });
  for (const program of base.programs) {
    const next = focused.programByKey.get(program.program_key);
    assert.equal(next.x, program.x, `${program.label} x coordinate changed`);
    assert.equal(next.y, program.y, `${program.label} y coordinate changed`);
    assert.equal(next.angle, program.angle, `${program.label} angle changed`);
  }
});

test('large recipient universes use a spacious fixed-size visual window', () => {
  const recipients = Array.from({ length: 60 }, (_, index) => ({
    recipient_id: `recipient-${index + 1}`,
    label: `Recipient ${index + 1}`,
    payee_type: 'provider',
    amount_cad: String(60 - index),
    global_rank: index + 1,
    path: `payees/recipient-${index + 1}.json`,
  }));
  const expanded = {
    ...fixture,
    recipients,
    displayed_recipient_count: 50,
    named_routes: recipients.map((row) => ({
      recipient_id: row.recipient_id,
      program_key: fixture.programs[0].program_key,
      amount_cad: row.amount_cad,
    })),
  };
  const layout = network.layoutFundingNetwork(expanded);
  assert.equal(layout.recipientPageSize, 24);
  assert.equal(layout.recipients.length, 25);
  assert.ok(layout.width >= 1700);
  assert.ok(layout.recipientBoundary >= 420);
});

test('program focus keeps every system layer visible while repacking that program’s recipients', () => {
  const programKey = fixture.programs[0].program_key;
  const focused = network.layoutFundingNetwork(fixture, {
    focusedCategoryId: 'hospital_care',
    focusedProgramKey: programKey,
  });
  const html = network.renderFundingNetwork(focused, fixture);
  assert.equal(focused.focusScale, 'recipients');
  assert.equal(focused.programs.length, fixture.programs.length);
  assert.deepEqual(focused.recipients.filter((row) => !row.aggregate_kind).map((row) => row.recipient_id), ['a', 'c']);
  assert.equal(focused.recipientScaleTotal, 91);
  assert.match(html, /data-focus-scale="recipients"/);
  assert.match(html, /scale-step--recipients" aria-current="step"/);
  assert.match(html, /program-node[^>]*is-selected/);
  assert.match(html, /data-program-key=/);
  assert.match(html, /Back to Hospital care programs/);
  assert.match(html, /Recipients of <strong>Operations<\/strong>/);
  assert.match(html, /recipient-node[^>]*is-scale-active/);
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
  assert.match(result.tooltip, /Close/);
  assert.match(result.tooltip, /75\.0%/);
  assert.match(result.tooltip, /route-share/);
});

test('formatters use one decimal place and normalize display casing', () => {
  assert.equal(network.formatCad(2_000_000_000), '$2.0B');
  assert.equal(network.displayLabel('Operation Of Hospitals'), 'Operation of Hospitals');
  assert.equal(network.displayLabel('City Of Toronto'), 'City of Toronto');
});
