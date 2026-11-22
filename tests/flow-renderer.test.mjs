import assert from 'node:assert/strict';
import test from 'node:test';

import { renderConnectedFlow, renderStructuredFlow } from '../src/flow-renderer.mjs';

const layout = {
  view: 'recipient', width: 800, height: 360, focal_node_id: 'recipient_city',
  statement_status: 'no_published_amounts', financial_profile: null,
  nodes: [
    { node_id: 'ministry_moh', label: 'Ministry <Health>', node_type: 'ministry', x: 10, y: 30, width: 150, height: 50, amount_cad: '100.00' },
    { node_id: 'bucket_public', label: 'Public health', node_type: 'bucket', x: 220, y: 30, width: 150, height: 50, amount_cad: '70.00' },
    { node_id: 'program_official', label: 'Official agencies', node_type: 'program', x: 430, y: 30, width: 150, height: 50, amount_cad: '70.00' },
    { node_id: 'context_municipal', label: 'Municipal co-funding', node_type: 'context', x: 430, y: 130, width: 150, height: 50, amount_cad: null },
    { node_id: 'recipient_city', label: 'City Of Toronto', node_type: 'recipient', x: 640, y: 75, width: 150, height: 66, amount_cad: '100.00' },
  ],
  solid_routes: [
    { route_id: 'solid-1', source_id: 'ministry_moh', target_id: 'bucket_public', source_point: { x: 160, y: 55 }, target_point: { x: 220, y: 55 }, amount_cad: '70.00', amount_status: 'amount_disclosed', share: 0.7, width: 29.4, relationship_label: 'Published payment' },
    { route_id: 'solid-2', source_id: 'bucket_public', target_id: 'program_official', source_point: { x: 370, y: 55 }, target_point: { x: 430, y: 55 }, amount_cad: '70.00', amount_status: 'amount_disclosed', share: 0.7, width: 29.4, relationship_label: 'Published payment' },
    { route_id: 'solid-3', source_id: 'program_official', target_id: 'recipient_city', source_point: { x: 580, y: 55 }, target_point: { x: 640, y: 108 }, amount_cad: '70.00', amount_status: 'amount_disclosed', share: 0.7, width: 29.4, relationship_label: 'Published payment' },
    { route_id: 'solid-4', source_id: 'other_program', target_id: 'recipient_city', source_point: { x: 580, y: 180 }, target_point: { x: 640, y: 108 }, amount_cad: '30.00', amount_status: 'amount_disclosed', share: 0.3, width: 12.6, relationship_label: 'Published payment' },
  ],
  dotted_routes: [
    { route_id: 'dotted-1', source_id: 'context_municipal', target_id: 'recipient_city', source_point: { x: 580, y: 155 }, target_point: { x: 640, y: 108 }, amount_cad: '99.00', amount_status: 'period_or_scope_incompatible', share: null, width: null, relationship_label: 'Separate calendar-year context' },
  ],
  structured_rows: [
    { source: 'Ministry Of Health', bucket: 'Public health', program: 'Official agencies', target: 'City Of Toronto', amount_cad: '70.00', amount_status: 'amount_disclosed', relationship_label: 'Published payment' },
    { source: 'Municipal co-funding', bucket: 'Public health', target: 'City Of Toronto', amount_cad: null, amount_status: 'period_or_scope_incompatible', relationship_label: 'Separate calendar-year context' },
  ],
};

test('connected renderer joins exact endpoints with proportional solid paths', () => {
  const html = renderConnectedFlow(layout, { selectedNodeId: 'recipient_city', contextNodeIds: ['bucket_public'] });
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(html, /<button[^>]*data-node-id="recipient_city"/);
  assert.match(html, /data-route-id="solid-1"[^>]*data-source-id="ministry_moh"[^>]*data-target-id="bucket_public"/);
  assert.match(html, /flow-path--amount/);
  assert.match(html, /--route-width:29\.4px/);
  assert.match(html, /<button[^>]*data-node-id="recipient_city"[^>]*is-selected/);
  assert.match(html, /<button[^>]*data-node-id="bucket_public"[^>]*is-context/);
  assert.doesNotMatch(html, /Ministry <Health>/);
  assert.match(html, /Ministry &lt;Health&gt;/);
});

test('dotted institutional paths never expose or encode an amount', () => {
  const html = renderConnectedFlow(layout);
  const dotted = html.match(/<path[^>]*data-route-id="dotted-1"[^>]*>/)?.[0] ?? '';
  assert.match(dotted, /flow-path--relationship/);
  assert.match(dotted, /stroke-dasharray/);
  assert.doesNotMatch(dotted, /99\.00|data-amount-cad/);
});

test('multi-route recipient renders a junction marker and an in-place evidence stop', () => {
  const html = renderConnectedFlow(layout);
  assert.match(html, /junction-marker-svg/);
  assert.match(html, /No published amounts/);
  assert.match(html, /statement-layer/);
});

test('structured flow is a complete non-SVG equivalent', () => {
  const html = renderStructuredFlow(layout);
  assert.match(html, /Ministry Of Health/);
  assert.match(html, /Official agencies/);
  assert.match(html, /\$70/);
  assert.match(html, /No published amounts/);
  assert.match(html, /Separate calendar-year context/);
});

test('only explicitly actionable nodes are rendered as controls', () => {
  const html = renderConnectedFlow(layout, { actionableNodeIds: ['recipient_city'] });
  assert.match(html, /<button[^>]*data-node-id="recipient_city"/);
  assert.match(html, /<div[^>]*data-node-id="ministry_moh"/);
  assert.doesNotMatch(html, /<button[^>]*data-node-id="ministry_moh"/);
});
