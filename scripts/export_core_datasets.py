#!/usr/bin/env python3
"""Build the three analysis-ready datasets published with this project."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import build_public_release


ROUTE_FIELDS = (
    "fiscal_year", "route_id", "payee_id", "display_label", "published_payee",
    "payee_type", "identity_status", "entity_id", "global_rank",
    "recipient_total_cad", "ministry", "category_id", "category_label",
    "program_label", "route_amount_cad", "route_share_of_recipient_percent",
    "program_label_status", "source_payment_detail", "source_row_count", "source_row_numbers",
    "source_id", "source_url", "source_limitation",
)

LINEAGE_FIELDS = (
    "route_id", "payee_id", "canonical_payee", "published_payee", "identity_status", "identity_match_source_ids",
    "identity_match_relationships", "identity_match_review_status", "entity_id", "recipient_class",
    "payment_line_id", "source_row_number", "source_version_id", "fiscal_year", "ministry",
    "source_payment_category", "source_payment_detail", "category_id", "category_label",
    "displayed_program_label", "program_label_status", "amount_cad", "source_url",
)

ORGANIZATION_FIELDS = (
    "fiscal_year", "payee_id", "display_label", "published_label", "payee_type",
    "identity_status", "entity_id", "published_payment_total_cad", "global_rank",
    "ministry_count", "category_count", "program_count", "has_financial_profile",
)

FINANCIAL_FIELDS = (
    "observation_id", "entity_id", "reporting_entity", "reporting_scope", "system_role",
    "period_start", "period_end", "period_label", "measurement_status", "statement_name",
    "financial_statement_class", "revenue_expense_nature", "presentation_basis",
    "source_label", "source_text", "normalized_amount_cad", "currency", "published_scale",
    "amount_type", "mapping_relation", "row_role", "parent_observation_id",
    "exclusive_rollup_set_id", "aggregation_eligible", "token_status", "pdf_page",
    "printed_page_label", "snapshot_id", "source_url", "source_sha256",
    "source_retrieved_at", "source_limitation", "source_publication_eligibility",
    "publication_status",
)


def write_csv(path: Path, fields: tuple[str, ...], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def _route_rows(tables: dict[str, list[dict[str, object]]], fiscal_year: str) -> list[dict[str, object]]:
    payees = {str(row["payment_label_id"]): row for row in tables["payees"]}
    rows: list[dict[str, object]] = []
    for route in tables["recipient_routes"]:
        payee = payees[str(route["payee_id"])]
        amount = Decimal(str(route["amount_cad"]))
        total = Decimal(str(payee["published_payment_total_cad"]))
        share = (amount / total * 100).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        source = route.get("source", {})
        source_rows = route.get("source_rows", [])
        rows.append({
            "fiscal_year": fiscal_year,
            "route_id": route["route_id"],
            "payee_id": route["payee_id"],
            "display_label": payee["display_label"],
            "published_payee": route["published_payee"],
            "payee_type": payee["payee_type"],
            "identity_status": payee["identity_status"],
            "entity_id": payee["entity_id"],
            "global_rank": payee["global_rank"],
            "recipient_total_cad": payee["published_payment_total_cad"],
            "ministry": route["ministry"],
            "category_id": route["category_id"],
            "category_label": route["category_label"],
            "program_label": route["program_label"],
            "program_label_status": route.get("program_label_status", "Source label"),
            "source_payment_detail": route.get("source_payment_detail", ""),
            "source_row_count": len(source_rows),
            "source_row_numbers": ";".join(str(row.get("source_row_number", "")) for row in source_rows),
            "route_amount_cad": route["amount_cad"],
            "route_share_of_recipient_percent": str(share),
            "source_id": source.get("source_id", "pa-payments-2025-26-r3ab37bb7"),
            "source_url": source.get("url", build_public_release.flow_v2_data.PAYMENTS_SOURCE_URL),
            "source_limitation": source.get(
                "limitation",
                "Published payment record; it does not by itself identify the recipient's ultimate use of the funds.",
            ),
        })
    return sorted(rows, key=lambda row: (
        int(row["global_rank"]), str(row["category_id"]), str(row["program_label"]),
        -Decimal(str(row["route_amount_cad"])), str(row["route_id"]),
    ))


def _lineage_rows(tables: dict[str, list[dict[str, object]]]) -> list[dict[str, object]]:
    payees = {str(row["payment_label_id"]): row for row in tables["payees"]}
    rows: list[dict[str, object]] = []
    for route in tables["recipient_routes"]:
        payee = payees[str(route["payee_id"])]
        identity_evidence = route.get("identity_evidence", [])
        for source_row in route.get("source_rows", []):
            rows.append({
                "route_id": route["route_id"],
                "payee_id": route["payee_id"],
                "canonical_payee": payee.get("display_label", ""),
                "published_payee": source_row.get("source_payee_label", route.get("published_payee", "")),
                "identity_status": payee.get("identity_status", ""),
                "identity_match_source_ids": ";".join(str(item.get("source_id", "")) for item in identity_evidence if item.get("source_id")),
                "identity_match_relationships": ";".join(str(item.get("relationship_type", "")) for item in identity_evidence if item.get("relationship_type")),
                "identity_match_review_status": ";".join(str(item.get("review_status", "")) for item in identity_evidence if item.get("review_status")),
                "entity_id": payee.get("entity_id", ""),
                "recipient_class": source_row.get("recipient_class", ""),
                "payment_line_id": source_row.get("payment_line_id", ""),
                "source_row_number": source_row.get("source_row_number", ""),
                "source_version_id": source_row.get("source_version_id", ""),
                "fiscal_year": source_row.get("fiscal_year", ""),
                "ministry": source_row.get("ministry", route.get("ministry", "")),
                "source_payment_category": source_row.get("source_payment_category", ""),
                "source_payment_detail": source_row.get("source_payment_detail", ""),
                "category_id": route.get("category_id", ""),
                "category_label": route.get("category_label", ""),
                "displayed_program_label": route.get("program_label", ""),
                "program_label_status": route.get("program_label_status", "Source label"),
                "amount_cad": source_row.get("amount_cad", ""),
                "source_url": source_row.get("source_url", route.get("source", {}).get("url", "")),
            })
    for table_name, state in (("non_itemized_source_rows", "not_itemized"), ("signed_adjustment_source_rows", "signed_adjustment")):
        for source_row in tables.get(table_name, []):
            rows.append({
                "route_id": source_row.get("route_id", ""),
                "payee_id": "",
                "canonical_payee": "",
                "published_payee": source_row.get("source_payee_label", ""),
                "identity_status": state,
                "entity_id": "",
                "recipient_class": source_row.get("recipient_class", ""),
                "payment_line_id": source_row.get("payment_line_id", ""),
                "source_row_number": source_row.get("source_row_number", ""),
                "source_version_id": source_row.get("source_version_id", ""),
                "fiscal_year": source_row.get("fiscal_year", ""),
                "ministry": source_row.get("ministry", ""),
                "source_payment_category": source_row.get("source_payment_category", ""),
                "source_payment_detail": source_row.get("source_payment_detail", ""),
                "category_id": source_row.get("category_id", ""),
                "category_label": source_row.get("category_label", ""),
                "displayed_program_label": source_row.get("displayed_program_label", ""),
                "program_label_status": source_row.get("program_label_status", "Source label"),
                "amount_cad": source_row.get("amount_cad", ""),
                "source_url": source_row.get("source_url", build_public_release.flow_v2_data.PAYMENTS_SOURCE_URL),
            })
    return sorted(rows, key=lambda row: (
        int(row.get("source_row_number") or 0), str(row.get("published_payee", "")), str(row.get("route_id", "")),
    ))


def _organization_rows(tables: dict[str, list[dict[str, object]]]) -> list[dict[str, object]]:
    payees = {str(row["payment_label_id"]): row for row in tables["payees"]}
    rows: list[dict[str, object]] = []
    for alias in tables["payee_aliases"]:
        payee = payees[str(alias["payee_id"])]
        rows.append({
            "fiscal_year": alias["fiscal_year"],
            "payee_id": alias["payee_id"],
            "display_label": payee["display_label"],
            "published_label": alias["published_label"],
            "payee_type": payee["payee_type"],
            "identity_status": payee["identity_status"],
            "entity_id": payee["entity_id"],
            "published_payment_total_cad": payee["published_payment_total_cad"],
            "global_rank": payee["global_rank"],
            "ministry_count": payee["ministry_count"],
            "category_count": payee["category_count"],
            "program_count": payee["program_count"],
            "has_financial_profile": str(bool(payee["has_profile"])).lower(),
        })
    return sorted(rows, key=lambda row: (int(row["global_rank"]), str(row["published_label"])))


def _financial_rows(tables: dict[str, list[dict[str, object]]]) -> list[dict[str, object]]:
    sources = {str(row["snapshot_id"]): row for row in tables["sources"]}
    rows: list[dict[str, object]] = []
    for observation in tables["financial_observations"]:
        source = sources[str(observation["snapshot_id"])]
        rows.append({
            **observation,
            "source_url": source.get("final_url") or source.get("original_url", ""),
            "source_retrieved_at": source.get("retrieved_at", ""),
            "source_limitation": source.get("limitation", ""),
            "source_publication_eligibility": source.get("publication_eligibility", ""),
        })
    return sorted(rows, key=lambda row: (
        str(row["reporting_entity"]), str(row["period_end"]), str(row["statement_name"]),
        str(row["pdf_page"]), str(row["observation_id"]),
    ))


def export_core_datasets(site_root: Path, output_root: Path) -> dict[str, object]:
    site_root = site_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    fiscal_year, tables = build_public_release.build_public_tables(site_root, site_root.parents[1])
    build_public_release.validate_public_tables(tables)

    datasets = {
        "recipient-funding-routes.csv": (ROUTE_FIELDS, _route_rows(tables, fiscal_year)),
        "route-to-source-lineage.csv": (LINEAGE_FIELDS, _lineage_rows(tables)),
        "organization-alias-index.csv": (ORGANIZATION_FIELDS, _organization_rows(tables)),
        "harmonized-financial-statements.csv": (FINANCIAL_FIELDS, _financial_rows(tables)),
    }
    for filename, (fields, rows) in datasets.items():
        write_csv(output_root / filename, fields, rows)

    manifest: dict[str, object] = {
        "schema_version": "1.0.0",
        "fiscal_year": fiscal_year,
        "source_release": "Ontario Public Accounts 2025-26 and linked recipient statements",
        "datasets": {},
    }
    for filename, (_, rows) in datasets.items():
        payload = (output_root / filename).read_bytes()
        manifest["datasets"][filename] = {
            "rows": len(rows),
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    site_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=site_root / "data" / "derived")
    args = parser.parse_args()
    manifest = export_core_datasets(site_root, args.output.resolve())
    json.dump(manifest, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
