import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterCategoryDestinations,
  parseFlowV2State,
  serializeFlowV2State,
} from '../src/app-model.mjs';


test('category destination filtering keeps all programs reachable in deterministic pages', () => {
  const category = {
    programs: [
      {
        program_id: 'program-b', label: 'Program B', ministry: 'Ministry Of Health',
        destinations: [
          { destination_id: 'b', label: 'Beta', amount_cad: '20.00', selectable: true },
          { destination_id: 'c', label: 'Community Stop', amount_cad: '5.00', selectable: false },
        ],
      },
      {
        program_id: 'program-a', label: 'Program A', ministry: 'Ministry Of Health',
        destinations: [{ destination_id: 'a', label: 'Alpha', amount_cad: '30.00', selectable: true }],
      },
    ],
  };

  const first = filterCategoryDestinations(category, { limit: 2 });
  const second = filterCategoryDestinations(category, { offset: 2, limit: 2 });

  assert.deepEqual(first.rows.map((row) => row.label), ['Alpha', 'Beta']);
  assert.equal(first.total, 3);
  assert.equal(first.hasMore, true);
  assert.equal(first.rows[0].program_label, 'Program A');
  assert.deepEqual(second.rows.map((row) => row.label), ['Community Stop']);
});

test('category destination search matches destination and source-native program labels', () => {
  const category = {
    programs: [{
      program_id: 'home', label: 'Home Care', ministry: 'Ministry Of Health',
      destinations: [{ destination_id: 'provider', label: 'Example Provider', amount_cad: '10', selectable: true }],
    }],
  };

  assert.equal(filterCategoryDestinations(category, { query: 'provider' }).total, 1);
  assert.equal(filterCategoryDestinations(category, { query: 'home care' }).total, 1);
  assert.equal(filterCategoryDestinations(category, { query: 'hospital' }).total, 0);
});

test('final URL state preserves the selected category program and payee and starts on the landing page', () => {
  const state = { page: 'recipients', category: 'hospital_care', program: 'operation-of-hospitals', payee: 'label-1' };
  const query = serializeFlowV2State(state);
  assert.deepEqual(parseFlowV2State(`?${query}`), state);
  assert.deepEqual(parseFlowV2State(''), { page: 'landing', category: null, program: null, payee: null });
});
