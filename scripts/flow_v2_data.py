from __future__ import annotations

import hashlib
import math
import random
from collections import defaultdict
from decimal import Decimal
from typing import Iterable


FISCAL_YEAR = "2025-26"
TAXONOMY_VERSION = "2025-26.1"

CATEGORIES = (
    ("hospital_care", "Hospital care"),
    ("physician_practitioner_and_insured_services", "Physician, practitioner and other insured services"),
    ("drugs_and_assistive_devices", "Drugs and assistive devices"),
    ("long_term_care", "Long-term care"),
    ("home_and_community_care", "Home and community care"),
    ("specialized_provincial_clinical_services", "Specialized provincial clinical services"),
    ("health_capital_and_infrastructure", "Health capital and infrastructure"),
    ("mental_health_and_addictions", "Mental health and addictions"),
    ("public_health", "Public health"),
    ("emergency_health_services", "Emergency health services"),
    ("health_workforce_education_and_research", "Health workforce, education and research"),
    ("primary_health_care", "Primary health care"),
    ("digital_health_quality_and_system_coordination", "Digital health, quality and system coordination"),
    ("ministry_operations_and_other_published_payments", "Ministry operations and other published payments"),
)
CATEGORY_LABELS = dict(CATEGORIES)
RESIDUAL_CATEGORY = "ministry_operations_and_other_published_payments"
PAYMENTS_SOURCE_URL = "https://www.ontario.ca/page/public-accounts-2025-26-detailed-schedules-payments"
ONTARIO_HEALTH_STATEMENT_URL = "https://www.ontariohealth.ca/content/dam/ontariohealth/documents/financial-statements-2025-26.pdf"
ONTARIO_HEALTH_ATHOME_STATEMENT_URL = "https://www.ontariohealthathome.ca/blobohahprod4cd80afe1b/wp-content/uploads/2026/06/OHaH-2025-26-Audited-Financial-Statements-EN.pdf"


INTERMEDIARY_PROGRAM_CONTEXT = {
    "Operation Of Hospitals": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Cancer Treatment Services": {
        "label": "Ontario Health",
        "role": "clinical-program funding role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Cancer Screening Programs": {
        "label": "Ontario Health",
        "role": "clinical-program funding role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Renal Services": {
        "label": "Ontario Health",
        "role": "clinical-program funding role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Organ And Tissue Donation And Transplantation Services": {
        "label": "Ontario Health",
        "role": "clinical-program funding role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Ontario Drug Programs": {
        "label": "Ontario Health",
        "role": "clinical-program funding role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Community Mental Health": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Addiction Program": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Community Support Services": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Assisted Living Services In Supportive Housing": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Acquired Brain Injury": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Community Health Centres": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
    "Home Care": {
        "label": "Ontario Health and Ontario Health atHome",
        "role": "funding and contracting role",
        "source_url": ONTARIO_HEALTH_ATHOME_STATEMENT_URL,
    },
    "Long-term care transfer payments": {
        "label": "Ontario Health",
        "role": "funding and accountability role",
        "source_url": ONTARIO_HEALTH_STATEMENT_URL,
    },
}


def intermediary_context(program_label: str) -> dict[str, str] | None:
    context = INTERMEDIARY_PROGRAM_CONTEXT.get(program_label)
    if not context:
        return None
    return {
        **context,
        "amount_status": "not_separately_published",
        "explanation": (
            f"{context['label']} has a documented {context['role']} for this program. "
            "The share of this published payee amount that passed through the intermediary is not separately published."
        ),
    }


def payment_source(period: str, source_id: str = "pa-payments-2025-26-r3ab37bb7") -> dict[str, str]:
    return {
        "source_id": source_id,
        "url": PAYMENTS_SOURCE_URL,
        "period": period,
        "limitation": "Published payment record; it does not by itself identify the recipient's ultimate use of the funds.",
    }


def _rules(category_id: str, *details: str) -> dict[tuple[str, str, str], str]:
    return {
        ("Ministry Of Health", "Transfer Payments", detail): category_id
        for detail in details
    }


PROGRAM_RULES: dict[tuple[str, str, str], str] = {}
PROGRAM_RULES.update(_rules(
    "hospital_care",
    "Operation Of Hospitals",
    "Operation Of Related Facilities",
    "Grants To Compensate For Municipal Taxation Hospitals",
    "Grants To Compensate For Municipal Taxation Specialty Psychiatric Hospitals",
))
PROGRAM_RULES.update(_rules(
    "physician_practitioner_and_insured_services",
    "Payments Made For Services And Care Provided By Physicians And Practitioners",
    "Midwifery Services",
    "Integrated Health Facility Programs",
    "Quality Management Program - Laboratory Services",
    "Northern Travel Program",
))
PROGRAM_RULES.update(_rules(
    "primary_health_care",
    "Community Health Centres",
    "Community And Priority Services",
))
PROGRAM_RULES.update(_rules(
    "home_and_community_care",
    "Home Care",
    "Community Support Services",
    "Assisted Living Services In Supportive Housing",
    "Acquired Brain Injury",
))
PROGRAM_RULES.update(_rules(
    "mental_health_and_addictions",
    "Community Mental Health",
    "Addiction Program",
    "Child And Youth Mental Health",
    "Specialty Psychiatric Hospitals",
))
PROGRAM_RULES.update(_rules(
    "drugs_and_assistive_devices",
    "Ontario Drug Programs",
    "Assistive Devices And Supplies Program",
))
PROGRAM_RULES[("Ministry Of Health", "Statutory Payments", "Ontario Government Pharmacy")] = "drugs_and_assistive_devices"
PROGRAM_RULES.update(_rules(
    "public_health",
    "Official Local Health Agencies",
    "Ontario Agency For Health Protection And Promotion",
    "Outbreaks Of Diseases",
    "Hiv Aids And Hepatitis C Programs",
    "Community Health Programs",
    "Prevent Disease Injury And Addiction",
    "Smoke-Free Ontario",
    "Tuberculosis Prevention",
    "Disease Prevention Strategy",
    "Sexually Transmitted Diseases Control",
))
PROGRAM_RULES.update(_rules(
    "emergency_health_services",
    "Municipal Ambulance Operations",
    "Other Ambulance Operations",
    "Air Ambulance",
))
PROGRAM_RULES.update(_rules(
    "specialized_provincial_clinical_services",
    "Cancer Treatment Services",
    "Cancer Screening Programs",
    "Renal Services",
    "Canadian Blood Services",
    "Organ And Tissue Donation And Transplantation Services",
))
PROGRAM_RULES.update(_rules(
    "health_capital_and_infrastructure",
    "Major Hospital Projects",
    "Health Infrastructure Renewal Fund",
    "Small Hospital Projects",
    "Medical And Diagnostic Equipment Fund",
    "Emergency Health Services Capital",
))
PROGRAM_RULES.update(_rules(
    "health_workforce_education_and_research",
    "Clinical Education",
    "Clinical Education/Formation Clinique",
    "Health Workforce Programs",
    "Applied Health Evidence Program",
    "Underserviced Area Plan",
))
PROGRAM_RULES.update(_rules(
    "digital_health_quality_and_system_coordination",
    "Digital Health",
    "Digital Health Strategy And Programs",
    "Regional Coordination Operations Support",
    "Quality Health Initiatives",
    "Health Quality Programs",
    "Health System Information Management",
    "Ontario Health",
))
PROGRAM_RULES[("Ministry Of Long-Term Care", "Transfer Payments", "No Value")] = "long_term_care"

RESIDUAL_KEYS = {
    ("Ministry Of Health", "Other Payments", "No Value"),
    ("Ministry Of Long-Term Care", "Other Payments", "No Value"),
    ("Ministry Of Health", "Other Payments", "Other Transactions"),
    ("Ministry Of Health", "Other Payments", "Tangible Capital Assets"),
    ("Ministry Of Health", "Travel Expenses", "No Value"),
    ("Ministry Of Long-Term Care", "Travel Expenses", "No Value"),
    ("Ministry Of Health", "Salaries And Wages", "Other Salaries And Wages"),
    ("Ministry Of Long-Term Care", "Salaries And Wages", "Other Salaries And Wages"),
    ("Ministry Of Health", "Salaries And Wages", "Temporary Help Services"),
    ("Ministry Of Health", "Employee Benefits", "No Value"),
    ("Ministry Of Long-Term Care", "Employee Benefits", "No Value"),
    ("Ministry Of Health", "Statutory Payments", "Ministers' Salaries"),
    ("Ministry Of Long-Term Care", "Statutory Payments", "Ministers' Salaries"),
    ("Ministry Of Health", "Statutory Payments", "Associate Ministers' Salaries"),
    ("Ministry Of Health", "Statutory Payments", "Parliamentary Assistant's Salaries"),
    ("Ministry Of Long-Term Care", "Statutory Payments", "Parliamentary Assistant's Salaries"),
}

CATEGORY_RATIONALES = {
    "hospital_care": "Hospital operating and related-facility payments; capital is classified separately.",
    "physician_practitioner_and_insured_services": "Physician, practitioner, diagnostic, midwifery and insured access programs.",
    "drugs_and_assistive_devices": "Public drug, pharmacy and assistive-device programs.",
    "long_term_care": "Ministry of Long-Term Care transfer payments to homes and related recipients.",
    "home_and_community_care": "Home care, community support, assisted living and acquired brain injury programs.",
    "specialized_provincial_clinical_services": "Cancer, renal, blood, transplant and organ-donation programs.",
    "health_capital_and_infrastructure": "Capital projects, renewal, equipment and emergency-services capital.",
    "mental_health_and_addictions": "Community, child and youth, addictions and specialty psychiatric services.",
    "public_health": "Population health, local public-health agencies and disease-prevention programs.",
    "emergency_health_services": "Municipal, other and air ambulance operations.",
    "health_workforce_education_and_research": "Clinical education, workforce, evidence and underserviced-area programs.",
    "primary_health_care": "Community health centres and team-based or priority primary-care programs.",
    "digital_health_quality_and_system_coordination": "Digital, quality, information and system-coordination programs.",
    RESIDUAL_CATEGORY: "Published ministry operations whose source line does not specify a health-service purpose.",
}


def money(value: Decimal | str | int) -> str:
    return f"{Decimal(value):.2f}"


def stable_id(prefix: str, *parts: object) -> str:
    raw = "\x1f".join(str(part) for part in parts)
    return f"{prefix}_{hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]}"


def payment_key(row: dict[str, str]) -> tuple[str, str, str]:
    return (
        row.get("ministry", ""),
        row.get("payment_category", ""),
        row.get("payment_detail", ""),
    )


def classify_payment(row: dict[str, str]) -> str:
    key = payment_key(row)
    if key in PROGRAM_RULES:
        return PROGRAM_RULES[key]
    if key in RESIDUAL_KEYS:
        return RESIDUAL_CATEGORY
    raise ValueError(f"Unmapped payment program: {key!r}")


def display_program_label(row: dict[str, str]) -> str:
    detail = row.get("payment_detail", "")
    if payment_key(row) == ("Ministry Of Long-Term Care", "Transfer Payments", "No Value"):
        return "Long-term care transfer payments"
    if not detail or detail == "No Value":
        return row.get("payment_category", "Purpose not specified")
    return detail


def build_overview(fiscal_year: str, payments: Iterable[dict[str, str]]) -> dict[str, object]:
    rows = [
        row for row in payments
        if row.get("ministry") in {"Ministry Of Health", "Ministry Of Long-Term Care"}
    ]
    category_amounts = {category_id: Decimal("0") for category_id, _ in CATEGORIES}
    ministry_amounts: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: {"positive": Decimal("0"), "adjustment": Decimal("0")}
    )
    positive_total = Decimal("0")
    adjustment_total = Decimal("0")
    named_destination_total = Decimal("0")
    aggregate_program_total = Decimal("0")
    withheld_person_total = Decimal("0")
    for row in rows:
        amount = Decimal(row["amount_cad"])
        category_id = classify_payment(row)
        if amount >= 0:
            category_amounts[category_id] += amount
            positive_total += amount
            ministry_amounts[row["ministry"]]["positive"] += amount
            if row["recipient_class"] == "program_aggregate":
                aggregate_program_total += amount
            elif row["recipient_class"] == "person_or_employee":
                withheld_person_total += amount
            else:
                named_destination_total += amount
        else:
            adjustment_total += amount
            ministry_amounts[row["ministry"]]["adjustment"] += amount
    net_total = positive_total + adjustment_total
    categories = [
        {
            "category_id": category_id,
            "label": label,
            "amount_cad": money(category_amounts[category_id]),
            "share_percent": money(
                category_amounts[category_id] / positive_total * Decimal("100")
                if positive_total else Decimal("0")
            ),
            "path": f"categories/{category_id}.json",
            "residual": category_id == RESIDUAL_CATEGORY,
        }
        for category_id, label in CATEGORIES
    ]
    categories.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["label"]))
    ministries = []
    for ministry, amounts in ministry_amounts.items():
        ministries.append({
            "ministry": ministry,
            "positive_amount_cad": money(amounts["positive"]),
            "adjustment_cad": money(amounts["adjustment"]),
            "net_amount_cad": money(amounts["positive"] + amounts["adjustment"]),
        })
    ministries.sort(key=lambda row: (-Decimal(row["net_amount_cad"]), row["ministry"]))
    if sum((Decimal(row["amount_cad"]) for row in categories), Decimal("0")) != positive_total:
        raise ValueError("Category amounts do not reconcile to positive published payments")
    return {
        "schema_version": "2.0.0",
        "taxonomy_version": TAXONOMY_VERSION,
        "fiscal_year": fiscal_year,
        "positive_published_payments_cad": money(positive_total),
        "signed_adjustments_cad": money(adjustment_total),
        "net_published_payments_cad": money(net_total),
        "named_destination_amount_cad": money(named_destination_total),
        "aggregate_program_amount_cad": money(aggregate_program_total),
        "withheld_person_amount_cad": money(withheld_person_total),
        "not_itemized_to_public_recipient_cad": money(aggregate_program_total + withheld_person_total),
        "not_itemized_share_percent": money(
            (aggregate_program_total + withheld_person_total) / positive_total * Decimal("100")
            if positive_total else Decimal("0")
        ),
        "ministries": ministries,
        "categories": categories,
        "source_note": "Ontario Public Accounts Detailed Schedule of Payments",
    }


def _destination_type(recipient_class: str) -> str:
    if recipient_class == "intermediary":
        return "intermediary"
    if recipient_class == "vendor":
        return "vendor"
    return "organization"


ENTITY_LEVEL_TYPES = {
    "hospital_corporation": "hospital corporation",
    "provincial_agency_and_intermediary": "intermediary",
    "program_administrator_and_intermediary": "intermediary",
    "municipality": "municipality",
    "public_health_unit": "public health unit",
    "long_term_care_home": "long-term care home",
    "long_term_care_operator": "long-term care operator",
}

RECIPIENT_CLASS_TYPES = (
    ("intermediary", "intermediary"),
    ("hospital_corporation", "hospital corporation"),
    ("municipal_or_public_health_recipient", "municipality or public health body"),
    ("long_term_care_related_recipient", "long-term care recipient"),
    ("home_and_community_provider", "home and community care provider"),
    ("community_provider", "community service provider"),
    ("physician_or_diagnostic_service_recipient", "insured-service recipient"),
    ("drug_device_or_pharmacy_recipient", "drug, device or pharmacy recipient"),
    ("government_entity", "government entity"),
    ("vendor", "vendor"),
)


def resolve_payee_type(rows: Iterable[dict[str, str]], link: dict[str, str] | None) -> str:
    """Use authoritative identity evidence first, then the strongest observed class."""
    if link:
        entity_level = str(link.get("entity_level", "")).strip()
        if entity_level:
            return ENTITY_LEVEL_TYPES.get(entity_level, entity_level.replace("_", " "))
    observed = {str(row.get("recipient_class", "")) for row in rows}
    for recipient_class, label in RECIPIENT_CLASS_TYPES:
        if recipient_class in observed:
            return label
    return "published payee"


def build_category_payload(
    fiscal_year: str,
    category_id: str,
    payments: Iterable[dict[str, str]],
    profile_label_ids: set[str],
) -> dict[str, object]:
    if category_id not in CATEGORY_LABELS:
        raise ValueError(f"Unknown category: {category_id}")
    rows = [row for row in payments if classify_payment(row) == category_id]
    grouped: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[(row["ministry"], row["payment_category"], display_program_label(row))].append(row)
    programs = []
    for (ministry, payment_category, label), program_rows in grouped.items():
        program_id = stable_id("program", fiscal_year, category_id, ministry, payment_category, label)
        destinations: dict[str, dict[str, object]] = {}
        not_itemized = Decimal("0")
        adjustment = Decimal("0")
        positive = Decimal("0")
        for row in program_rows:
            amount = Decimal(row["amount_cad"])
            if amount < 0:
                adjustment += amount
                continue
            positive += amount
            if row["recipient_class"] in {"person_or_employee", "program_aggregate"}:
                not_itemized += amount
                continue
            label_id = row["payment_label_id"]
            destination = destinations.setdefault(label_id, {
                "destination_id": label_id,
                "label": row["recipient_label_raw"],
                "destination_type": _destination_type(row["recipient_class"]),
                "amount_cad": Decimal("0"),
                "selectable": True,
                "has_profile": label_id in profile_label_ids,
                "path": f"payees/{label_id}.json",
            })
            destination["amount_cad"] += amount
        destination_rows = [
            {**row, "amount_cad": money(row["amount_cad"])}
            for row in destinations.values()
        ]
        destination_rows.sort(key=lambda row: (-Decimal(row["amount_cad"]), str(row["label"])))
        if not_itemized:
            destination_rows.append({
                "destination_id": f"not_itemized_{program_id}",
                "label": "Not itemized by recipient",
                "destination_type": "not_itemized",
                "amount_cad": money(not_itemized),
                "selectable": False,
                "has_profile": False,
                "path": None,
                "evidence_stop": "Not itemized by recipient",
                "source": payment_source(fiscal_year, program_rows[0].get("source_version_id") or "pa-payments-2025-26-r3ab37bb7"),
            })
        programs.append({
            "program_id": program_id,
            "ministry": ministry,
            "payment_category": payment_category,
            "label": label,
            "positive_amount_cad": money(positive),
            "adjustment_cad": money(adjustment),
            "net_amount_cad": money(positive + adjustment),
            "destinations": destination_rows,
            "destination_count": len(destination_rows),
            "source": payment_source(fiscal_year, program_rows[0].get("source_version_id") or "pa-payments-2025-26-r3ab37bb7"),
        })
    programs.sort(key=lambda row: (-Decimal(row["positive_amount_cad"]), row["label"]))
    positive_total = sum((Decimal(row["positive_amount_cad"]) for row in programs), Decimal("0"))
    adjustment_total = sum((Decimal(row["adjustment_cad"]) for row in programs), Decimal("0"))
    return {
        "schema_version": "2.0.0",
        "taxonomy_version": TAXONOMY_VERSION,
        "fiscal_year": fiscal_year,
        "category_id": category_id,
        "label": CATEGORY_LABELS[category_id],
        "positive_amount_cad": money(positive_total),
        "adjustment_cad": money(adjustment_total),
        "net_amount_cad": money(positive_total + adjustment_total),
        "programs": programs,
        "source": payment_source(fiscal_year),
    }


def annotate_program_memberships(category_payloads: dict[str, dict[str, object]]) -> None:
    """Add exact published-label memberships without merging their amounts."""
    by_label: dict[str, list[dict[str, str]]] = defaultdict(list)
    for category in category_payloads.values():
        category_id = str(category["category_id"])
        category_label = str(category["label"])
        for program in category.get("programs", []):
            label_key = " ".join(str(program["label"]).split()).casefold()
            by_label[label_key].append({
                "category_id": category_id,
                "category_label": category_label,
                "ministry": str(program["ministry"]),
                "amount_cad": str(program["positive_amount_cad"]),
            })
    for category in category_payloads.values():
        for program in category.get("programs", []):
            label_key = " ".join(str(program["label"]).split()).casefold()
            program["category_memberships"] = [dict(row) for row in by_label[label_key]]


def build_payee_payloads(
    fiscal_year: str,
    payments: Iterable[dict[str, str]],
    entity_links: dict[str, dict[str, str]],
    profiles_by_label: dict[str, dict[str, object]],
) -> tuple[list[dict[str, object]], dict[str, dict[str, object]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in payments:
        if Decimal(row["amount_cad"]) < 0:
            continue
        if row["recipient_class"] in {"person_or_employee", "program_aggregate"}:
            continue
        grouped[row["payment_label_id"]].append(row)
    index = []
    payloads = {}
    for label_id, rows in grouped.items():
        routes: dict[tuple[str, str, str], Decimal] = defaultdict(Decimal)
        for row in rows:
            category_id = classify_payment(row)
            routes[(row["ministry"], category_id, display_program_label(row))] += Decimal(row["amount_cad"])
        incoming = [
            {
                "route_id": stable_id("route", fiscal_year, label_id, ministry, category_id, program),
                "ministry": ministry,
                "category_id": category_id,
                "category_label": CATEGORY_LABELS[category_id],
                "program_label": program,
                "amount_cad": money(amount),
                **({"intermediary_context": context} if (context := intermediary_context(program)) else {}),
                "source": payment_source(fiscal_year, rows[0].get("source_version_id") or "pa-payments-2025-26-r3ab37bb7"),
            }
            for (ministry, category_id, program), amount in routes.items()
        ]
        incoming.sort(key=lambda row: (-Decimal(row["amount_cad"]), row["category_label"], row["program_label"]))
        total = sum((Decimal(row["amount_cad"]) for row in incoming), Decimal("0"))
        profile = profiles_by_label.get(label_id)
        link = entity_links.get(label_id)
        payee_type = resolve_payee_type(rows, link)
        evidence_stops = []
        if not link:
            evidence_stops.append({
                "state": "Legal identity not resolved",
                "source_id": rows[0].get("source_version_id") or "pa-payments-2025-26-r3ab37bb7",
                "period": fiscal_year,
                "limitation": "The interface preserves the exact published payee label and does not merge it with another organization.",
            })
        if not profile:
            if payee_type == "hospital corporation":
                evidence_stops.append({
                    "state": "2025–26 financial statement unavailable",
                    "source_id": "public-profile-coverage-2025-26",
                    "period": fiscal_year,
                    "limitation": "No approved 2025–26 financial profile is linked to this hospital corporation.",
                })
            else:
                evidence_stops.append({
                    "state": "Financial profile not collected in the current scope",
                    "source_id": "public-profile-coverage-2025-26",
                    "period": fiscal_year,
                    "limitation": "The current financial-profile workstream covers hospitals and the approved intermediary statements.",
                })
        payload = {
            "schema_version": "2.0.0",
            "fiscal_year": fiscal_year,
            "payment_label_id": label_id,
            "published_label": rows[0]["recipient_label_raw"],
            "display_label": link.get("authoritative_name") if link else rows[0]["recipient_label_raw"],
            "destination_type": "intermediary" if payee_type == "intermediary" else "organization",
            "payee_type": payee_type,
            "published_payment_total_cad": money(total),
            "incoming_routes": incoming,
            "is_funding_junction": len({row["category_id"] for row in incoming}) > 1,
            "identity": ({
                "entity_id": link.get("entity_id"),
                "authoritative_name": link.get("authoritative_name"),
            } if link else None),
            "identity_status": "reviewed_resolved" if link else "published_label_only",
            "profile_status": "available" if profile else "no_published_amounts",
            "profile_path": f"profiles/{label_id}.json" if profile else None,
            "evidence_stops": evidence_stops,
            "source": payment_source(fiscal_year, rows[0].get("source_version_id") or "pa-payments-2025-26-r3ab37bb7"),
        }
        payloads[label_id] = payload
        index.append({
            "payment_label_id": label_id,
            "published_label": rows[0]["recipient_label_raw"],
            "display_label": link.get("authoritative_name") if link else rows[0]["recipient_label_raw"],
            "entity_id": link.get("entity_id") if link else None,
            "authoritative_name": link.get("authoritative_name") if link else None,
            "destination_type": payload["destination_type"],
            "payee_type": payee_type,
            "identity_status": payload["identity_status"],
            "published_payment_total_cad": money(total),
            "category_ids": sorted({row["category_id"] for row in incoming}),
            "ministry_ids": sorted({row["ministry"] for row in incoming}),
            "program_keys": sorted({
                f'{row["ministry"]}\u241f{row["category_id"]}\u241f{row["program_label"]}'
                for row in incoming
            }),
            "category_count": len({row["category_id"] for row in incoming}),
            "program_count": len({(row["category_id"], row["program_label"]) for row in incoming}),
            "ministry_count": len({row["ministry"] for row in incoming}),
            "is_funding_junction": payload["is_funding_junction"],
            "has_profile": bool(profile),
            "path": f"payees/{label_id}.json",
        })
    index.sort(key=lambda row: (-Decimal(row["published_payment_total_cad"]), row["published_label"]))
    return index, payloads


def _aggregate_organization_index(payee_index: Iterable[dict[str, object]]) -> list[dict[str, object]]:
    """Combine published labels only when a reviewed entity link proves they are one organization."""
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    intermediaries: list[dict[str, object]] = []
    for source_row in payee_index:
        row = dict(source_row)
        if row.get("destination_type") == "intermediary":
            intermediaries.append(row)
            continue
        entity_id = str(row.get("entity_id") or "").strip()
        key = f"entity:{entity_id}" if entity_id else f'label:{row["payment_label_id"]}'
        grouped[key].append(row)

    organizations: list[dict[str, object]] = []
    for key, rows in grouped.items():
        entity_id = str(rows[0].get("entity_id") or "").strip() or None
        if entity_id:
            organization_id = stable_id("organization", entity_id)
            path = f"organizations/{organization_id}.json"
            display_label = str(rows[0].get("authoritative_name") or rows[0]["display_label"])
            identity_status = "reviewed_resolved"
        else:
            organization_id = str(rows[0]["payment_label_id"])
            path = str(rows[0]["path"])
            display_label = str(rows[0]["display_label"])
            identity_status = str(rows[0]["identity_status"])
        category_ids = sorted({item for row in rows for item in row.get("category_ids", [])})
        ministry_ids = sorted({item for row in rows for item in row.get("ministry_ids", [])})
        program_keys = sorted({item for row in rows for item in row.get("program_keys", [])})
        published_labels = sorted({str(row["published_label"]) for row in rows})
        payment_label_ids = sorted({str(row["payment_label_id"]) for row in rows})
        total = sum((Decimal(str(row["published_payment_total_cad"])) for row in rows), Decimal("0"))
        organizations.append({
            "payment_label_id": organization_id,
            "payment_label_ids": payment_label_ids,
            "published_label": published_labels[0] if len(published_labels) == 1 else display_label,
            "published_labels": published_labels,
            "alias_count": len(published_labels),
            "display_label": display_label,
            "entity_id": entity_id,
            "authoritative_name": display_label if entity_id else None,
            "destination_type": str(rows[0]["destination_type"]),
            "payee_type": str(rows[0].get("payee_type") or rows[0]["destination_type"]),
            "identity_status": identity_status,
            "published_payment_total_cad": money(total),
            "category_ids": category_ids,
            "category_count": len(category_ids),
            "program_count": len(program_keys),
            "ministry_count": len(ministry_ids),
            "ministry_ids": ministry_ids,
            "program_keys": program_keys,
            "is_funding_junction": len(category_ids) > 1,
            "has_profile": any(bool(row.get("has_profile")) for row in rows),
            "path": path,
        })
    return organizations + intermediaries


def build_organization_payloads(
    payee_index: Iterable[dict[str, object]],
    payee_payloads: dict[str, dict[str, object]],
) -> tuple[dict[str, dict[str, object]], dict[str, dict[str, object]]]:
    """Build one selectable payload per verified organization and retain all source labels."""
    index_rows = [dict(row) for row in payee_index]
    aggregated = _aggregate_organization_index(index_rows)
    organization_payloads: dict[str, dict[str, object]] = {}
    label_to_organization: dict[str, dict[str, object]] = {}
    for row in aggregated:
        label_ids = list(row.get("payment_label_ids") or [row["payment_label_id"]])
        if row.get("destination_type") == "intermediary" or not row.get("entity_id"):
            for label_id in label_ids:
                label_to_organization[str(label_id)] = {
                    "payment_label_id": str(row["payment_label_id"]),
                    "path": str(row["path"]),
                    "display_label": str(row["display_label"]),
                    "has_profile": bool(row.get("has_profile")),
                    "payee_type": str(row.get("payee_type") or "published payee"),
                    "destination_type": str(row.get("destination_type") or "organization"),
                }
            continue

        routes: dict[tuple[str, str, str], Decimal] = defaultdict(Decimal)
        source_payloads = [payee_payloads[label_id] for label_id in label_ids]
        for payload in source_payloads:
            for route in payload.get("incoming_routes", []):
                key = (str(route["ministry"]), str(route["category_id"]), str(route["program_label"]))
                routes[key] += Decimal(str(route["amount_cad"]))
        incoming = [{
            "route_id": stable_id("organization_route", str(row["payment_label_id"]), ministry, category_id, program),
            "ministry": ministry,
            "category_id": category_id,
            "category_label": CATEGORY_LABELS[category_id],
            "program_label": program,
            "amount_cad": money(amount),
            **({"intermediary_context": context} if (context := intermediary_context(program)) else {}),
        } for (ministry, category_id, program), amount in routes.items()]
        incoming.sort(key=lambda item: (-Decimal(str(item["amount_cad"])), item["category_label"], item["program_label"]))
        profile_paths = sorted({
            str(payload["profile_path"])
            for payload in source_payloads
            if payload.get("profile_path")
        })
        payload = {
            "schema_version": "3.0.0",
            "fiscal_year": source_payloads[0]["fiscal_year"],
            "payment_label_id": row["payment_label_id"],
            "payment_label_ids": label_ids,
            "published_label": row["display_label"],
            "published_labels": row["published_labels"],
            "display_label": row["display_label"],
            "destination_type": row["destination_type"],
            "payee_type": row["payee_type"],
            "published_payment_total_cad": row["published_payment_total_cad"],
            "incoming_routes": incoming,
            "is_funding_junction": row["is_funding_junction"],
            "identity": {
                "entity_id": row["entity_id"],
                "authoritative_name": row["authoritative_name"],
            },
            "identity_status": "reviewed_resolved",
            "profile_status": "available" if profile_paths else "no_published_amounts",
            "profile_path": profile_paths[0] if profile_paths else None,
            "evidence_stops": [
                stop
                for source_payload in source_payloads
                for stop in source_payload.get("evidence_stops", [])
                if stop.get("state") != "Legal identity not resolved"
            ],
            "source": source_payloads[0].get("source", payment_source(str(source_payloads[0]["fiscal_year"]))),
        }
        organization_payloads[str(row["payment_label_id"])] = payload
        for label_id in label_ids:
            label_to_organization[str(label_id)] = {
                "payment_label_id": str(row["payment_label_id"]),
                "path": str(row["path"]),
                "display_label": str(row["display_label"]),
                "has_profile": bool(profile_paths),
                "payee_type": str(row.get("payee_type") or "published payee"),
                "destination_type": str(row.get("destination_type") or "organization"),
            }
    return organization_payloads, label_to_organization


def remap_category_destinations(
    category_payloads: dict[str, dict[str, object]],
    label_to_organization: dict[str, dict[str, object]],
    organization_payloads: dict[str, dict[str, object]],
) -> None:
    """Point category branches at verified organizations and combine aliases within a program."""
    for category in category_payloads.values():
        for program in category.get("programs", []):
            merged: dict[str, dict[str, object]] = {}
            terminal_rows: list[dict[str, object]] = []
            for destination in program.get("destinations", []):
                if not destination.get("selectable"):
                    terminal_rows.append(destination)
                    continue
                source_id = str(destination["destination_id"])
                resolved = label_to_organization.get(source_id)
                if not resolved:
                    terminal_rows.append(destination)
                    continue
                target_id = str(resolved["payment_label_id"])
                current = merged.setdefault(target_id, {
                    **destination,
                    "destination_id": target_id,
                    "label": resolved["display_label"],
                    "path": resolved["path"],
                    "has_profile": resolved["has_profile"],
                    "payee_type": resolved["payee_type"],
                    "destination_type": resolved["destination_type"],
                    "amount_cad": Decimal("0"),
                })
                current["amount_cad"] += Decimal(str(destination["amount_cad"]))
            merged_rows = [{**row, "amount_cad": money(row["amount_cad"])} for row in merged.values()]
            merged_rows.sort(key=lambda row: (-Decimal(str(row["amount_cad"])), str(row["label"])))
            program["destinations"] = merged_rows + terminal_rows
            program["destination_count"] = len(program["destinations"])


def annotate_destination_rankings(
    category_payloads: dict[str, dict[str, object]],
    ranked_payees: Iterable[dict[str, object]],
) -> None:
    ranked = {str(row["payment_label_id"]): row for row in ranked_payees}
    for category in category_payloads.values():
        for program in category.get("programs", []):
            program_rank = 0
            for destination in program.get("destinations", []):
                if not destination.get("selectable"):
                    destination["evidence_stop"] = "Not itemized by recipient"
                    continue
                program_rank += 1
                row = ranked.get(str(destination["destination_id"]))
                destination["program_rank"] = program_rank
                if row:
                    destination["global_rank"] = row["global_rank"]
                    destination["global_total_cad"] = row["published_payment_total_cad"]
                    destination["payee_type"] = row.get("payee_type", "published payee")


def _share(numerator: Decimal, denominator: Decimal) -> str:
    return money(numerator / denominator * Decimal("100") if denominator else Decimal("0"))


def _recipient_threshold_count(rows: list[dict[str, object]], denominator: Decimal, threshold: Decimal) -> int:
    target = denominator * threshold
    running = Decimal("0")
    for index, row in enumerate(rows, start=1):
        running += Decimal(str(row["published_payment_total_cad"]))
        if running >= target:
            return index
    return len(rows)


def build_convergence_index(
    payee_index: Iterable[dict[str, object]],
    overview: dict[str, object],
) -> dict[str, object]:
    """Build one global ranking of all named payees with visible payee types."""
    rows = _aggregate_organization_index(payee_index)
    organizations = [row for row in rows if row.get("destination_type") != "intermediary"]
    intermediaries = [row for row in rows if row.get("destination_type") == "intermediary"]
    payees = list(rows)
    payees.sort(key=lambda row: (-Decimal(str(row["published_payment_total_cad"])), str(row["display_label"])))
    organizations.sort(key=lambda row: (-Decimal(str(row["published_payment_total_cad"])), str(row["display_label"])))
    intermediaries.sort(key=lambda row: (-Decimal(str(row["published_payment_total_cad"])), str(row["display_label"])))
    named_total = Decimal(str(overview["named_destination_amount_cad"]))
    organization_total = sum((Decimal(str(row["published_payment_total_cad"])) for row in organizations), Decimal("0"))
    positive_total = Decimal(str(overview["positive_published_payments_cad"]))

    for rank, row in enumerate(payees, start=1):
        amount = Decimal(str(row["published_payment_total_cad"]))
        row["global_rank"] = rank
        row["share_of_named_payees_percent"] = _share(amount, named_total)
        row["share_of_all_positive_percent"] = _share(amount, positive_total)

    for rank, row in enumerate(organizations, start=1):
        row["recipient_rank"] = rank

    rank_by_id = {str(row["payment_label_id"]): row for row in payees}
    for row in organizations + intermediaries:
        ranked = rank_by_id[str(row["payment_label_id"])]
        row.update({key: ranked[key] for key in (
            "global_rank", "share_of_named_payees_percent", "share_of_all_positive_percent"
        )})

    def top_share(count: int) -> str:
        return _share(
            sum((Decimal(str(row["published_payment_total_cad"])) for row in payees[:count]), Decimal("0")),
            named_total,
        )

    return {
        "schema_version": "3.0.0",
        "fiscal_year": overview["fiscal_year"],
        "positive_published_payments_cad": overview["positive_published_payments_cad"],
        "named_destination_amount_cad": money(named_total),
        "named_organization_amount_cad": money(organization_total),
        "not_itemized_to_public_recipient_cad": overview["not_itemized_to_public_recipient_cad"],
        "not_itemized_share_percent": overview["not_itemized_share_percent"],
        "payees": payees,
        "organizations": organizations,
        "intermediaries": intermediaries,
        "concentration": {
            "top_1_share_of_named_payees_percent": top_share(1),
            "top_5_share_of_named_payees_percent": top_share(5),
            "top_10_share_of_named_payees_percent": top_share(10),
            "payees_to_50_percent": _recipient_threshold_count(payees, named_total, Decimal("0.50")),
            "payees_to_80_percent": _recipient_threshold_count(payees, named_total, Decimal("0.80")),
        },
    }


def program_key(ministry: str, category_id: str, program_label: str) -> str:
    return f"{ministry}\u241f{category_id}\u241f{program_label}"


def build_network_overview(
    overview: dict[str, object],
    category_payloads: dict[str, dict[str, object]],
    convergence: dict[str, object],
    payee_payloads: dict[str, dict[str, object]],
    organization_payloads: dict[str, dict[str, object]],
    intermediary_payloads: dict[str, dict[str, object]] | None = None,
    *,
    labelled_count: int = 50,
) -> dict[str, object]:
    """Build the compact, public contract used by the radial network."""
    programs: list[dict[str, object]] = []
    categories: list[dict[str, object]] = []
    for category_row in overview["categories"]:
        category_id = str(category_row["category_id"])
        payload = category_payloads[category_id]
        ministry_amounts: dict[str, Decimal] = defaultdict(Decimal)
        for row in payload.get("programs", []):
            amount = Decimal(str(row["positive_amount_cad"]))
            ministry = str(row["ministry"])
            ministry_amounts[ministry] += amount
            not_itemized_amount = sum(
                (
                    Decimal(str(destination["amount_cad"]))
                    for destination in row.get("destinations", [])
                    if destination.get("destination_type") == "not_itemized"
                ),
                Decimal("0"),
            )
            intermediary_amount = sum(
                (
                    Decimal(str(destination["amount_cad"]))
                    for destination in row.get("destinations", [])
                    if destination.get("destination_type") == "intermediary"
                ),
                Decimal("0"),
            )
            programs.append({
                "program_key": program_key(ministry, category_id, str(row["label"])),
                "program_id": row["program_id"],
                "label": row["label"],
                "category_id": category_id,
                "ministry": ministry,
                "amount_cad": money(amount),
                "not_itemized_amount_cad": money(not_itemized_amount),
                "intermediary_amount_cad": money(intermediary_amount),
            })
        categories.append({
            "category_id": category_id,
            "label": category_row["label"],
            "amount_cad": category_row["amount_cad"],
            "share_percent": category_row["share_percent"],
            "program_count": len(payload.get("programs", [])),
            "ministry_amounts": [
                {"ministry": ministry, "amount_cad": money(amount)}
                for ministry, amount in sorted(ministry_amounts.items())
            ],
        })
    programs.sort(key=lambda row: (-Decimal(str(row["amount_cad"])), str(row["label"])))

    recipients: list[dict[str, object]] = []
    named_routes: list[dict[str, object]] = []
    default_routes: list[dict[str, object]] = []
    collapsed_routes: dict[str, Decimal] = defaultdict(Decimal)
    collapsed_amount = Decimal("0")
    for position, convergence_row in enumerate(convergence["organizations"]):
        recipient_id = str(convergence_row["payment_label_id"])
        payload = organization_payloads.get(recipient_id) or payee_payloads.get(recipient_id)
        if payload is None:
            raise ValueError(f"Network recipient payload is unavailable: {recipient_id}")
        label_by_default = position < labelled_count
        recipients.append({
            "recipient_id": recipient_id,
            "label": convergence_row["display_label"],
            "payee_type": convergence_row["payee_type"],
            "destination_type": convergence_row["destination_type"],
            "amount_cad": convergence_row["published_payment_total_cad"],
            "global_rank": convergence_row.get("recipient_rank", convergence_row["global_rank"]),
            "path": convergence_row["path"],
            "has_profile": bool(convergence_row.get("has_profile")),
            "is_intermediary": False,
            "label_by_default": label_by_default,
        })
        for route in payload.get("incoming_routes", []):
            named_routes.append({
                "recipient_id": recipient_id,
                "program_key": program_key(
                    str(route["ministry"]), str(route["category_id"]), str(route["program_label"]),
                ),
                "amount_cad": route["amount_cad"],
            })
        if label_by_default:
            for route in payload.get("incoming_routes", []):
                default_routes.append({
                    "recipient_id": recipient_id,
                    "target_type": "named_recipient",
                    "program_key": program_key(
                        str(route["ministry"]), str(route["category_id"]), str(route["program_label"]),
                    ),
                    "amount_cad": route["amount_cad"],
                })
        else:
            collapsed_amount += Decimal(str(convergence_row["published_payment_total_cad"]))
            for route in payload.get("incoming_routes", []):
                key = program_key(
                    str(route["ministry"]), str(route["category_id"]), str(route["program_label"]),
                )
                collapsed_routes[key] += Decimal(str(route["amount_cad"]))

    default_routes.extend({
        "recipient_id": "__smaller_recipients__",
        "target_type": "smaller_recipients",
        "program_key": key,
        "amount_cad": money(amount),
    } for key, amount in sorted(collapsed_routes.items()) if amount)
    default_routes.extend({
        "recipient_id": "__intermediary_stop__",
        "target_type": "intermediary_stop",
        "program_key": str(program["program_key"]),
        "amount_cad": str(program["intermediary_amount_cad"]),
    } for program in programs if Decimal(str(program["intermediary_amount_cad"])))
    default_routes.extend({
        "recipient_id": "__not_itemized__",
        "target_type": "not_itemized",
        "program_key": str(program["program_key"]),
        "amount_cad": str(program["not_itemized_amount_cad"]),
    } for program in programs if Decimal(str(program["not_itemized_amount_cad"])))

    program_keys = {str(row["program_key"]) for row in programs}
    if any(str(row["program_key"]) not in program_keys for row in default_routes):
        raise ValueError("A default network route references an unknown program")
    for category in categories:
        ministry_total = sum(
            (Decimal(str(row["amount_cad"])) for row in category["ministry_amounts"]), Decimal("0")
        )
        if ministry_total != Decimal(str(category["amount_cad"])):
            raise ValueError(f"Network ministry split does not reconcile for {category['category_id']}")

    named_intermediary_total = sum(
        (Decimal(str(row["published_payment_total_cad"])) for row in convergence["intermediaries"]),
        Decimal("0"),
    )
    named_non_intermediary_total = sum(
        (Decimal(str(row["published_payment_total_cad"])) for row in convergence["organizations"]),
        Decimal("0"),
    )
    positive_total = Decimal(str(overview["positive_published_payments_cad"]))
    if named_non_intermediary_total + named_intermediary_total != Decimal(str(overview["named_destination_amount_cad"])):
        raise ValueError("Named organizations and intermediaries do not reconcile to named destinations")

    intermediary_payloads = intermediary_payloads or {}
    ontario_health_payload = intermediary_payloads.get("ontario_health", {})
    oh_groups = {str(row.get("group_id")): Decimal(str(row.get("amount_cad", "0"))) for row in ontario_health_payload.get("groups", [])}
    oh_public_accounts_amount = sum(
        (
            Decimal(str(row["published_payment_total_cad"]))
            for row in convergence["intermediaries"]
            if str(row.get("display_label", "")).strip().casefold() == "ontario health"
        ),
        Decimal("0"),
    )
    intermediary_note = {
        "ontario_health_public_accounts_amount_cad": money(oh_public_accounts_amount),
        "ontario_health_reported_expense_total_cad": str(ontario_health_payload.get("reported_expense_total_cad", "0.00")),
        "ontario_health_passed_on_cad": money(oh_groups.get("passed_on", Decimal("0"))),
        "ontario_health_own_operations_cad": money(oh_groups.get("own_operations", Decimal("0"))),
        "recipient_crosswalk_amount_cad": "0.00",
        "source_url": str(ontario_health_payload.get("source", {}).get("url") or ONTARIO_HEALTH_STATEMENT_URL),
        "explanation": (
            "Ontario Health is shown as an explanatory intermediary, not ranked as a recipient. "
            "Its audited transfers and operations are a separate reporting frame and are not added to the published-payment total."
        ),
    }

    return {
        "schema_version": "3.0.0",
        "fiscal_year": overview["fiscal_year"],
        "positive_published_payments_cad": overview["positive_published_payments_cad"],
        "signed_adjustments_cad": overview["signed_adjustments_cad"],
        "net_published_payments_cad": overview["net_published_payments_cad"],
        "named_destination_amount_cad": overview["named_destination_amount_cad"],
        "named_non_intermediary_amount_cad": money(named_non_intermediary_total),
        "named_non_intermediary_share_percent": _share(named_non_intermediary_total, positive_total),
        "named_intermediary_amount_cad": money(named_intermediary_total),
        "named_intermediary_share_percent": _share(named_intermediary_total, positive_total),
        "intermediary_note": intermediary_note,
        "named_recipient_count": len(recipients),
        "displayed_recipient_count": min(labelled_count, len(recipients)),
        "collapsed_recipient_count": max(0, len(recipients) - labelled_count),
        "collapsed_recipient_amount_cad": money(collapsed_amount),
        "not_itemized_to_public_recipient_cad": overview["not_itemized_to_public_recipient_cad"],
        "not_itemized_share_percent": overview["not_itemized_share_percent"],
        "ministries": overview["ministries"],
        "categories": categories,
        "programs": programs,
        "recipients": recipients,
        "named_routes": named_routes,
        "default_routes": default_routes,
        "source": {
            "label": "Ontario Public Accounts 2025–26 Detailed Schedules of Payments",
            "url": PAYMENTS_SOURCE_URL,
        },
    }


def build_intermediary_payloads(
    fiscal_year: str,
    observations: Iterable[dict[str, str]],
) -> dict[str, dict[str, object]]:
    """Create one mutually exclusive expense decomposition for each intermediary."""
    by_intermediary: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in observations:
        if row.get("fiscal_year") == fiscal_year:
            by_intermediary[row["intermediary_id"]].append(row)
    payloads: dict[str, dict[str, object]] = {}
    for intermediary_id, rows in by_intermediary.items():
        groups: dict[str, dict[str, object]] = {}
        for row in rows:
            group = groups.setdefault(row["group_id"], {
                "group_id": row["group_id"],
                "group_label": row["group_label"],
                "group_order": int(row.get("group_order") or 99),
                "amount_cad": Decimal("0"),
                "components": [],
            })
            amount = Decimal(row["amount_cad"])
            group["amount_cad"] += amount
            group["components"].append({
                "source_label": row["source_label"],
                "amount_cad": money(amount),
                **({"target_intermediary_id": row["target_intermediary_id"]} if row.get("target_intermediary_id") else {}),
            })
        group_rows = []
        for group in groups.values():
            group["components"].sort(key=lambda component: (-Decimal(component["amount_cad"]), component["source_label"]))
            group_rows.append({**group, "amount_cad": money(group["amount_cad"])})
        group_rows.sort(key=lambda group: (group["group_order"], group["group_label"]))
        total = sum((Decimal(group["amount_cad"]) for group in group_rows), Decimal("0"))
        payloads[intermediary_id] = {
            "schema_version": "3.0.0",
            "fiscal_year": fiscal_year,
            "intermediary_id": intermediary_id,
            "intermediary_label": rows[0]["intermediary_label"],
            "published_label_match": rows[0].get("published_label_match", rows[0]["intermediary_label"]),
            "reported_expense_total_cad": money(total),
            "groups": group_rows,
            "source": {
                "url": rows[0].get("source_url", ""),
                "page": rows[0].get("source_page", ""),
                "sha256": rows[0].get("source_sha256", ""),
            },
        }
    return payloads


def build_crosswalk(payments: Iterable[dict[str, str]]) -> list[dict[str, object]]:
    keys = sorted({payment_key(row) for row in payments})
    rows = []
    for ministry, payment_category, payment_detail in keys:
        source = {
            "ministry": ministry,
            "payment_category": payment_category,
            "payment_detail": payment_detail,
        }
        category_id = classify_payment(source)
        rows.append({
            **source,
            "category_id": category_id,
            "category_label": CATEGORY_LABELS[category_id],
            "mapping_rationale": CATEGORY_RATIONALES[category_id],
            "effective_period": FISCAL_YEAR,
            "mapping_status": "residual" if category_id == RESIDUAL_CATEGORY else "explicit",
        })
    return rows


def build_sample_fixture(payments: Iterable[dict[str, str]], *, seed: int) -> dict[str, object]:
    positive = [
        row for row in payments
        if row.get("ministry") in {"Ministry Of Health", "Ministry Of Long-Term Care"}
        and Decimal(row["amount_cad"]) > 0
    ]
    sample_count = math.ceil(len(positive) * Decimal("0.25"))
    sample = random.Random(seed).sample(positive, sample_count)
    return {
        "seed": seed,
        "population_row_count": len(positive),
        "sample_row_count": len(sample),
        "sample_amount_cad": money(sum((Decimal(row["amount_cad"]) for row in sample), Decimal("0"))),
        "represented_source_route_count": len({payment_key(row) for row in sample}),
        "total_source_route_count": len({payment_key(row) for row in positive}),
    }
