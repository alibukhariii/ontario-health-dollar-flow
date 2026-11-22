import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderCategoriesCanvas,
  renderCategoryPage,
  renderConvergencePage,
  renderDestinationsPage,
  renderProgramsPage,
  renderRecipientsPage,
  renderPayeePage,
  renderTotalPage,
} from '../src/renderers.mjs';

test('categories canvas combines the total ministries and fourteen downstream purposes', () => {
  const html = renderCategoriesCanvas({
    positive_published_payments_cad: '100',
    ministries: [
      { ministry: 'Ministry Of Health', positive_amount_cad: '90' },
      { ministry: 'Ministry Of Long-Term Care', positive_amount_cad: '10' },
    ],
    categories: [
      { category_id: 'hospital_care', label: 'Hospital care', amount_cad: '60', share_percent: '60' },
      { category_id: 'long_term_care', label: 'Long-term care', amount_cad: '40', share_percent: '40' },
    ],
  });

  assert.match(html, /Ontario directed <strong>\$100<\/strong>/);
  assert.match(html, /--ministry-share:90/);
  assert.match(html, /--ministry-share:10/);
  assert.equal((html.match(/data-category-id=/g) ?? []).length, 2);
  assert.match(html, /structured-alternative/);
});

test('program page uses exact names and explains Operation Of Hospitals once', () => {
  const html = renderProgramsPage({
    category_id: 'hospital_care', label: 'Hospital care', positive_amount_cad: '100',
    programs: [
      { program_id: 'operations', label: 'Operation Of Hospitals', positive_amount_cad: '90', destinations: [] },
      { program_id: 'facilities', label: 'Operation Of Related Facilities', positive_amount_cad: '10', destinations: [] },
    ],
  }, 'operations');

  assert.match(html, /Operation Of Hospitals/);
  assert.match(html, /base, targeted, activity-based and one-time funding/);
  assert.match(html, /data-program-id="operations"/);
  assert.match(html, /--program-share:90/);
});

test('recipients page supports program ranking and the global named-payee universe', () => {
  const convergence = {
    not_itemized_to_public_recipient_cad: '30', not_itemized_share_percent: '30',
    concentration: { top_1_share_of_named_payees_percent: '20', top_5_share_of_named_payees_percent: '45', top_10_share_of_named_payees_percent: '60', payees_to_50_percent: 7, payees_to_80_percent: 20 },
    payees: [{ global_rank: 1, payment_label_id: 'oh', display_label: 'Ontario Health', payee_type: 'intermediary', published_payment_total_cad: '40', path: 'payees/oh.json' }],
  };
  const program = {
    program_id: 'home', label: 'Home Care', positive_amount_cad: '50',
    destinations: [
      { destination_id: 'provider', label: 'Provider One', destination_type: 'service provider', amount_cad: '35', selectable: true, path: 'payees/provider.json', global_rank: 8, global_total_cad: '45' },
      { destination_id: 'not-itemized', label: 'Not itemized by recipient', destination_type: 'not_itemized', amount_cad: '15', selectable: false },
    ],
  };

  const html = renderRecipientsPage(convergence, program, { limit: 20 });
  assert.match(html, /Provider One/);
  assert.match(html, /Global No\. 8/);
  assert.match(html, /Not itemized by recipient/);
  assert.match(html, /terminal-node/);
  assert.match(renderRecipientsPage(convergence, null, { limit: 20 }), /Ontario Health/);
});

test('opening page renders two proportional ministry blocks and the adjustment footnote', () => {
  const html = renderTotalPage({
    fiscal_year: '2025-26',
    positive_published_payments_cad: '150',
    signed_adjustments_cad: '-40',
    net_published_payments_cad: '110',
    ministries: [
      { ministry: 'Ministry Of Health', positive_amount_cad: '100' },
      { ministry: 'Ministry Of Long-Term Care', positive_amount_cad: '50' },
    ],
  });

  assert.equal((html.match(/class="ministry-bucket ministry-bucket--/g) ?? []).length, 2);
  assert.match(html, /Ontario directed/);
  assert.match(html, /\$150/);
  assert.match(html, /positive-payment-note/);
  assert.match(html, /\-\$40/);
  assert.match(html, /--ministry-share:66\.666667/);
  assert.doesNotMatch(html, /Net payments published/);
});

test('funding purposes fan out through one proportional umbrella band each', () => {
  const html = renderCategoryPage({
    positive_published_payments_cad: '100',
    categories: [
      { category_id: 'hospital_care', label: 'Hospital care', amount_cad: '60', share_percent: '60' },
      { category_id: 'home_care', label: 'Home care', amount_cad: '25', share_percent: '25' },
      { category_id: 'other', label: 'Other', amount_cad: '15', share_percent: '15', residual: true },
    ],
  }, 'home_care');

  assert.match(html, /class="purpose-umbrella"/);
  assert.match(html, /class="category-entry-flow"/);
  assert.equal((html.match(/data-category-band=/g) ?? []).length, 3);
  assert.match(html, /data-category-band="hospital_care"/);
  assert.match(html, /--ribbon-share:60/);
  assert.match(html, /purpose-ribbon is-selected/);
});

test('selected category flows through explicit official programs before published recipients', () => {
  const html = renderDestinationsPage({
    category_id: 'home_and_community_care',
    label: 'Home and community care',
    positive_amount_cad: '100',
    programs: [
      {
        program_id: 'assisted', label: 'Assisted Living Services', ministry: 'Ministry Of Health', positive_amount_cad: '70',
        destinations: [{ destination_id: 'march', label: 'March of Dimes', amount_cad: '70', destination_type: 'organization', selectable: true, path: 'payees/march.json' }],
      },
      {
        program_id: 'brain', label: 'Acquired Brain Injury', ministry: 'Ministry Of Health', positive_amount_cad: '30',
        destinations: [
          { destination_id: 'march', label: 'March of Dimes', amount_cad: '20', destination_type: 'organization', selectable: true, path: 'payees/march.json' },
          { destination_id: 'other', label: 'Not itemized by recipient', amount_cad: '10', destination_type: 'not_itemized', selectable: false },
        ],
      },
    ],
  }, { limit: 20 });

  assert.match(html, /category-origin/);
  assert.equal((html.match(/<section class="program-branch"/g) ?? []).length, 2);
  assert.equal((html.match(/class="destination-ribbon destination /g) ?? []).length, 3);
  assert.match(html, /Assisted Living Services/);
  assert.match(html, /Acquired Brain Injury/);
  assert.match(html, /--category-share:70/);
  assert.match(html, /March of Dimes/);
});

test('recipient page leads with the total published payment headline', () => {
  const html = renderPayeePage({
    published_label: 'Example Hospital',
    published_payment_total_cad: '105',
    global_rank: 7,
    incoming_routes: [
      { ministry: 'Ministry Of Health', category_label: 'Hospital care', program_label: 'Operation Of Hospitals', amount_cad: '105' },
    ],
  });

  assert.match(html, /payee-received-title/);
  assert.match(html, /Example Hospital/);
  assert.match(html, /received/);
  assert.match(html, /\$105/);
  assert.match(html, /No\. 7 among named payees/);
});

test('verified organization page retains every published payee label used in its total', () => {
  const html = renderPayeePage({
    published_label: 'Waterloo Regional Health Network',
    published_labels: ['Grand River Hospital Corporation', "St Mary's General Hospital"],
    published_payment_total_cad: '636900000',
    incoming_routes: [
      { ministry: 'Ministry Of Health', category_label: 'Hospital care', program_label: 'Operation Of Hospitals', amount_cad: '636900000' },
    ],
  });

  assert.match(html, /Published under/);
  assert.match(html, /Grand River Hospital Corporation/);
  assert.match(html, /St Mary&#039;s General Hospital/);
});

test('convergence page ranks named organizations and makes the non-itemized share prominent', () => {
  const html = renderConvergencePage({
    named_destination_amount_cad: '70',
    not_itemized_to_public_recipient_cad: '30',
    not_itemized_share_percent: '30',
    organizations: [
      {
        global_rank: 1, payment_label_id: 'alpha', display_label: 'Alpha Health',
        published_payment_total_cad: '40', share_of_all_positive_percent: '40',
        category_count: 3, path: 'payees/alpha.json', identity_status: 'reviewed_resolved',
      },
    ],
    intermediaries: [
      {
        payment_label_id: 'oh', display_label: 'Ontario Health', published_payment_total_cad: '20',
        path: 'payees/oh.json',
      },
    ],
  });

  assert.match(html, /Where the money converged/);
  assert.match(html, /30\.0%/);
  assert.match(html, /not itemized to a public recipient/i);
  assert.match(html, /Alpha Health/);
  assert.match(html, /No\. 1/);
  assert.match(html, /Amount-bearing intermediaries/);
  assert.match(html, /Ontario Health/);
});

test('intermediary recipient view separates passed-on funding from its own operations', () => {
  const html = renderPayeePage({
    published_label: 'Ontario Health',
    published_payment_total_cad: '12',
    incoming_routes: [
      { ministry: 'Ministry Of Health', category_label: 'Home care', program_label: 'Home Care', amount_cad: '12' },
    ],
  }, {
    intermediary_label: 'Ontario Health',
    reported_expense_total_cad: '100',
    groups: [
      { group_id: 'passed_on', group_label: 'Money passed onward', amount_cad: '80', components: [{ source_label: 'Ontario Health atHome', amount_cad: '80', target_payee_id: 'athome', target_payee_path: 'payees/athome.json' }] },
      { group_id: 'own_operations', group_label: 'Ontario Health-run operations', amount_cad: '20', components: [{ source_label: 'Salaries and benefits', amount_cad: '20' }] },
    ],
  });

  assert.match(html, /intermediary-expense-frame/);
  assert.match(html, /Money passed onward/);
  assert.match(html, /Ontario Health-run operations/);
  assert.match(html, /Ontario Health atHome/);
  assert.match(html, /data-payee-id="athome"/);
  assert.match(html, /Salaries and benefits/);
});
