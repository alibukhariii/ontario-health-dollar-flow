import assert from 'node:assert/strict';
import test from 'node:test';

import {
  renderCategoryPage,
  renderDestinationsPage,
  renderPayeePage,
  renderProfilePage,
  renderTotalPage,
} from '../src/renderers.mjs';


test('total page shows two ministries positive payments and keeps the adjustment in a note', () => {
  const html = renderTotalPage({
    fiscal_year: '2025-26', positive_published_payments_cad: '150',
    signed_adjustments_cad: '-40', net_published_payments_cad: '110',
    ministries: [
      { ministry: 'Ministry Of Health', positive_amount_cad: '100', adjustment_cad: '-40', net_amount_cad: '60' },
      { ministry: 'Ministry Of Long-Term Care', positive_amount_cad: '50', adjustment_cad: '0', net_amount_cad: '50' },
    ],
  });

  assert.match(html, /Ministry of Health/);
  assert.match(html, /Ministry of Long-Term Care/);
  assert.match(html, /\$150/);
  assert.match(html, /flow-adjustment/);
  assert.match(html, /\-\$40/);
});

test('headline preserves one decimal place for the public billion-dollar total', () => {
  const html = renderTotalPage({
    positive_published_payments_cad: '97433981876', signed_adjustments_cad: '-421011479',
    ministries: [],
  });
  assert.match(html, /\$97\.4B/);
});

test('category page renders one proportional selectable ribbon per purpose', () => {
  const html = renderCategoryPage({
    positive_published_payments_cad: '100',
    categories: [
      { category_id: 'hospital_care', label: 'Hospital care', amount_cad: '60', share_percent: '60', residual: false },
      { category_id: 'other', label: 'Other', amount_cad: '40', share_percent: '40', residual: true },
    ],
  }, 'hospital_care');

  assert.equal((html.match(/data-category-id=/g) ?? []).length, 2);
  assert.match(html, /--ribbon-share:60/);
  assert.match(html, /purpose-ribbon is-selected/);
  assert.match(html, /purpose-ribbon is-residual/);
});

test('destination page preserves programs and visually distinguishes intermediaries and evidence stops', () => {
  const html = renderDestinationsPage({
    label: 'Primary health care', positive_amount_cad: '100', programs: [{
      program_id: 'primary', label: 'Community Health Centres', ministry: 'Ministry Of Health', positive_amount_cad: '100', adjustment_cad: '0',
      destinations: [
        { destination_id: 'provider', label: 'Provider One', amount_cad: '70', destination_type: 'organization', selectable: true, has_profile: true },
        { destination_id: 'oh', label: 'Ontario Health', amount_cad: '10', destination_type: 'intermediary', selectable: true, has_profile: true },
        { destination_id: 'other', label: 'Not itemized by recipient', amount_cad: '20', destination_type: 'not_itemized', selectable: false, has_profile: false },
      ],
    }],
  }, { limit: 20 });

  assert.match(html, /Community Health Centres/);
  assert.match(html, /destination--intermediary/);
  assert.match(html, /destination--not-itemized/);
  assert.match(html, /No published amounts/);
  assert.doesNotMatch(html, /dotted path/i);
});

test('payee page reconstructs every incoming category and program route', () => {
  const html = renderPayeePage({
    published_label: 'Example Hospital', published_payment_total_cad: '105', is_funding_junction: true,
    incoming_routes: [
      { route_id: 'one', ministry: 'Ministry Of Health', category_label: 'Hospital care', program_label: 'Operation Of Hospitals', amount_cad: '80' },
      { route_id: 'two', ministry: 'Ministry Of Health', category_label: 'Health capital and infrastructure', program_label: 'Major Hospital Projects', amount_cad: '20' },
      { route_id: 'three', ministry: 'Ministry Of Health', category_label: 'Mental health and addictions', program_label: 'Community Mental Health', amount_cad: '5' },
    ],
    profile_status: 'no_published_amounts',
  });

  assert.match(html, /Operation Of Hospitals/);
  assert.match(html, /Major Hospital Projects/);
  assert.match(html, /Community Mental Health/);
  assert.equal((html.match(/incoming-payment-route/g) ?? []).length, 3);
  assert.doesNotMatch(html, /accountability role/i);
});

test('profile page separates revenue and expense bars and has an exact empty state', () => {
  const html = renderProfilePage({
    reporting_entity: 'Example Hospital', fiscal_year: '2025-26',
    revenue_total_cad: '110', expense_total_cad: '100',
    revenue_components: [{ source_label: 'Government funding', amount_cad: '110' }],
    expense_components: [{ source_label: 'Compensation', amount_cad: '75' }, { source_label: 'Supplies', amount_cad: '25' }],
  });
  assert.match(html, /statement-bar--revenue/);
  assert.match(html, /statement-bar--expense/);
  assert.doesNotMatch(html, /incoming-payment-route/);
  assert.match(renderProfilePage(null), /2025–26 financial statement unavailable/);
});
