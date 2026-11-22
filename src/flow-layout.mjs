function slug(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-CA')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function amountNumber(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function ribbonWidth(amount, denominator, { maximum = 42, minimum = 2 } = {}) {
  if (amount === null || amount === undefined || amount === '') return null;
  const value = Math.abs(amountNumber(amount));
  const total = Math.abs(amountNumber(denominator));
  if (!total || !Number.isFinite(value)) return null;
  if (!value) return 0;
  return Math.max(minimum, Math.min(maximum, value / total * maximum));
}

function node(node_id, label, node_type, x, y, options = {}) {
  return {
    node_id, label, node_type, x, y,
    width: options.width ?? 190,
    height: options.height ?? 58,
    amount_cad: options.amount_cad ?? null,
    evidence_status: options.evidence_status ?? 'amount_disclosed',
  };
}

function route(source, target, options = {}) {
  return {
    route_id: options.route_id,
    source_id: source.node_id,
    target_id: target.node_id,
    source_point: { x: source.x + source.width, y: source.y + source.height / 2 },
    target_point: { x: target.x, y: target.y + target.height / 2 },
    amount_cad: options.amount_cad ?? null,
    amount_status: options.amount_status ?? 'amount_disclosed',
    denominator_cad: options.denominator_cad ?? null,
    share: options.amount_cad === null || options.amount_cad === undefined || !amountNumber(options.denominator_cad)
      ? null
      : Math.abs(amountNumber(options.amount_cad)) / Math.abs(amountNumber(options.denominator_cad)),
    width: ribbonWidth(options.amount_cad, options.denominator_cad),
    relationship_label: options.relationship_label ?? 'Published payment',
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function layoutOverviewFlow(overview) {
  const bucketGap = 66;
  const bucketStart = 24;
  const bucketNodes = overview.buckets.map((bucket, index) => node(
    `bucket_${slug(bucket.bucket_id)}`, bucket.label, 'bucket', 820, bucketStart + index * bucketGap,
    { amount_cad: bucket.amount_cad, width: 250 },
  ));
  const centreY = average(bucketNodes.map((row) => row.y));
  const totalNode = node('payment_total', 'Net published payments', 'payment_total', 430, centreY, {
    amount_cad: overview.net_published_payments_cad, width: 250, height: 70,
  });
  const ministryNodes = overview.ministries.map((ministry, index) => node(
    `ministry_${slug(ministry.ministry)}`, ministry.ministry, 'ministry', 24,
    centreY - 58 + index * 116, { amount_cad: ministry.amount_cad, width: 230 },
  ));
  const solidRoutes = [
    ...ministryNodes.map((source, index) => route(source, totalNode, {
      route_id: `overview_source_${index}`,
      amount_cad: overview.ministries[index].amount_cad,
      denominator_cad: overview.net_published_payments_cad,
    })),
    ...bucketNodes.map((target, index) => route(totalNode, target, {
      route_id: `overview_bucket_${overview.buckets[index].bucket_id}`,
      amount_cad: overview.buckets[index].amount_cad,
      denominator_cad: overview.net_published_payments_cad,
    })),
  ];
  return {
    view: 'overview',
    width: 1100,
    height: Math.max(220, bucketStart + bucketNodes.length * bucketGap),
    nodes: [...ministryNodes, totalNode, ...bucketNodes],
    solid_routes: solidRoutes,
    dotted_routes: [],
    denominators: [{ denominator_id: 'net_published_payments', amount_cad: overview.net_published_payments_cad }],
    structured_rows: overview.buckets.map((bucket) => ({
      source: 'Net published payments', target: bucket.label, amount_cad: bucket.amount_cad,
      amount_status: 'amount_disclosed', relationship_label: 'Published payment bucket',
    })),
  };
}

export function layoutBucketFlow(bucket, options = {}) {
  const selectedProgram = bucket.programs.find((row) => row.program_id === options.selectedProgramId)
    ?? bucket.programs[0];
  if (!selectedProgram) {
    return { view: 'bucket', width: 1100, height: 260, nodes: [], solid_routes: [], dotted_routes: [], denominators: [], structured_rows: [] };
  }
  const recipients = [...(options.recipients ?? selectedProgram.recipients ?? [])]
    .sort((left, right) => amountNumber(right.amount_cad) - amountNumber(left.amount_cad)
      || left.recipient_label.localeCompare(right.recipient_label, 'en-CA'));
  const recipientNodes = recipients.map((recipient, index) => node(
    `recipient_${slug(recipient.payment_label_id)}`, recipient.recipient_label, 'recipient', 850, 24 + index * 72,
    { amount_cad: recipient.amount_cad, width: 240 },
  ));
  const centreY = average(recipientNodes.map((row) => row.y)) || 90;
  const sourceNode = node(`ministry_${slug(selectedProgram.ministry)}`, selectedProgram.ministry, 'ministry', 20, centreY, { width: 210 });
  const bucketNode = node(`bucket_${slug(bucket.bucket_id)}`, bucket.label, 'bucket', 280, centreY, { amount_cad: bucket.amount_cad, width: 190 });
  const programNode = node(`program_${slug(selectedProgram.program_id)}`, selectedProgram.label, 'program', 550, centreY, { amount_cad: selectedProgram.amount_cad, width: 220 });
  const solidRoutes = [
    route(sourceNode, bucketNode, { route_id: 'bucket_source', amount_cad: selectedProgram.amount_cad, denominator_cad: bucket.amount_cad }),
    route(bucketNode, programNode, { route_id: 'bucket_program', amount_cad: selectedProgram.amount_cad, denominator_cad: bucket.amount_cad }),
    ...recipientNodes.map((target, index) => route(programNode, target, {
      route_id: `bucket_recipient_${recipients[index].payment_label_id}`,
      amount_cad: recipients[index].amount_cad,
      denominator_cad: selectedProgram.positive_destination_cad ?? selectedProgram.amount_cad,
    })),
  ];
  const contextNodes = (bucket.special_routes ?? []).map((context, index) => node(
    `context_${slug(context.route_type)}`, context.label, 'context', 590,
    Math.max(centreY + 105, recipientNodes.length * 72 + 45 + index * 72),
    { width: 210, evidence_status: context.amount_status ?? 'relationship_disclosed_amount_not_disclosed' },
  ));
  const dottedRoutes = contextNodes.map((target, index) => route(bucketNode, target, {
    route_id: `bucket_context_${index}`, amount_cad: null,
    amount_status: target.evidence_status,
    relationship_label: bucket.special_routes[index].label,
  }));
  return {
    view: 'bucket', width: 1120,
    height: Math.max(280, recipientNodes.length * 72 + 120, ...contextNodes.map((row) => row.y + row.height + 30)),
    nodes: [sourceNode, bucketNode, programNode, ...recipientNodes, ...contextNodes],
    solid_routes: solidRoutes,
    dotted_routes: dottedRoutes,
    denominators: [
      { denominator_id: 'bucket', amount_cad: bucket.amount_cad },
      { denominator_id: 'program_positive_destinations', amount_cad: selectedProgram.positive_destination_cad ?? selectedProgram.amount_cad },
    ],
    structured_rows: [
      ...recipients.map((recipient) => ({ source: selectedProgram.label, target: recipient.recipient_label, amount_cad: recipient.amount_cad, amount_status: 'amount_disclosed', relationship_label: 'Published payment' })),
      ...(bucket.special_routes ?? []).map((context) => ({ source: bucket.label, target: context.label, amount_cad: null, amount_status: context.amount_status, relationship_label: context.label })),
    ],
    selected_program_id: selectedProgram.program_id,
  };
}

export function layoutRecipientFlow(recipient) {
  const sortedRoutes = [...(recipient.incoming_routes ?? [])]
    .sort((left, right) => amountNumber(right.amount_cad) - amountNumber(left.amount_cad)
      || left.bucket_label.localeCompare(right.bucket_label, 'en-CA')
      || left.program_label.localeCompare(right.program_label, 'en-CA'));
  const groupedPrograms = new Map();
  for (const row of sortedRoutes) {
    const key = `${row.ministry}\u001f${row.bucket_id}\u001f${row.program_label}`;
    const current = groupedPrograms.get(key) ?? { ...row, amount_cad: 0 };
    current.amount_cad += amountNumber(row.amount_cad);
    groupedPrograms.set(key, current);
  }
  const programs = [...groupedPrograms.values()].sort((left, right) => right.amount_cad - left.amount_cad
    || left.bucket_label.localeCompare(right.bucket_label, 'en-CA')
    || left.program_label.localeCompare(right.program_label, 'en-CA'));
  const programNodes = programs.map((program, index) => node(
    `program_${slug(program.ministry)}_${slug(program.bucket_id)}_${slug(program.program_label)}`,
    program.program_label, 'program', 590, 24 + index * 76,
    { amount_cad: program.amount_cad.toFixed(2), width: 240 },
  ));
  const recipientY = average(programNodes.map((row) => row.y)) || 80;
  const recipientNode = node(`recipient_${slug(recipient.payment_label_id)}`, recipient.recipient_label, 'recipient', 1040, recipientY, {
    amount_cad: recipient.published_payment_total_cad, width: 250, height: 76,
  });
  const bucketGroups = new Map();
  programs.forEach((program, index) => {
    const key = `${program.ministry}\u001f${program.bucket_id}`;
    const current = bucketGroups.get(key) ?? { ministry: program.ministry, bucket_id: program.bucket_id, bucket_label: program.bucket_label, amount: 0, programIndexes: [] };
    current.amount += program.amount_cad;
    current.programIndexes.push(index);
    bucketGroups.set(key, current);
  });
  const buckets = [...bucketGroups.values()].sort((left, right) => right.amount - left.amount
    || left.bucket_label.localeCompare(right.bucket_label, 'en-CA'));
  const bucketNodes = buckets.map((bucket) => node(
    `bucket_${slug(bucket.ministry)}_${slug(bucket.bucket_id)}`, bucket.bucket_label, 'bucket', 315,
    average(bucket.programIndexes.map((index) => programNodes[index].y)),
    { amount_cad: bucket.amount.toFixed(2), width: 200 },
  ));
  const ministryGroups = new Map();
  buckets.forEach((bucket, index) => {
    const current = ministryGroups.get(bucket.ministry) ?? { ministry: bucket.ministry, amount: 0, bucketIndexes: [] };
    current.amount += bucket.amount;
    current.bucketIndexes.push(index);
    ministryGroups.set(bucket.ministry, current);
  });
  const ministries = [...ministryGroups.values()].sort((left, right) => left.ministry.localeCompare(right.ministry, 'en-CA'));
  const ministryNodes = ministries.map((ministry) => node(
    `ministry_${slug(ministry.ministry)}`, ministry.ministry, 'ministry', 20,
    average(ministry.bucketIndexes.map((index) => bucketNodes[index].y)),
    { amount_cad: ministry.amount.toFixed(2), width: 220 },
  ));
  const total = recipient.published_payment_total_cad;
  const solidRoutes = [];
  buckets.forEach((bucket, index) => {
    const source = ministryNodes.find((row) => row.node_id === `ministry_${slug(bucket.ministry)}`);
    solidRoutes.push(route(source, bucketNodes[index], {
      route_id: `recipient_source_${index}`, amount_cad: bucket.amount.toFixed(2), denominator_cad: total,
    }));
  });
  programs.forEach((program, index) => {
    const bucketNode = bucketNodes.find((row) => row.node_id === `bucket_${slug(program.ministry)}_${slug(program.bucket_id)}`);
    solidRoutes.push(route(bucketNode, programNodes[index], {
      route_id: `recipient_program_${index}`, amount_cad: program.amount_cad.toFixed(2), denominator_cad: total,
    }));
    solidRoutes.push(route(programNodes[index], recipientNode, {
      route_id: `recipient_final_${index}`, amount_cad: program.amount_cad.toFixed(2), denominator_cad: total,
    }));
  });
  const contexts = [...(recipient.institutional_context ?? [])].sort((left, right) => left.context_id.localeCompare(right.context_id));
  const contextNodes = contexts.map((context, index) => node(
    `context_${slug(context.context_id)}`, context.source_label, 'context', 785,
    recipientY + 110 + index * 70, { width: 190, evidence_status: context.amount_status },
  ));
  const dottedRoutes = [];
  contexts.forEach((context, index) => {
    const source = bucketNodes.find((row) => row.node_id.endsWith(`_${slug(context.bucket_id)}`));
    if (source) dottedRoutes.push(route(source, contextNodes[index], {
      route_id: `context_in_${index}`, amount_cad: null, amount_status: context.amount_status,
      relationship_label: context.relationship_label,
    }));
    dottedRoutes.push(route(contextNodes[index], recipientNode, {
      route_id: `context_out_${index}`, amount_cad: null, amount_status: context.amount_status,
      relationship_label: context.relationship_label,
    }));
  });
  return {
    view: 'recipient', width: 1320,
    height: Math.max(330, programNodes.length * 76 + 80, ...contextNodes.map((row) => row.y + row.height + 30)),
    nodes: [...ministryNodes, ...bucketNodes, ...programNodes, ...contextNodes, recipientNode],
    solid_routes: solidRoutes,
    dotted_routes: dottedRoutes,
    denominators: [{ denominator_id: 'recipient_published_payments', amount_cad: total }],
    structured_rows: [
      ...programs.map((program) => ({ source: program.ministry, bucket: program.bucket_label, program: program.program_label, target: recipient.recipient_label, amount_cad: program.amount_cad.toFixed(2), amount_status: 'amount_disclosed', relationship_label: 'Published payment' })),
      ...contexts.map((context) => ({ source: context.source_label, bucket: context.bucket_id, target: recipient.recipient_label, amount_cad: null, amount_status: context.amount_status, relationship_label: context.relationship_label })),
    ],
    statement_status: recipient.financial_profile ? 'available' : 'no_published_amounts',
    financial_profile: recipient.financial_profile ?? null,
    focal_node_id: recipientNode.node_id,
  };
}
