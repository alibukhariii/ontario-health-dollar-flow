#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Iterable

import flow_v2_data


APPROVED_PUBLICATION_STATUSES = {
    "approved_for_publication",
    "approved_automated_review",
}

SYSTEM_MAP_VOCABULARY = {
    "topologies": ["fan_in", "fan_out", "chain", "containment", "composition", "accounting_boundary"],
    "funding_mechanisms": [
        "base_allocation", "targeted_or_one_time_funding", "service_accountability_funding",
        "transfer_payment", "procurement_or_service_contract", "claim_reimbursement",
        "formula_or_per_diem_funding", "capital_contribution", "co_funding",
        "internal_program_operations", "recovery_or_settlement", "unknown_or_not_disclosed",
    ],
    "institutional_roles": [
        "policy_setter", "appropriator", "funder", "allocator", "purchaser",
        "claims_administrator", "accountability_manager", "program_operator", "service_provider",
        "published_payee", "legal_recipient", "fund_holder", "collaborative_network",
    ],
    "relationship_types": [
        "sets_policy", "authorizes", "classifies_expense", "allocates", "funds",
        "records_payment_to", "purchases_service_from", "adjudicates_claim", "holds_accountable",
        "operates_program", "delivers_service", "hosts_program", "owns_or_controls", "member_of",
        "reports_revenue_or_expense", "context_only",
    ],
    "evidence_states": [
        "amount_disclosed", "relationship_disclosed_amount_not_disclosed", "source_does_not_specify",
        "source_unavailable", "period_or_scope_incompatible", "identity_unresolved",
        "restricted_from_publication", "not_collected_in_current_scope",
    ],
}


FLOW_BUCKETS = (
    ("hospitals", "Hospitals"),
    ("physicians_and_primary_care", "Physicians and primary care"),
    ("drugs_and_devices", "Drugs and devices"),
    ("long_term_care", "Long-term care"),
    ("home_and_community_care", "Home and community care"),
    ("capital", "Capital"),
    ("mental_health_and_addictions", "Mental health and addictions"),
    ("cancer_care", "Cancer care"),
    ("system_operations_and_other", "System operations and other"),
    ("public_health", "Public health"),
    ("ambulance_and_emergency", "Ambulance and emergency services"),
    ("health_workforce_and_education", "Health workforce and education"),
    ("blood_services", "Blood services"),
    ("renal_care", "Renal care"),
)

FLOW_BUCKET_LABELS = dict(FLOW_BUCKETS)

FLOW_SERVICE_BUCKETS = {
    "hospitals": "hospitals",
    "physicians_and_practitioners": "physicians_and_primary_care",
    "community_primary_care": "physicians_and_primary_care",
    "drugs_and_devices": "drugs_and_devices",
    "long_term_care": "long_term_care",
    "home_and_community_care": "home_and_community_care",
    "mental_health_and_addictions": "mental_health_and_addictions",
    "cancer_care": "cancer_care",
    "public_health": "public_health",
    "ambulance_services": "ambulance_and_emergency",
    "health_workforce_and_education": "health_workforce_and_education",
    "blood_services": "blood_services",
    "renal_care": "renal_care",
}


def stable_id(prefix: str, *parts: object) -> str:
    raw = "\x1f".join(str(part) for part in parts)
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]}"


def public_label(value: str) -> str:
    return value.replace("_", " ").strip().title()


def _reviewed_mixed_category(row: dict[str, str]) -> str:
    """Conservative presentation mapping for previously mixed source-native lines."""
    program = row.get("program_name", "")
    activity = row.get("activity_item", "")
    if program == "Ministry Administration Program":
        return "ministry_administration"
    if program == "Health Policy and Research Program":
        return "health_policy_and_research"
    if program == "Digital, Data and Analytics Program":
        return "digital_data_and_analytics"
    if program == "Ontario Health Insurance Program":
        if activity in {"Drug Programs", "Assistive Devices Program"}:
            return "drugs_and_devices"
        return "insurance_and_claims_administration"
    if program == "Population and Public Health Program":
        return "public_health"
    if program == "Provincial Programs and Stewardship Program":
        if activity == "Emergency Health Services":
            return "ambulance_services"
        if activity == "Stewardship":
            return "system_stewardship"
        return "source_does_not_specify"
    if program == "Health Services and Programs" and activity == "Community":
        return "home_and_community_care"
    return "source_does_not_specify"


def build_reviewed_expense_categories(
    original_categories: Iterable[dict[str, str]],
    expense_lines: Iterable[dict[str, str]],
) -> list[dict[str, str]]:
    category_by_line: dict[str, str] = {}
    for category in original_categories:
        source_ids = category.get("source_record_ids", "").split("|")
        for source_id in filter(None, source_ids):
            category_by_line[source_id] = category["presentation_category"]
    grouped: dict[str, dict[str, object]] = {}
    for row in expense_lines:
        amount = Decimal(row["amount_cad"])
        if amount < 0:
            continue
        source_id = row["expense_line_id"]
        category = category_by_line.get(source_id, "source_does_not_specify")
        if category == "mixed_or_unallocated":
            category = _reviewed_mixed_category(row)
        target = grouped.setdefault(category, {"amount": Decimal("0"), "ids": []})
        target["amount"] += amount
        target["ids"].append(source_id)
    return [
        {
            "presentation_category": category,
            "amount_cad": money(value["amount"]),
            "source_record_ids": "|".join(sorted(value["ids"])),
        }
        for category, value in sorted(grouped.items())
    ]


def _edge(
    *,
    source: str,
    target: str,
    relationship: str,
    topology: str,
    mechanism: str | None,
    amount: Decimal | str | None,
    denominator_id: str | None,
    fiscal_year: str,
    evidence_state: str = "amount_disclosed",
    amount_owner: str = "source_publication",
    aggregation_eligible: bool = False,
    amount_stage: str = "accounting_composition",
    evidence_source: str = "Ontario Public Accounts 2025-26",
    accounting_frame: str = "ministry_expense",
    organizational_scope: str = "Ontario ministry accounting frame",
    funding_scope: str = "actual expense",
    economic_event_id: str | None = None,
    overlap_group_id: str | None = None,
    reconciliation_group_id: str | None = None,
    source_roles: Iterable[str] = (),
    target_roles: Iterable[str] = (),
) -> dict[str, object]:
    resolved_event_id = economic_event_id or stable_id("event", fiscal_year, source, target, amount_stage)
    edge_id = stable_id(
        "edge", source, target, relationship, mechanism or "none", amount_stage,
        resolved_event_id, amount if amount is not None else "undisclosed", funding_scope,
    )
    return {
        "edge_id": edge_id,
        "source_node_id": source,
        "target_node_id": target,
        "relationship_type": relationship,
        "direction": "source_to_target",
        "topology": topology,
        "funding_mechanism": mechanism,
        "source_roles": list(source_roles),
        "target_roles": list(target_roles),
        "amount_cad": money(amount) if amount is not None else None,
        "amount_status": evidence_state,
        "amount_owner": amount_owner,
        "accounting_frame": accounting_frame,
        "denominator_id": denominator_id,
        "period": fiscal_year,
        "effective_start": f"{fiscal_year[:4]}-04-01",
        "effective_end": f"20{int(fiscal_year[-2:]):02d}-03-31",
        "organizational_scope": organizational_scope,
        "funding_scope": funding_scope,
        "evidence_source": evidence_source,
        "publication_status": "approved_automated_review",
        "navigation_permissions": ["upstream", "downstream", "evidence"],
        "economic_event_id": resolved_event_id,
        "overlap_group_id": overlap_group_id or stable_id("overlap", fiscal_year, accounting_frame),
        "reconciliation_group_id": reconciliation_group_id or stable_id("reconciliation", fiscal_year, denominator_id or "none"),
        "amount_stage": amount_stage,
        "aggregation_eligible": aggregation_eligible,
    }


def build_system_map_contract(
    *,
    release_id: str,
    fiscal_year: str,
    ministry_sources: Iterable[dict[str, str]],
    categories: Iterable[dict[str, str]],
    expense_total: Decimal,
    adjustments: Iterable[dict[str, str]] = (),
) -> dict[str, object]:
    root_id = stable_id("node", fiscal_year, "combined-ministry-expense")
    denominator_id = f"ministry_actual_expense_{fiscal_year.replace('-', '_')}"
    positive_id = f"ministry_positive_flows_{fiscal_year.replace('-', '_')}"
    category_rows = list(categories)
    positive_total = sum(Decimal(row["amount_cad"]) for row in category_rows)
    nodes: list[dict[str, object]] = [{
        "node_id": root_id,
        "node_type": "accounting_frame",
        "label": "Combined ministry actual expense",
        "amount_cad": money(expense_total),
        "period": fiscal_year,
        "roles": [],
        "topologies": ["composition", "accounting_boundary"],
        "evidence_state": "amount_disclosed",
        "accounting_frame": "ministry_expense",
        "denominator_id": denominator_id,
        "denominator_label": "Combined ministry actual expense",
        "denominator_amount_cad": money(expense_total),
        "description": "Combined Ministry of Health and Ministry of Long-Term Care actual-expense frame; not the broader consolidated health-sector expense.",
    }]
    edges: list[dict[str, object]] = []
    for row in ministry_sources:
        ministry_slug = row["ministry"].casefold().replace(" ", "-")
        node_id = stable_id("node", fiscal_year, "ministry", ministry_slug)
        nodes.append({
            "node_id": node_id, "node_type": "ministry_source",
            "label": f"Ministry of {row['ministry']}", "amount_cad": money(row["amount_cad"]),
            "period": fiscal_year, "roles": ["appropriator", "policy_setter", "funder"],
            "topologies": ["composition"], "evidence_state": "amount_disclosed",
            "accounting_frame": "ministry_expense", "denominator_id": denominator_id,
            "denominator_label": "Combined ministry actual expense", "denominator_amount_cad": money(expense_total),
        })
        edges.append(_edge(source=node_id, target=root_id, relationship="classifies_expense", topology="composition", mechanism=None, amount=row["amount_cad"], denominator_id=denominator_id, fiscal_year=fiscal_year, aggregation_eligible=True))
    for row in category_rows:
        category_id = row["presentation_category"]
        node_id = stable_id("node", fiscal_year, "expense-purpose", category_id)
        evidence_state = "source_does_not_specify" if category_id == "source_does_not_specify" else "amount_disclosed"
        nodes.append({
            "node_id": node_id, "node_type": "spending_purpose",
            "label": public_label(category_id), "amount_cad": money(row["amount_cad"]),
            "period": fiscal_year, "roles": [], "topologies": ["composition"],
            "evidence_state": evidence_state, "accounting_frame": "ministry_expense",
            "denominator_id": positive_id, "category_id": category_id,
            "denominator_label": "Positive ministry expense lines", "denominator_amount_cad": money(positive_total),
            "source_record_ids": row.get("source_record_ids", "").split("|") if row.get("source_record_ids") else [],
        })
        edges.append(_edge(source=root_id, target=node_id, relationship="classifies_expense", topology="composition", mechanism=None, amount=row["amount_cad"], denominator_id=positive_id, fiscal_year=fiscal_year, evidence_state=evidence_state, aggregation_eligible=True))
    for row in adjustments:
        amount = Decimal(row["amount_cad"])
        node_id = stable_id("node", fiscal_year, "adjustment", row.get("source_record_id", str(amount)))
        nodes.append({
            "node_id": node_id, "node_type": "signed_adjustment", "label": "Recovery or settlement",
            "amount_cad": money(amount), "period": fiscal_year, "roles": [], "topologies": ["fan_in"],
            "evidence_state": "amount_disclosed", "accounting_frame": "ministry_expense", "denominator_id": denominator_id,
            "denominator_label": "Combined ministry actual expense", "denominator_amount_cad": money(expense_total),
        })
        edges.append(_edge(source=node_id, target=root_id, relationship="classifies_expense", topology="fan_in", mechanism="recovery_or_settlement", amount=amount, denominator_id=denominator_id, fiscal_year=fiscal_year, aggregation_eligible=False, amount_stage="signed_adjustment"))
    return {
        "schema_version": "2.0.0", "release_id": release_id, "fiscal_year": fiscal_year,
        "root_node_id": root_id, "vocabulary": SYSTEM_MAP_VOCABULARY,
        "nodes": sorted(nodes, key=lambda row: row["node_id"]),
        "edges": sorted(edges, key=lambda row: row["edge_id"]),
        "limitations": [
            "Composition connections describe an accounting total; they are not cash-transfer arrows.",
            "Widths are comparable only within the denominator printed for the current neighbourhood.",
        ],
    }


def _payment_mechanism(payment_category: str, service_category: str, payment_detail: str) -> str:
    category = payment_category.casefold()
    detail = payment_detail.casefold()
    if "statutory" in category and service_category in {
        "physicians_and_practitioners", "drugs_and_devices", "laboratory_services"
    }:
        return "claim_reimbursement"
    if "capital" in detail or "infrastructure" in detail or "hospital projects" in detail:
        return "capital_contribution"
    if "transfer" in category:
        return "transfer_payment"
    return "unknown_or_not_disclosed"


def _organization_roles(name: str, entity_level: str) -> list[str]:
    normalized = name.casefold()
    if normalized == "ontario health":
        return ["allocator", "funder", "accountability_manager", "program_operator", "legal_recipient"]
    if normalized == "ontario health athome":
        return ["purchaser", "accountability_manager", "program_operator", "service_provider", "legal_recipient"]
    roles = ["legal_recipient"]
    if entity_level in {"hospital_corporation", "licensee", "health_service_provider"}:
        roles.append("service_provider")
    return roles


def enrich_system_map_contract(
    contract: dict[str, object],
    *,
    disclosed_payment_total: Decimal,
    rankings: dict[str, object],
    profiles: dict[str, object],
    reviewed_links: Iterable[dict[str, str]],
    athome_observations: Iterable[dict[str, str]] = (),
) -> dict[str, object]:
    """Attach payment, verified-identity and audited-use frames without conflating them."""
    fiscal_year = contract["fiscal_year"]
    nodes: list[dict[str, object]] = list(contract["nodes"])
    edges: list[dict[str, object]] = list(contract["edges"])
    node_ids = {row["node_id"] for row in nodes}
    root_id = contract["root_node_id"]

    payment_frame_id = stable_id("node", fiscal_year, "disclosed-payment-frame")
    explorer_frame_id = stable_id("node", fiscal_year, "non-person-positive-payment-frame")
    payment_denominator = f"public_non_person_positive_payments_{fiscal_year.replace('-', '_')}"
    explorer_total = rankings["included_amount_cad"]
    nodes.extend([
        {
            "node_id": payment_frame_id, "node_type": "payment_disclosure_frame",
            "label": "Disclosed ministry payment records", "amount_cad": money(disclosed_payment_total),
            "period": fiscal_year, "roles": [], "topologies": ["accounting_boundary"],
            "evidence_state": "amount_disclosed", "accounting_frame": "disclosed_payment",
            "denominator_id": f"disclosed_payments_{fiscal_year.replace('-', '_')}",
            "denominator_label": "Net disclosed ministry payments", "denominator_amount_cad": money(disclosed_payment_total),
            "description": "A payment-disclosure frame, not the ministry accrual-expense ledger.",
        },
        {
            "node_id": explorer_frame_id, "node_type": "payment_explorer_frame",
            "label": "Non-person, non-negative payment lines", "amount_cad": rankings["included_amount_cad"],
            "period": fiscal_year, "roles": [], "topologies": ["composition", "accounting_boundary"],
            "evidence_state": "amount_disclosed", "accounting_frame": "disclosed_payment",
            "denominator_id": payment_denominator,
            "denominator_label": "Non-person, non-negative payment lines", "denominator_amount_cad": explorer_total,
            "description": "The publishable subset used for recipient navigation; people and signed negative lines are excluded.",
        },
    ])
    edges.append(_edge(
        source=root_id, target=payment_frame_id, relationship="context_only", topology="accounting_boundary",
        mechanism=None, amount=None, denominator_id=None, fiscal_year=fiscal_year,
        evidence_state="period_or_scope_incompatible", amount_owner="separate_public_accounts_schedule",
        accounting_frame="cross_frame_context", organizational_scope="Ontario ministry publications",
        funding_scope="not reconciled", amount_stage="accounting_boundary", aggregation_eligible=False,
    ))
    edges.append(_edge(
        source=payment_frame_id, target=explorer_frame_id, relationship="context_only", topology="accounting_boundary",
        mechanism=None, amount=None, denominator_id=payment_denominator, fiscal_year=fiscal_year,
        evidence_state="amount_disclosed", amount_owner="Ontario Public Accounts payment schedules",
        accounting_frame="disclosed_payment", organizational_scope="public non-person payment labels",
        funding_scope="non-negative publishable subset", amount_stage="publication_filter", aggregation_eligible=False,
    ))

    facts: list[dict[str, object]] = rankings["facts"]
    service_totals: dict[str, Decimal] = defaultdict(Decimal)
    for fact in facts:
        service_totals[fact["service_category"]] += Decimal(fact["amount_cad"])
    service_node_ids: dict[str, str] = {}
    for category, total in sorted(service_totals.items()):
        node_id = stable_id("node", fiscal_year, "payment-service", category)
        service_node_ids[category] = node_id
        nodes.append({
            "node_id": node_id, "node_type": "payment_program", "label": public_label(category),
            "amount_cad": money(total), "period": fiscal_year, "roles": [], "topologies": ["composition", "fan_out"],
            "evidence_state": "amount_disclosed", "accounting_frame": "disclosed_payment",
            "denominator_id": payment_denominator,
            "denominator_label": "Non-person, non-negative payment lines", "denominator_amount_cad": explorer_total,
            "description": "Grouping from published payment records; not an expense-ledger category.",
        })
        edges.append(_edge(
            source=explorer_frame_id, target=node_id, relationship="context_only", topology="composition",
            mechanism=None, amount=total, denominator_id=payment_denominator, fiscal_year=fiscal_year,
            accounting_frame="disclosed_payment", organizational_scope="published payment labels",
            funding_scope="non-negative non-person payment records", amount_stage="payment_classification",
            aggregation_eligible=True,
        ))

    expense_category_nodes = {
        row.get("category_id"): row["node_id"]
        for row in nodes
        if row.get("node_type") == "spending_purpose" and row.get("category_id")
    }
    for category in sorted(set(expense_category_nodes) & set(service_node_ids)):
        edges.append(_edge(
            source=expense_category_nodes[category], target=service_node_ids[category],
            relationship="context_only", topology="accounting_boundary", mechanism=None,
            amount=None, denominator_id=None, fiscal_year=fiscal_year,
            evidence_state="period_or_scope_incompatible",
            amount_owner="separate Public Accounts accounting frames",
            accounting_frame="cross_frame_context", organizational_scope="source-native category labels",
            funding_scope="same presentation category across unreconciled ledgers",
            evidence_source="Ontario Public Accounts ministry statements and detailed payments 2025-26",
            amount_stage="accounting_boundary", aggregation_eligible=False,
        ))

    label_node_ids: dict[str, str] = {}
    label_amounts: dict[str, Decimal] = {}
    for label in rankings["labels"]:
        label_id = label["payment_label_id"]
        node_id = stable_id("node", fiscal_year, "payment-label", label_id)
        label_node_ids[label_id] = node_id
        label_amounts[label_id] = Decimal(label["amount_cad"])
        nodes.append({
            "node_id": node_id, "node_type": "published_payment_label", "label": label["recipient_label"],
            "amount_cad": label["amount_cad"], "period": fiscal_year, "roles": ["published_payee"],
            "topologies": ["fan_in"], "evidence_state": "amount_disclosed",
            "accounting_frame": "disclosed_payment", "denominator_id": payment_denominator,
            "denominator_label": "Non-person, non-negative payment lines", "denominator_amount_cad": explorer_total,
            "recipient_class": label["recipient_class"], "payment_label_id": label_id,
            "description": "The exact published payee label; not automatically a legal-entity identity.",
        })
    for fact in facts:
        label_id = fact["payment_label_id"]
        if label_id not in label_node_ids:
            continue
        mechanism = _payment_mechanism(
            fact["payment_category"], fact["service_category"], fact["payment_detail"]
        )
        event_id = stable_id(
            "event", fiscal_year, "payment-fact", label_id, fact["ministry"],
            fact["service_category"], fact["payment_category"], fact["payment_detail"],
        )
        edges.append(_edge(
            source=service_node_ids[fact["service_category"]], target=label_node_ids[label_id],
            relationship="records_payment_to", topology="fan_out", mechanism=mechanism,
            amount=fact["amount_cad"], denominator_id=payment_denominator, fiscal_year=fiscal_year,
            accounting_frame="disclosed_payment", organizational_scope="published payment label",
            funding_scope=fact["payment_detail"], evidence_source="Ontario Public Accounts detailed payments 2025-26",
            economic_event_id=event_id, overlap_group_id=stable_id("overlap", fiscal_year, label_id),
            reconciliation_group_id=stable_id("reconciliation", fiscal_year, "payment-frame"),
            amount_stage="published_payment_record", aggregation_eligible=True,
            target_roles=["published_payee"],
        ))

    entity_node_ids: dict[str, str] = {}
    reviewed_link_rows = [
        row for row in reviewed_links
        if row.get("review_status", "").startswith("reviewed") or row.get("outcome") == "reviewed_resolved"
    ]
    for link in reviewed_link_rows:
        entity_id = link["entity_id"]
        node_id = stable_id("node", fiscal_year, "entity", entity_id)
        entity_node_ids[entity_id] = node_id
        if node_id not in node_ids:
            roles = _organization_roles(link["authoritative_name"], link.get("entity_level", ""))
            nodes.append({
                "node_id": node_id, "node_type": "legal_organization", "label": link["authoritative_name"],
                "amount_cad": None, "period": fiscal_year, "roles": roles,
                "topologies": ["fan_in", "fan_out"], "evidence_state": "amount_disclosed",
                "accounting_frame": "entity_identity", "denominator_id": None,
                "entity_id": entity_id, "entity_level": link.get("entity_level", ""),
            })
            node_ids.add(node_id)
        label_id = link.get("payment_label_id", "")
        if label_id in label_node_ids:
            amount = label_amounts[label_id]
            payment_event = stable_id("event", fiscal_year, "payment-label-total", label_id)
            edges.append(_edge(
                source=label_node_ids[label_id], target=node_id, relationship="records_payment_to",
                topology="accounting_boundary", mechanism="unknown_or_not_disclosed", amount=amount,
                denominator_id=payment_denominator, fiscal_year=fiscal_year,
                accounting_frame="entity_identity", organizational_scope=link.get("entity_level", "legal entity"),
                funding_scope="identity-resolved published payment label", evidence_source=link.get("source_id", "authoritative entity registry"),
                economic_event_id=payment_event, overlap_group_id=stable_id("overlap", fiscal_year, label_id),
                reconciliation_group_id=stable_id("reconciliation", fiscal_year, label_id),
                amount_stage="identity_resolution", aggregation_eligible=False,
                source_roles=["published_payee"], target_roles=_organization_roles(link["authoritative_name"], link.get("entity_level", "")),
            ))

    link_by_name = {
        row["authoritative_name"].strip().casefold(): row
        for row in reviewed_link_rows
        if row.get("authoritative_name")
    }
    for profile in profiles["profiles"]:
        matched_link = link_by_name.get(profile["reporting_entity"].strip().casefold())
        entity_id = matched_link["entity_id"] if matched_link else profile["entity_id"]
        node_id = entity_node_ids.get(entity_id, stable_id("node", fiscal_year, "entity", entity_id))
        if node_id not in node_ids:
            nodes.append({
                "node_id": node_id, "node_type": "legal_organization", "label": profile["reporting_entity"],
                "amount_cad": None, "period": fiscal_year,
                "roles": _organization_roles(profile["reporting_entity"], "reporting_entity"),
                "topologies": ["fan_in", "fan_out"], "evidence_state": "amount_disclosed",
                "accounting_frame": "audited_financial_statement", "denominator_id": None,
                "entity_id": entity_id, "entity_level": "audited_reporting_entity",
            })
            node_ids.add(node_id)
        entity_node_ids[entity_id] = node_id
        for statement_class in ("expense", "revenue"):
            total = profile[f"{statement_class}_total_cad"]
            components = profile[f"{statement_class}_components"]
            if not total or not components:
                continue
            boundary_id = stable_id("node", fiscal_year, entity_id, statement_class, "boundary")
            denominator = f"{entity_id}_{statement_class}_{fiscal_year.replace('-', '_')}"
            nodes.append({
                "node_id": boundary_id, "node_type": "audited_reporting_boundary",
                "label": f"Reported {statement_class}", "amount_cad": total, "period": fiscal_year,
                "roles": [], "topologies": ["accounting_boundary", "composition"],
                "evidence_state": "amount_disclosed", "accounting_frame": "audited_financial_statement",
                "denominator_id": denominator, "reporting_scope": profile.get("reporting_scope", ""),
                "denominator_label": f"{profile['reporting_entity']} reported {statement_class}",
                "denominator_amount_cad": total,
                "description": "Organization-wide audited accounts; these uses are not assigned back to individual funding streams.",
            })
            edges.append(_edge(
                source=node_id, target=boundary_id, relationship="reports_revenue_or_expense",
                topology="accounting_boundary", mechanism=None, amount=total, denominator_id=denominator,
                fiscal_year=fiscal_year, accounting_frame="audited_financial_statement",
                organizational_scope=profile.get("reporting_scope", "audited reporting entity"),
                funding_scope=f"organization-wide reported {statement_class}",
                evidence_source=profile["source"].get("snapshot_id", "audited financial statement"),
                amount_stage=f"reported_{statement_class}_total", aggregation_eligible=False,
                source_roles=_organization_roles(profile["reporting_entity"], "reporting_entity"),
            ))
            for component_index, component in enumerate(components):
                component_id = stable_id(
                    "node", fiscal_year, entity_id, statement_class,
                    component["source_label"], component["amount_cad"], component_index,
                )
                nodes.append({
                    "node_id": component_id, "node_type": "reported_financial_use" if statement_class == "expense" else "reported_revenue_source",
                    "label": component["source_label"], "amount_cad": component["amount_cad"], "period": fiscal_year,
                    "roles": [], "topologies": ["composition"], "evidence_state": "amount_disclosed",
                    "accounting_frame": "audited_financial_statement", "denominator_id": denominator,
                    "denominator_label": f"{profile['reporting_entity']} reported {statement_class}",
                    "denominator_amount_cad": total,
                })
                edges.append(_edge(
                    source=boundary_id, target=component_id, relationship="reports_revenue_or_expense",
                    topology="composition", mechanism=None, amount=component["amount_cad"],
                    denominator_id=denominator, fiscal_year=fiscal_year,
                    accounting_frame="audited_financial_statement",
                    organizational_scope=profile.get("reporting_scope", "audited reporting entity"),
                    funding_scope=f"source-native {statement_class} composition",
                    evidence_source=profile["source"].get("snapshot_id", "audited financial statement"),
                    amount_stage=f"reported_{statement_class}_component", aggregation_eligible=True,
                ))

    # Ontario Health atHome uses a separate governed observation table rather than the hospital extractor.
    athome_rows = [
        row for row in athome_observations
        if row.get("fiscal_year") == fiscal_year and row.get("amount_role") == "actual_expense"
    ]
    athome_link = next((row for row in reviewed_link_rows if row["authoritative_name"].casefold() == "ontario health athome"), None)
    oh_link = next((row for row in reviewed_link_rows if row["authoritative_name"].casefold() == "ontario health"), None)
    if athome_link and oh_link:
        oh_id = entity_node_ids[oh_link["entity_id"]]
        athome_id = entity_node_ids[athome_link["entity_id"]]
        edges.append(_edge(
            source=oh_id, target=athome_id, relationship="holds_accountable", topology="chain",
            mechanism="service_accountability_funding", amount=None, denominator_id=None,
            fiscal_year=fiscal_year, evidence_state="relationship_disclosed_amount_not_disclosed",
            amount_owner="Ontario Health–Ontario Health atHome agreement", accounting_frame="institutional_relationship",
            organizational_scope="provincial home and community care administration",
            funding_scope="accountability and funding relationship; compatible 2025-26 transfer amount not joined",
            evidence_source="Ontario Health–Ontario Health atHome Service Accountability Agreement",
            amount_stage="institutional_relationship", aggregation_eligible=False,
            source_roles=["funder", "accountability_manager"], target_roles=["program_operator", "purchaser"],
        ))
        totals = [row for row in athome_rows if row.get("service_class") == "total"]
        components = [row for row in athome_rows if row.get("parent_observation_id") and row.get("service_class") != "total"]
        if len(totals) == 1 and components:
            total = totals[0]
            boundary_id = stable_id("node", fiscal_year, athome_link["entity_id"], "expense", "boundary")
            denominator = f"{athome_link['entity_id']}_expense_{fiscal_year.replace('-', '_')}"
            nodes.append({
                "node_id": boundary_id, "node_type": "audited_reporting_boundary", "label": "Reported expenses",
                "amount_cad": money(total["amount_cad"]), "period": fiscal_year, "roles": [],
                "topologies": ["accounting_boundary", "composition"], "evidence_state": "amount_disclosed",
                "accounting_frame": "audited_financial_statement", "denominator_id": denominator,
                "denominator_label": "Ontario Health atHome reported expenses", "denominator_amount_cad": money(total["amount_cad"]),
                "description": "Ontario Health atHome audited expense composition; provider contract recipients are not disclosed here.",
            })
            edges.append(_edge(
                source=athome_id, target=boundary_id, relationship="reports_revenue_or_expense",
                topology="accounting_boundary", mechanism=None, amount=total["amount_cad"],
                denominator_id=denominator, fiscal_year=fiscal_year,
                accounting_frame="audited_financial_statement", organizational_scope="Ontario Health atHome",
                funding_scope="organization-wide reported expense", evidence_source=total["source_id"],
                amount_stage="reported_expense_total", aggregation_eligible=False,
                source_roles=["program_operator", "purchaser"],
            ))
            for component in components:
                component_id = stable_id("node", fiscal_year, "athome", component["observation_id"])
                label = public_label(component.get("program_earmark") or component.get("service_class") or "reported use")
                nodes.append({
                    "node_id": component_id, "node_type": "reported_financial_use", "label": label,
                    "amount_cad": money(component["amount_cad"]), "period": fiscal_year, "roles": [],
                    "topologies": ["composition"], "evidence_state": "amount_disclosed",
                    "accounting_frame": "audited_financial_statement", "denominator_id": denominator,
                    "denominator_label": "Ontario Health atHome reported expenses", "denominator_amount_cad": money(total["amount_cad"]),
                })
                edges.append(_edge(
                    source=boundary_id, target=component_id, relationship="reports_revenue_or_expense",
                    topology="composition", mechanism=None,
                    amount=component["amount_cad"], denominator_id=denominator, fiscal_year=fiscal_year,
                    accounting_frame="audited_financial_statement", organizational_scope="Ontario Health atHome",
                    funding_scope="source-native expense composition", evidence_source=component["source_id"],
                    amount_stage="reported_expense_component", aggregation_eligible=True,
                ))

    contract["nodes"] = sorted(nodes, key=lambda row: row["node_id"])
    contract["edges"] = sorted(edges, key=lambda row: row["edge_id"])
    return contract


def money(value: Decimal | str | int) -> str:
    return f"{Decimal(value):.2f}"


def percent(value: Decimal) -> str:
    return f"{value:.4f}"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _route_lookup(routes: Iterable[dict[str, str]]) -> dict[str, dict[str, str]]:
    return {row["route_id"]: row for row in routes}


def flow_bucket_id(
    row: dict[str, str], route_lookup: dict[str, dict[str, str]]
) -> str:
    """Assign each payment line to exactly one public-facing flow bucket."""
    route = route_lookup.get(row.get("route_id", ""), {})
    if route.get("operating_targeted_or_capital") == "capital":
        return "capital"
    return FLOW_SERVICE_BUCKETS.get(
        row.get("service_category", ""), "system_operations_and_other"
    )


def build_flow_overview(
    fiscal_year: str,
    payments: Iterable[dict[str, str]],
    routes: Iterable[dict[str, str]],
) -> dict[str, object]:
    """Build the small first-load contract for the 14-bucket payment flow."""
    payments = list(payments)
    route_lookup = _route_lookup(routes)
    bucket_amounts = {bucket_id: Decimal("0") for bucket_id, _ in FLOW_BUCKETS}
    ministry_amounts: dict[str, Decimal] = defaultdict(Decimal)
    positive_total = Decimal("0")
    adjustment_total = Decimal("0")
    for row in payments:
        amount = Decimal(row["amount_cad"])
        bucket_amounts[flow_bucket_id(row, route_lookup)] += amount
        ministry_amounts[row["ministry"]] += amount
        if amount >= 0:
            positive_total += amount
        else:
            adjustment_total += amount
    net_total = sum(bucket_amounts.values())
    buckets = []
    for bucket_id, label in FLOW_BUCKETS:
        amount = bucket_amounts[bucket_id]
        buckets.append(
            {
                "bucket_id": bucket_id,
                "label": label,
                "amount_cad": money(amount),
                "share_percent": percent(
                    amount / net_total * Decimal("100") if net_total else Decimal("0")
                ),
                "path": f"buckets/{bucket_id}.json",
            }
        )
    buckets.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["label"]))
    return {
        "schema_version": "1.0.0",
        "fiscal_year": fiscal_year,
        "amount_frame": "net_published_payments",
        "net_published_payments_cad": money(net_total),
        "positive_published_payments_cad": money(positive_total),
        "signed_adjustments_cad": money(adjustment_total),
        "ministries": [
            {"ministry": ministry, "amount_cad": money(amount)}
            for ministry, amount in sorted(
                ministry_amounts.items(), key=lambda item: (-item[1], item[0])
            )
        ],
        "buckets": buckets,
        "line_grammar": {
            "solid": "Exact compatible published amount; width is proportional within this view.",
            "dotted": "Supported route or role; no compatible published amount.",
            "junction": "This organization receives through more than one published route.",
        },
        "note": (
            "The opening total is the net of published payment lines, including signed "
            "adjustments. Each line is assigned to one bucket only."
        ),
    }


def _profile_lookup(profiles: dict[str, object]) -> dict[str, dict[str, object]]:
    output: dict[str, dict[str, object]] = {}
    for profile in profiles.get("profiles", []):
        for label_id in profile.get("payment_label_ids", []):
            output[label_id] = profile
    return output


def _entity_link_lookup(
    reviewed_links: Iterable[dict[str, str]],
) -> dict[str, dict[str, str]]:
    output = {}
    for row in reviewed_links:
        status = row.get("review_status", "")
        if status.startswith("reviewed") or row.get("outcome") == "reviewed_resolved":
            output[row["payment_label_id"]] = row
    return output


def _intermediary_from_route(route: dict[str, str]) -> str | None:
    administrator = route.get("administrator", "").strip()
    if not administrator or administrator.casefold() in {
        "ministry of health", "ministry of long-term care", "ministry"
    }:
        return None
    if "depending on the program" in administrator.casefold() or " or ministry" in administrator.casefold():
        return None
    return administrator


def _home_care_special_route(
    fiscal_year: str,
    bucket_rows: list[dict[str, str]],
    athome_observations: Iterable[dict[str, str]],
) -> dict[str, object]:
    ministry_to_oh = sum(
        Decimal(row["amount_cad"])
        for row in bucket_rows
        if row["recipient_label_raw"].strip().casefold() == "ontario health"
        and Decimal(row["amount_cad"]) > 0
    )
    athome_components = [
        row
        for row in athome_observations
        if row.get("fiscal_year") == fiscal_year
        and row.get("amount_role") == "funding_received_or_recovered"
        and row.get("counterparty", "").strip().casefold() == "ontario health"
        and row.get("parent_observation_id")
    ]
    intermediary_to_athome = sum(
        (Decimal(row["amount_cad"]) for row in athome_components), Decimal("0")
    )
    return {
        "route_type": "ontario_health_athome",
        "label": "Ontario Health atHome",
        "nodes": ["Ministry of Health", "Ontario Health", "Ontario Health atHome", "Contracted providers"],
        "ministry_to_intermediary_cad": money(ministry_to_oh),
        "intermediary_to_athome_cad": money(intermediary_to_athome),
        "downstream_amount_cad": None,
        "downstream_amount_status": "no_published_amount",
        "segments_reconciled": abs(ministry_to_oh - intermediary_to_athome) <= Decimal("0.01"),
        "explanation": (
            "The two published amounts come from different records and are shown as separate "
            "segments. Provider-level contract amounts are not published in the current evidence."
        ),
    }


def _special_routes_for_bucket(
    *,
    fiscal_year: str,
    bucket_id: str,
    bucket_rows: list[dict[str, str]],
    athome_observations: Iterable[dict[str, str]],
    municipal_observations: Iterable[dict[str, str]],
) -> list[dict[str, object]]:
    routes: list[dict[str, object]] = []
    if bucket_id in {"hospitals", "cancer_care", "renal_care", "mental_health_and_addictions"}:
        routes.append({
            "route_type": "ontario_health_provider_role",
            "label": "Ontario Health's provider role",
            "nodes": ["Ministry of Health", "Ontario Health", FLOW_BUCKET_LABELS[bucket_id]],
            "amount_status": "relationship_disclosed_amount_not_disclosed",
            "explanation": "Ontario Health funds and manages accountability for supported provider programs. This dotted route does not assign every Public Accounts payee line to Ontario Health or invent a downstream amount.",
        })
    if bucket_id == "home_and_community_care":
        routes.append(_home_care_special_route(fiscal_year, bucket_rows, athome_observations))
    if bucket_id == "long_term_care":
        routes.append({
            "route_type": "ltc_ontario_health_role",
            "label": "Long-term care funding route",
            "nodes": ["Ministry of Long-Term Care", "Ontario Health", "Licensed home or licensee"],
            "amount_status": "relationship_disclosed_amount_not_disclosed",
            "explanation": "Ontario Health's funding and accountability role is supported; a compatible intermediary amount is not attached to each published payee line.",
        })
    if bucket_id == "physicians_and_primary_care":
        routes.append({
            "route_type": "claims_channel",
            "label": "OHIP claims channel",
            "nodes": ["Ministry of Health", "OHIP program", "Billing organization or practitioner"],
            "amount_status": "relationship_disclosed_amount_not_disclosed",
            "explanation": "OHIP is a ministry program, not Ontario Health. Published payments are gross payment records, not take-home income.",
        })
    if bucket_id == "drugs_and_devices":
        routes.append({
            "route_type": "drug_device_reimbursement",
            "label": "Drug and device reimbursement",
            "nodes": ["Ministry of Health", "Benefit program", "Pharmacy, vendor or claimant"],
            "amount_status": "relationship_disclosed_amount_not_disclosed",
            "explanation": "A payment to a pharmacy or vendor is not the same thing as the ultimate drug benefit received by a patient.",
        })
    if bucket_id in {"public_health", "ambulance_and_emergency"}:
        compatible = [
            row for row in municipal_observations
            if row.get("calendar_year") == "2024"
            and row.get("function") in {"public_health_services", "ambulance_services", "ambulance_dispatch"}
        ]
        routes.append({
            "route_type": "municipal_cofunding",
            "label": "Provincial and municipal co-funding",
            "nodes": ["Province", "Municipality or board", "Public health or ambulance service"],
            "amount_status": "period_or_scope_incompatible" if compatible else "source_unavailable",
            "explanation": "Municipal evidence is calendar-year 2024 and is therefore contextual, not added to the 2025–26 provincial flow.",
        })
    if bucket_id == "blood_services":
        routes.append({
            "route_type": "national_service_body",
            "label": "National service body",
            "nodes": ["Ontario contribution", "Canadian Blood Services", "National blood system"],
            "amount_status": "relationship_disclosed_amount_not_disclosed",
            "explanation": "Ontario's contribution ends in a national-service context rather than an Ontario provider hierarchy.",
        })
    if bucket_id == "capital":
        routes.append({
            "route_type": "capital_stages",
            "label": "Capital stages",
            "nodes": ["Authorization", "Cash contribution", "Asset addition", "Deferred contribution", "Recognized revenue and amortization"],
            "amount_status": "relationship_disclosed_amount_not_disclosed",
            "explanation": "These are related accounting stages, not amounts that can be added together.",
        })
    return routes


def build_bucket_payload(
    *,
    fiscal_year: str,
    bucket_id: str,
    payments: Iterable[dict[str, str]],
    routes: Iterable[dict[str, str]],
    reviewed_links: Iterable[dict[str, str]],
    profiles: dict[str, object],
    athome_observations: Iterable[dict[str, str]],
    municipal_observations: Iterable[dict[str, str]],
) -> dict[str, object]:
    """Build one progressively loaded bucket with programs and public recipients."""
    payments = list(payments)
    route_lookup = _route_lookup(routes)
    bucket_rows = [
        row for row in payments if flow_bucket_id(row, route_lookup) == bucket_id
    ]
    links = _entity_link_lookup(reviewed_links)
    profile_by_label = _profile_lookup(profiles)
    incoming_buckets: dict[str, set[str]] = defaultdict(set)
    for row in payments:
        if Decimal(row["amount_cad"]) > 0 and row["recipient_class"] not in {"person_or_employee", "program_aggregate"}:
            incoming_buckets[row["payment_label_id"]].add(flow_bucket_id(row, route_lookup))

    program_groups: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in bucket_rows:
        detail = row.get("payment_detail", "")
        if not detail or detail == "No Value":
            detail = row.get("payment_category", "Source does not specify")
        program_groups[(row["ministry"], detail, row.get("payment_category", ""))].append(row)

    programs = []
    for (ministry, detail, payment_category), rows in program_groups.items():
        recipient_groups: dict[str, list[dict[str, str]]] = defaultdict(list)
        aggregate_destination = Decimal("0")
        withheld_person = Decimal("0")
        adjustment = Decimal("0")
        for row in rows:
            amount = Decimal(row["amount_cad"])
            if amount < 0:
                adjustment += amount
            elif row["recipient_class"] == "person_or_employee":
                withheld_person += amount
            elif row["recipient_class"] == "program_aggregate":
                aggregate_destination += amount
            else:
                recipient_groups[row["payment_label_id"]].append(row)
        recipients = []
        for label_id, recipient_rows in recipient_groups.items():
            amount = sum(Decimal(row["amount_cad"]) for row in recipient_rows)
            link = links.get(label_id)
            route = route_lookup.get(recipient_rows[0].get("route_id", ""), {})
            recipients.append({
                "payment_label_id": label_id,
                "recipient_label": recipient_rows[0]["recipient_label_raw"],
                "recipient_class": recipient_rows[0]["recipient_class"],
                "amount_cad": money(amount),
                "entity_id": link.get("entity_id") if link else None,
                "identity_status": "reviewed_resolved" if link else "published_label_only",
                "has_financial_profile": label_id in profile_by_label,
                "incoming_bucket_count": len(incoming_buckets[label_id]),
                "is_funding_junction": len(incoming_buckets[label_id]) > 1,
                "intermediary": _intermediary_from_route(route),
                "detail_path": f"recipients/{label_id}.json",
            })
        recipients.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["recipient_label"]))
        program_amount = sum(Decimal(row["amount_cad"]) for row in rows)
        positive_destination = sum(
            (Decimal(row["amount_cad"]) for row in rows if Decimal(row["amount_cad"]) >= 0),
            Decimal("0"),
        )
        programs.append({
            "program_id": stable_id("program", bucket_id, ministry, detail, payment_category),
            "ministry": ministry,
            "label": detail,
            "payment_category": payment_category,
            "amount_cad": money(program_amount),
            "positive_destination_cad": money(positive_destination),
            "recipients": recipients,
            "recipient_count": len(recipients),
            "aggregate_destination_cad": money(aggregate_destination),
            "withheld_person_cad": money(withheld_person),
            "signed_adjustment_cad": money(adjustment),
        })
    programs.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["label"]))
    amount = sum(Decimal(row["amount_cad"]) for row in bucket_rows)
    return {
        "schema_version": "1.0.0",
        "fiscal_year": fiscal_year,
        "bucket_id": bucket_id,
        "label": FLOW_BUCKET_LABELS[bucket_id],
        "amount_cad": money(amount),
        "programs": programs,
        "program_count": len(programs),
        "published_recipient_count": len({
            row["payment_label_id"] for row in bucket_rows
            if Decimal(row["amount_cad"]) >= 0
            and row["recipient_class"] not in {"person_or_employee", "program_aggregate"}
        }),
        "special_routes": _special_routes_for_bucket(
            fiscal_year=fiscal_year,
            bucket_id=bucket_id,
            bucket_rows=bucket_rows,
            athome_observations=athome_observations,
            municipal_observations=municipal_observations,
        ),
        "evidence_stop_label": "No published amount",
    }


def build_recipient_institutional_context(
    *, recipient_label: str, incoming_routes: Iterable[dict[str, object]]
) -> list[dict[str, object]]:
    """Return parallel, non-amount institutional context for a recipient focus."""
    if recipient_label.strip().casefold() == "ontario health":
        return []
    contexts: dict[tuple[str, str], dict[str, object]] = {}
    for route in incoming_routes:
        bucket_id = str(route["bucket_id"])
        if bucket_id in {
            "hospitals", "cancer_care", "renal_care", "mental_health_and_addictions",
        }:
            route_type = "ontario_health_provider_role"
            contexts[(bucket_id, route_type)] = {
                "context_id": stable_id("context", recipient_label, bucket_id, route_type),
                "bucket_id": bucket_id,
                "route_type": route_type,
                "source_label": "Ontario Health",
                "target_label": recipient_label,
                "relationship_label": "Funding and accountability role",
                "amount_status": "relationship_disclosed_amount_not_disclosed",
                "amount_cad": None,
                "path_placement": "parallel",
            }
        if bucket_id == "long_term_care":
            route_type = "ltc_ontario_health_role"
            contexts[(bucket_id, route_type)] = {
                "context_id": stable_id("context", recipient_label, bucket_id, route_type),
                "bucket_id": bucket_id,
                "route_type": route_type,
                "source_label": "Ontario Health",
                "target_label": recipient_label,
                "relationship_label": "Funding and accountability role",
                "amount_status": "relationship_disclosed_amount_not_disclosed",
                "amount_cad": None,
                "path_placement": "parallel",
            }
        if bucket_id in {"public_health", "ambulance_and_emergency"}:
            route_type = "municipal_cofunding"
            contexts[(bucket_id, route_type)] = {
                "context_id": stable_id("context", recipient_label, bucket_id, route_type),
                "bucket_id": bucket_id,
                "route_type": route_type,
                "source_label": "Municipal co-funding",
                "target_label": recipient_label,
                "relationship_label": "Separate calendar-year contribution context",
                "amount_status": "period_or_scope_incompatible",
                "amount_cad": None,
                "path_placement": "parallel",
            }
    return sorted(contexts.values(), key=lambda row: (str(row["bucket_id"]), str(row["route_type"])))


def build_recipient_payloads(
    *,
    fiscal_year: str,
    payments: Iterable[dict[str, str]],
    routes: Iterable[dict[str, str]],
    reviewed_links: Iterable[dict[str, str]],
    profiles: dict[str, object],
) -> tuple[list[dict[str, object]], dict[str, dict[str, object]]]:
    """Build compact search rows and one detail contract per published payee label."""
    route_lookup = _route_lookup(routes)
    links = _entity_link_lookup(reviewed_links)
    profile_by_label = _profile_lookup(profiles)
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in payments:
        if Decimal(row["amount_cad"]) >= 0 and row["recipient_class"] not in {"person_or_employee", "program_aggregate"}:
            grouped[row["payment_label_id"]].append(row)
    index = []
    payloads = {}
    for label_id, rows in grouped.items():
        by_route: dict[tuple[str, str, str, str], Decimal] = defaultdict(Decimal)
        for row in rows:
            bucket = flow_bucket_id(row, route_lookup)
            detail = row["payment_detail"] if row["payment_detail"] != "No Value" else row["payment_category"]
            by_route[(row.get("route_id", ""), row["ministry"], bucket, detail)] += Decimal(row["amount_cad"])
        incoming = [
            {
                "route_id": route_id,
                "ministry": ministry,
                "source_label": ministry,
                "bucket_id": bucket,
                "bucket_label": FLOW_BUCKET_LABELS[bucket],
                "program_label": detail,
                "amount_cad": money(amount),
                "amount_status": "amount_disclosed",
                "relationship_type": "records_payment_to",
                "target_label": rows[0]["recipient_label_raw"],
            }
            for (route_id, ministry, bucket, detail), amount in by_route.items()
        ]
        incoming.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["bucket_label"], row["program_label"]))
        total = sum(Decimal(row["amount_cad"]) for row in incoming)
        profile = profile_by_label.get(label_id)
        reported_oh = []
        if profile:
            for component in profile.get("revenue_components", []):
                source_label = component.get("source_label", "")
                if "ontario health" in source_label.casefold():
                    combined = "ministry" in source_label.casefold()
                    reported_oh.append({
                        **component,
                        "source_scope": "combined_ministry_and_ontario_health" if combined else "ontario_health",
                    })
        link = links.get(label_id)
        institutional_context = build_recipient_institutional_context(
            recipient_label=rows[0]["recipient_label_raw"],
            incoming_routes=incoming,
        )
        payload = {
            "schema_version": "1.0.0",
            "fiscal_year": fiscal_year,
            "payment_label_id": label_id,
            "recipient_label": rows[0]["recipient_label_raw"],
            "recipient_class": rows[0]["recipient_class"],
            "entity_id": link.get("entity_id") if link else None,
            "identity_status": "reviewed_resolved" if link else "published_label_only",
            "published_payment_total_cad": money(total),
            "incoming_routes": incoming,
            "institutional_context": institutional_context,
            "is_funding_junction": len({row["bucket_id"] for row in incoming}) > 1,
            "financial_profile": profile,
            "reported_ontario_health_funding": reported_oh,
            "financial_profile_status": "available" if profile else "no_published_amount",
            "limitation": (
                "Published payments show recorded routes to this payee label. Audited revenue and "
                "expenses describe the whole reporting entity and are not allocated back to individual funding routes."
            ),
        }
        payloads[label_id] = payload
        index.append({
            "payment_label_id": label_id,
            "recipient_label": rows[0]["recipient_label_raw"],
            "recipient_class": rows[0]["recipient_class"],
            "published_payment_total_cad": money(total),
            "bucket_ids": sorted({row["bucket_id"] for row in incoming}),
            "has_financial_profile": profile is not None,
            "is_funding_junction": payload["is_funding_junction"],
            "detail_path": f"recipients/{label_id}.json",
        })
    index.sort(key=lambda row: (-Decimal(row["published_payment_total_cad"]), row["recipient_label"]))
    return index, payloads


def build_overview(
    *,
    fiscal_year: str,
    expense_total: Decimal,
    disclosed_payment_total: Decimal,
    categories: Iterable[dict[str, str]],
    expense_adjustments: Iterable[dict[str, str]] = (),
) -> dict[str, object]:
    normalized = []
    for row in categories:
        amount = Decimal(row["amount_cad"])
        normalized.append(
            {
                "category_id": row["presentation_category"],
                "amount_cad": money(amount),
                "share_percent": percent(amount / expense_total * Decimal("100")),
                "per_100_dollars": percent(amount / expense_total * Decimal("100")),
            }
        )
    normalized.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["category_id"]))
    category_total = sum(Decimal(row["amount_cad"]) for row in normalized)
    adjustment_rows = [
        {
            "amount_cad": money(row["amount_cad"]),
            "source_record_id": row.get("source_record_id", ""),
            "aggregation_role": row.get("aggregation_role", "offset"),
        }
        for row in expense_adjustments
    ]
    adjustment_total = sum(Decimal(row["amount_cad"]) for row in adjustment_rows)
    if abs(category_total + adjustment_total - expense_total) > Decimal("0.01"):
        raise ValueError(
            f"Expense categories and adjustments total {category_total + adjustment_total} "
            f"does not reconcile to {expense_total}"
        )
    top_five = sum(Decimal(row["amount_cad"]) for row in normalized[:5])
    return {
        "fiscal_year": fiscal_year,
        "ministry_expense_total_cad": money(expense_total),
        "disclosed_payment_total_cad": money(disclosed_payment_total),
        "expense_categories": normalized,
        "positive_expense_category_total_cad": money(category_total),
        "expense_adjustments": adjustment_rows,
        "expense_adjustment_total_cad": money(adjustment_total),
        "top_five_share_percent": percent(top_five / expense_total * Decimal("100")),
        "rounding_note": "Displayed shares are rounded; exact amounts reconcile to the ministry expense total.",
        "accounting_warning": (
            "Ministry actual expenses and disclosed payments are separate accounting frames. "
            "They must not be added, subtracted or rendered as one conserved flow."
        ),
    }


def build_recipient_rankings(rows: Iterable[dict[str, str]]) -> dict[str, object]:
    labels: dict[str, dict[str, object]] = {}
    facts: dict[tuple[str, ...], dict[str, object]] = {}
    included_count = 0
    excluded_people = 0
    excluded_negative = 0
    for row in rows:
        amount = Decimal(row["amount_cad"])
        if amount < 0:
            excluded_negative += 1
            continue
        if row["recipient_class"] == "person_or_employee":
            excluded_people += 1
            continue
        included_count += 1
        label_id = row["payment_label_id"]
        label = labels.setdefault(
            label_id,
            {
                "payment_label_id": label_id,
                "recipient_label": row["recipient_label_raw"],
                "recipient_class": row["recipient_class"],
                "amount_cad": Decimal("0"),
                "payment_line_count": 0,
                "ministries": set(),
                "service_categories": set(),
                "payment_details": set(),
            },
        )
        label["amount_cad"] += amount
        label["payment_line_count"] += 1
        label["ministries"].add(row["ministry"])
        label["service_categories"].add(row["service_category"])
        label["payment_details"].add(row["payment_detail"])

        key = (
            label_id,
            row["ministry"],
            row["service_category"],
            row["payment_category"],
            row["payment_detail"],
            row["recipient_class"],
        )
        fact = facts.setdefault(
            key,
            {
                "payment_label_id": label_id,
                "recipient_label": row["recipient_label_raw"],
                "recipient_class": row["recipient_class"],
                "ministry": row["ministry"],
                "service_category": row["service_category"],
                "payment_category": row["payment_category"],
                "payment_detail": row["payment_detail"],
                "amount_cad": Decimal("0"),
                "payment_line_count": 0,
            },
        )
        fact["amount_cad"] += amount
        fact["payment_line_count"] += 1

    label_rows = []
    for label in labels.values():
        label_rows.append(
            {
                **label,
                "amount_cad": money(label["amount_cad"]),
                "ministries": sorted(label["ministries"]),
                "service_categories": sorted(label["service_categories"]),
                "payment_details": sorted(label["payment_details"]),
            }
        )
    label_rows.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["payment_label_id"]))

    fact_rows = []
    for fact in facts.values():
        fact_rows.append({**fact, "amount_cad": money(fact["amount_cad"])})
    fact_rows.sort(
        key=lambda row: (
            row["payment_label_id"],
            row["service_category"],
            row["payment_detail"],
        )
    )
    return {
        "ranking_unit": "published_recipient_label",
        "amount_basis": "sum_of_non_negative_disclosed_payment_lines",
        "labels": label_rows,
        "facts": fact_rows,
        "included_payment_line_count": included_count,
        "excluded_person_line_count": excluded_people,
        "excluded_negative_line_count": excluded_negative,
        "included_amount_cad": money(sum(Decimal(row["amount_cad"]) for row in label_rows)),
    }


def _component_summary(rows: list[dict[str, str]], statement_class: str):
    class_rows = [row for row in rows if row["financial_statement_class"] == statement_class]
    components = [
        row
        for row in class_rows
        if row["row_role"] == "component"
        and row.get("aggregation_eligible", "") in {"yes", "yes_if_total_excluded", "true"}
    ]
    totals = [row for row in class_rows if row["row_role"] == "total"]
    component_values = [Decimal(row["normalized_amount_cad"]) for row in components]
    if any(value < 0 for value in component_values):
        return None, [], None
    total = Decimal(totals[0]["normalized_amount_cad"]) if len(totals) == 1 else sum(component_values)
    if total <= 0 or not components:
        return None, [], None
    component_output = [
        {
            "source_label": row["source_label"],
            "amount_cad": money(row["normalized_amount_cad"]),
        }
        for row in components
    ]
    component_output.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["source_label"]))
    largest_amount = Decimal(component_output[0]["amount_cad"])
    tied = sum(Decimal(row["amount_cad"]) == largest_amount for row in component_output) > 1
    insight = None
    if not tied:
        insight = {
            "source_label": component_output[0]["source_label"],
            "amount_cad": component_output[0]["amount_cad"],
            "share_percent": percent(largest_amount / total * Decimal("100")),
            "denominator_cad": money(total),
            "limitation": "Source-native composition; not a cross-recipient performance measure.",
        }
    return total, component_output, insight


def build_profiles(
    *,
    fiscal_year: str,
    observations: Iterable[dict[str, str]],
    reviewed_links: Iterable[dict[str, str]],
    payments: Iterable[dict[str, str]],
    source_snapshots: Iterable[dict[str, str]] = (),
) -> dict[str, object]:
    snapshots_by_id = {
        row.get("snapshot_id", ""): row
        for row in source_snapshots
        if row.get("snapshot_id")
    }
    links_by_entity: dict[str, set[str]] = defaultdict(set)
    links_by_name: dict[str, set[str]] = defaultdict(set)
    for link in reviewed_links:
        if link.get("review_status", "").startswith("reviewed") or link.get("outcome") == "reviewed_resolved":
            links_by_entity[link["entity_id"]].add(link["payment_label_id"])
            authoritative_name = link.get("authoritative_name", "").strip().casefold()
            if authoritative_name:
                links_by_name[authoritative_name].add(link["payment_label_id"])

    payments_by_label: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in payments:
        if Decimal(row["amount_cad"]) >= 0 and row["recipient_class"] != "person_or_employee":
            payments_by_label[row["payment_label_id"]].append(row)

    by_entity: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in observations:
        if row["period_label"] != fiscal_year:
            continue
        if row.get("publication_status", "") not in APPROVED_PUBLICATION_STATUSES:
            continue
        by_entity[row["entity_id"]].append(row)

    profiles = []
    for entity_id, rows in by_entity.items():
        payment_label_ids = sorted(
            links_by_entity.get(entity_id, set())
            or links_by_name.get(rows[0]["reporting_entity"].strip().casefold(), set())
        )
        revenue_total, revenue_components, revenue_insight = _component_summary(rows, "revenue")
        expense_total, expense_components, expense_insight = _component_summary(rows, "expense")
        annual_results = [
            row for row in rows if row["financial_statement_class"] == "annual_result"
        ]
        payment_rows = [
            payment
            for label_id in payment_label_ids
            for payment in payments_by_label.get(label_id, [])
        ]
        source_snapshot = snapshots_by_id.get(rows[0].get("snapshot_id", ""), {})
        source_url = source_snapshot.get("final_url") or source_snapshot.get("original_url") or ""
        profile = {
            "entity_id": entity_id,
            "reporting_entity": rows[0]["reporting_entity"],
            "reporting_scope": rows[0].get("reporting_scope", ""),
            "fiscal_year": fiscal_year,
            "payment_link_status": "reviewed_resolved" if payment_label_ids else "not_verified",
            "payment_label_ids": payment_label_ids,
            "linked_disclosed_payment_cad": money(
                sum(Decimal(row["amount_cad"]) for row in payment_rows)
            ),
            "revenue_total_cad": money(revenue_total) if revenue_total is not None else None,
            "expense_total_cad": money(expense_total) if expense_total is not None else None,
            "revenue_components": revenue_components,
            "expense_components": expense_components,
            "revenue_insight": revenue_insight,
            "expense_insight": expense_insight,
            "annual_result": (
                {
                    "source_label": annual_results[0]["source_label"],
                    "amount_cad": money(annual_results[0]["normalized_amount_cad"]),
                }
                if len(annual_results) == 1
                else None
            ),
            "source": {
                "snapshot_id": rows[0].get("snapshot_id", ""),
                "source_sha256": rows[0].get("source_sha256", ""),
                "url": source_url,
                "period": fiscal_year,
                "publication_eligibility": source_snapshot.get("publication_eligibility", ""),
            },
        }
        profiles.append(profile)
    profiles.sort(key=lambda row: row["reporting_entity"].casefold())
    return {
        "profiles": profiles,
        "linked_profile_count": sum(
            row["payment_link_status"] == "reviewed_resolved" for row in profiles
        ),
        "standalone_profile_count": sum(
            row["payment_link_status"] == "not_verified" for row in profiles
        ),
    }


def write_system_map_artifacts(release_dir: Path, contract: dict[str, object]) -> dict[str, object]:
    validation = validate_system_map_contract(contract)
    nodes = {row["node_id"]: row for row in contract["nodes"]}
    incoming: dict[str, list[dict[str, object]]] = defaultdict(list)
    outgoing: dict[str, list[dict[str, object]]] = defaultdict(list)
    for edge in contract["edges"]:
        outgoing[edge["source_node_id"]].append(edge)
        incoming[edge["target_node_id"]].append(edge)
    neighbourhood_paths: dict[str, str] = {}
    for node_id, node in nodes.items():
        path = f"neighbourhoods/{node_id}.json"
        neighbourhood_paths[node_id] = path
        edge_rows = sorted(incoming[node_id] + outgoing[node_id], key=lambda row: row["edge_id"])
        related_ids = sorted({
            endpoint
            for edge in edge_rows
            for endpoint in (edge["source_node_id"], edge["target_node_id"])
            if endpoint != node_id
        })
        write_json(
            release_dir / path,
            {
                "schema_version": contract["schema_version"],
                "release_id": contract["release_id"],
                "focal_node": node,
                "nodes": [node] + [nodes[related_id] for related_id in related_ids],
                "edges": edge_rows,
                "structured_view": {
                    "incoming": [edge for edge in edge_rows if edge["target_node_id"] == node_id],
                    "outgoing": [edge for edge in edge_rows if edge["source_node_id"] == node_id],
                    "related_entities": [],
                    "limitations": contract["limitations"],
                },
            },
        )
    graph_index = {
        "schema_version": contract["schema_version"],
        "release_id": contract["release_id"],
        "fiscal_year": contract["fiscal_year"],
        "root_node_id": contract["root_node_id"],
        "nodes": [
            {
                key: node.get(key)
                for key in ("node_id", "node_type", "label", "amount_cad", "evidence_state")
            }
            for node in contract["nodes"]
        ],
        "neighbourhoods": neighbourhood_paths,
    }
    write_json(release_dir / "system-map-contract.json", contract)
    write_json(release_dir / "graph-index.json", graph_index)
    write_json(release_dir / "validation-report.json", validation)
    source_counts: dict[str, int] = defaultdict(int)
    for edge in contract["edges"]:
        source_counts[edge["evidence_source"]] += 1
    write_json(
        release_dir / "source-index.json",
        {
            "release_id": contract["release_id"],
            "source_count": len(source_counts),
            "sources": [
                {"source": source, "published_edge_count": count}
                for source, count in sorted(source_counts.items())
            ],
        },
    )
    write_json(
        release_dir / "release-difference.json",
        {
            "release_id": contract["release_id"],
            "comparison_status": "no_distinct_prior_release_in_build",
            "added_nodes": len(contract["nodes"]),
            "added_edges": len(contract["edges"]),
            "removed_nodes": 0,
            "removed_edges": 0,
            "revised_amounts": 0,
        },
    )
    write_json(
        release_dir / "rollback.json",
        {"release_id": contract["release_id"], "previous_release_id": None, "rollback_available": False},
    )
    return graph_index


def validate_system_map_contract(contract: dict[str, object]) -> dict[str, object]:
    errors: list[str] = []
    nodes = contract["nodes"]
    edges = contract["edges"]
    node_ids = [row["node_id"] for row in nodes]
    edge_ids = [row["edge_id"] for row in edges]
    node_id_set = set(node_ids)
    if len(node_ids) != len(node_id_set):
        errors.append("Node IDs are not unique.")
    if len(edge_ids) != len(set(edge_ids)):
        errors.append("Edge IDs are not unique.")
    if any(edge["source_node_id"] not in node_id_set or edge["target_node_id"] not in node_id_set for edge in edges):
        errors.append("An edge references a missing node.")
    if any(node.get("label", "").casefold() == "mixed or unallocated" for node in nodes):
        errors.append("The provisional mixed-or-unallocated category entered publication.")
    if any(node.get("node_type") == "person_or_employee" for node in nodes):
        errors.append("A personal recipient entered the public graph.")
    for edge in edges:
        if edge["aggregation_eligible"]:
            if edge["amount_cad"] is None or not edge["denominator_id"]:
                errors.append(f"Aggregation edge {edge['edge_id']} lacks an amount or denominator.")
            if edge["amount_status"] not in {"amount_disclosed", "source_does_not_specify"}:
                errors.append(f"Aggregation edge {edge['edge_id']} lacks amount-bearing evidence.")
        if edge["funding_mechanism"] == "recovery_or_settlement" and Decimal(edge["amount_cad"] or "0") > 0:
            errors.append(f"Recovery edge {edge['edge_id']} lost its signed meaning.")
    eligible_events: set[tuple[str, str]] = set()
    for edge in edges:
        if not edge["aggregation_eligible"]:
            continue
        key = (edge["denominator_id"], edge["economic_event_id"])
        if key in eligible_events:
            errors.append(f"Economic event {edge['economic_event_id']} contributes twice to {edge['denominator_id']}.")
        eligible_events.add(key)
    graph_index_preview = json.dumps(
        [{key: node.get(key) for key in ("node_id", "node_type", "label", "amount_cad", "evidence_state")} for node in nodes],
        ensure_ascii=False,
    ).encode("utf-8")
    compressed_preview = len(gzip.compress(graph_index_preview))
    if compressed_preview >= 500 * 1024:
        errors.append("Compressed graph index preview exceeds 500 KiB.")
    report = {
        "release_id": contract["release_id"],
        "status": "failed" if errors else "passed",
        "errors": errors,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "compressed_index_preview_bytes": compressed_preview,
    }
    if errors:
        raise ValueError("System-map publication gates failed: " + "; ".join(errors[:5]))
    return report


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_release(workspace_root: Path, output_root: Path) -> dict[str, object]:
    private_evidence_root = workspace_root / "evidence" / "ontario-health-dollar-map"
    model_root = workspace_root / "output" / "ontario-health-dollar-map"
    public_input_root = Path(__file__).resolve().parents[1] / "data" / "input"
    if (public_input_root / "manifest.json").exists():
        manifest_bytes = (public_input_root / "manifest.json").read_bytes()
        release_material = manifest_bytes + Path(__file__).read_bytes() + (Path(__file__).parent / "flow_v2_data.py").read_bytes()
        release_id = hashlib.sha256(release_material).hexdigest()[:20]
        payment_path = public_input_root / "payment-lines.csv"
        links_path = public_input_root / "entity-links-reviewed.csv"
        observations_path = public_input_root / "financial-observations.csv"
        snapshots_path = public_input_root / "source-snapshots.csv"
        intermediary_path = public_input_root / "intermediary-outflows.csv"
        context_snapshots_path = None
    elif private_evidence_root.exists() and (model_root / "current.json").exists():
        pointer = read_json(model_root / "current.json")
        release_id = pointer["release_id"]
        payment_path = private_evidence_root / "payment-lines.csv"
        links_path = private_evidence_root / "financial-extraction" / "entity-links-reviewed.csv"
        observations_path = private_evidence_root / "financial-extraction" / "financial-observations.csv"
        snapshots_path = private_evidence_root / "financial-extraction" / "source-snapshots.csv"
        context_snapshots_path = private_evidence_root / "financial-extraction" / "context-source-snapshots.csv"
        intermediary_path = private_evidence_root / "financial-extraction" / "intermediary-outflows.csv"
    else:
        raise FileNotFoundError("No private evidence workspace or repository public inputs are available")
    payments = read_csv(payment_path)
    fiscal_year = next(row["fiscal_year"] for row in payments if row.get("fiscal_year"))
    reviewed_links = read_csv(links_path)
    source_snapshots = read_csv(snapshots_path)
    if context_snapshots_path and context_snapshots_path.exists():
        source_snapshots.extend(read_csv(context_snapshots_path))
    profiles = build_profiles(
        fiscal_year=fiscal_year,
        observations=read_csv(observations_path),
        reviewed_links=reviewed_links,
        payments=payments,
        source_snapshots=source_snapshots,
    )
    profiles_by_label = {
        label_id: profile
        for profile in profiles["profiles"]
        for label_id in profile.get("payment_label_ids", [])
    }
    entity_links = _entity_link_lookup(reviewed_links)
    flow_overview = flow_v2_data.build_overview(fiscal_year, payments)
    category_payloads = {
        category_id: flow_v2_data.build_category_payload(
            fiscal_year,
            category_id,
            payments,
            set(profiles_by_label),
        )
        for category_id, _ in flow_v2_data.CATEGORIES
    }
    flow_v2_data.annotate_program_memberships(category_payloads)
    payee_index, payee_payloads = flow_v2_data.build_payee_payloads(
        fiscal_year,
        payments,
        entity_links,
        profiles_by_label,
    )
    intermediary_payloads = flow_v2_data.build_intermediary_payloads(
        fiscal_year,
        read_csv(intermediary_path),
    )
    intermediary_by_label = {
        payload["published_label_match"].strip().casefold(): (intermediary_id, payload)
        for intermediary_id, payload in intermediary_payloads.items()
    }
    payee_by_label = {
        str(row["published_label"]).strip().casefold(): row
        for row in payee_index
    }
    for payload in intermediary_payloads.values():
        for group in payload["groups"]:
            for component in group["components"]:
                target_id = component.get("target_intermediary_id")
                if not target_id or target_id not in intermediary_payloads:
                    continue
                target_label = intermediary_payloads[target_id]["published_label_match"].strip().casefold()
                target_payee = payee_by_label.get(target_label)
                if target_payee:
                    component["target_payee_id"] = target_payee["payment_label_id"]
                    component["target_payee_path"] = target_payee["path"]
    for row in payee_index:
        matched = intermediary_by_label.get(str(row["published_label"]).strip().casefold())
        if matched:
            row["intermediary_path"] = f"intermediaries/{matched[0]}.json"
            payee_payloads[row["payment_label_id"]]["intermediary_path"] = row["intermediary_path"]
    organization_payloads, label_to_organization = flow_v2_data.build_organization_payloads(
        payee_index,
        payee_payloads,
    )
    flow_v2_data.remap_category_destinations(
        category_payloads,
        label_to_organization,
        organization_payloads,
    )
    convergence = flow_v2_data.build_convergence_index(payee_index, flow_overview)
    flow_v2_data.annotate_destination_rankings(category_payloads, convergence["payees"])
    for row in convergence["payees"]:
        payloads = organization_payloads if row["payment_label_id"] in organization_payloads else payee_payloads
        payloads[row["payment_label_id"]]["global_rank"] = row["global_rank"]
        payloads[row["payment_label_id"]]["share_of_all_positive_percent"] = row["share_of_all_positive_percent"]
    network_overview = flow_v2_data.build_network_overview(
        flow_overview,
        category_payloads,
        convergence,
        payee_payloads,
        organization_payloads,
    )
    taxonomy_crosswalk = flow_v2_data.build_crosswalk(payments)
    sample_fixture_path = public_input_root / "taxonomy-sample-fixture.json"
    taxonomy_sample = (
        read_json(sample_fixture_path)
        if sample_fixture_path.exists()
        else flow_v2_data.build_sample_fixture(payments, seed=20261121)
    )
    release = {
        "schema_version": "2.0.0",
        "release_id": release_id,
        "fiscal_year": fiscal_year,
        "flow_v2": {
            "overview_path": f"data/releases/{release_id}/flow-v2-overview.json",
            "convergence_path": f"data/releases/{release_id}/convergence-index.json",
            "network_path": f"data/releases/{release_id}/network-overview.json",
            "taxonomy_path": f"data/releases/{release_id}/taxonomy-crosswalk.json",
            "sample_path": f"data/releases/{release_id}/taxonomy-sample.json",
            "source_path": f"data/releases/{release_id}/source-index.json",
        },
    }
    release_dir = output_root / "data" / "releases" / release_id
    write_json(release_dir / "flow-v2-overview.json", flow_overview)
    write_json(release_dir / "convergence-index.json", convergence)
    write_json(release_dir / "network-overview.json", network_overview)
    write_json(release_dir / "taxonomy-crosswalk.json", {
        "schema_version": "2.0.0",
        "taxonomy_version": flow_v2_data.TAXONOMY_VERSION,
        "mappings": taxonomy_crosswalk,
    })
    write_json(release_dir / "taxonomy-sample.json", taxonomy_sample)
    for category_id, payload in category_payloads.items():
        write_json(release_dir / "categories" / f"{category_id}.json", payload)
    for label_id, payload in payee_payloads.items():
        write_json(release_dir / "payees" / f"{label_id}.json", payload)
    for organization_id, payload in organization_payloads.items():
        write_json(release_dir / "organizations" / f"{organization_id}.json", payload)
    for intermediary_id, payload in intermediary_payloads.items():
        write_json(release_dir / "intermediaries" / f"{intermediary_id}.json", payload)
    for label_id, profile in profiles_by_label.items():
        write_json(release_dir / "profiles" / f"{label_id}.json", {
            "schema_version": "2.0.0",
            "fiscal_year": fiscal_year,
            **profile,
        })
    write_json(release_dir / "source-index.json", {
        "schema_version": "2.0.0",
        "sources": [
            {
                "label": "Ontario Public Accounts 2025–26 Detailed Schedules of Payments",
                "url": "https://www.ontario.ca/page/public-accounts-2025-26-detailed-schedules-payments",
                "role": "Published payment amounts, programs and payee labels",
            },
            {
                "label": "Published financial statements",
                "url": "https://www.ontario.ca/page/public-accounts-ontario-2025-26",
                "role": "Approved recipient revenue and expense profiles where available",
            },
        ],
    })
    write_json(release_dir / "release.json", release)
    flow_bundle_digest = hashlib.sha256()
    flow_artifact_count = 0
    for directory in (
        release_dir / "categories",
        release_dir / "payees",
        release_dir / "organizations",
        release_dir / "profiles",
        release_dir / "intermediaries",
    ):
        for path in sorted(directory.glob("*.json")):
            flow_bundle_digest.update(path.relative_to(release_dir).as_posix().encode("utf-8"))
            flow_bundle_digest.update(path.read_bytes())
            flow_artifact_count += 1
    primary_artifacts = [
        "release.json", "flow-v2-overview.json", "convergence-index.json", "network-overview.json", "taxonomy-crosswalk.json",
        "taxonomy-sample.json", "source-index.json",
    ]
    write_json(
        release_dir / "manifest.json",
        {
            "release_id": release_id,
            "schema_version": "2.0.0",
            "fiscal_year": fiscal_year,
            "source_structural_release": f"structural-model/releases/{release_id}",
            "artifact_sha256": {
                filename: sha256_file(release_dir / filename) for filename in primary_artifacts
            },
            "flow_bundle_sha256": flow_bundle_digest.hexdigest(),
            "flow_artifact_count": flow_artifact_count,
            "payee_count": len(payee_index),
            "verified_organization_payload_count": len(organization_payloads),
            "profile_count": len(profiles_by_label),
        },
    )
    write_json(
        output_root / "data" / "current.json",
        {
            "release_id": release_id,
            "fiscal_year": fiscal_year,
            "release_path": f"data/releases/{release_id}/release.json",
            "flow_v2": {
                "overview_path": f"data/releases/{release_id}/flow-v2-overview.json",
                "convergence_path": f"data/releases/{release_id}/convergence-index.json",
                "network_path": f"data/releases/{release_id}/network-overview.json",
                "taxonomy_path": f"data/releases/{release_id}/taxonomy-crosswalk.json",
                "sample_path": f"data/releases/{release_id}/taxonomy-sample.json",
                "source_path": f"data/releases/{release_id}/source-index.json",
            },
        },
    )
    return release


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--workspace-root",
        type=Path,
        default=Path(__file__).resolve().parents[3],
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "dist",
    )
    args = parser.parse_args()
    release = build_release(args.workspace_root.resolve(), args.output.resolve())
    print(
        json.dumps(
            {
                "release_id": release["release_id"],
                "fiscal_year": release["fiscal_year"],
                "categories": len(flow_v2_data.CATEGORIES),
                "taxonomy_version": flow_v2_data.TAXONOMY_VERSION,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
