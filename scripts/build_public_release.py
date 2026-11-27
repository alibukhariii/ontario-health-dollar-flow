#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import zipfile
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Iterable

import flow_v2_data


PUBLIC_PAYMENT_FIELDS = (
    "payment_line_id", "payment_label_id", "source_version_id", "fiscal_year", "ministry",
    "payment_category", "payment_detail", "published_payee", "payee_type", "amount_cad",
    "category_id", "category_label", "source_url",
)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def sanitize_payment_rows(rows: Iterable[dict[str, str]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    named: list[dict[str, str]] = []
    grouped: dict[tuple[str, ...], Decimal] = defaultdict(Decimal)
    for row in rows:
        amount = Decimal(row["amount_cad"])
        if amount < 0:
            continue
        category_id = flow_v2_data.classify_payment(row)
        if row.get("recipient_class") in {"person_or_employee", "program_aggregate"}:
            key = (
                row.get("source_version_id", ""), row.get("fiscal_year", ""), row.get("ministry", ""),
                row.get("payment_category", ""), row.get("payment_detail", ""), category_id,
            )
            grouped[key] += amount
            continue
        named.append({
            "payment_line_id": row.get("payment_line_id", ""),
            "payment_label_id": row.get("payment_label_id", ""),
            "source_version_id": row.get("source_version_id", ""),
            "fiscal_year": row.get("fiscal_year", ""),
            "ministry": row.get("ministry", ""),
            "payment_category": row.get("payment_category", ""),
            "payment_detail": row.get("payment_detail", ""),
            "published_payee": row.get("recipient_label_raw", ""),
            "payee_type": row.get("recipient_class", "").replace("_", " "),
            "amount_cad": str(amount),
            "category_id": category_id,
            "category_label": flow_v2_data.CATEGORY_LABELS[category_id],
            "source_url": flow_v2_data.PAYMENTS_SOURCE_URL,
        })
    non_itemized = [{
        "source_version_id": key[0], "fiscal_year": key[1], "ministry": key[2],
        "payment_category": key[3], "payment_detail": key[4], "category_id": key[5],
        "category_label": flow_v2_data.CATEGORY_LABELS[key[5]], "amount_cad": str(amount),
        "evidence_stop": "Not itemized by recipient", "source_url": flow_v2_data.PAYMENTS_SOURCE_URL,
    } for key, amount in sorted(grouped.items())]
    return named, non_itemized


def write_csv(path: Path, rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = sorted({key for row in rows for key in row})
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def _public_financial_observations(rows: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    allowed = {
        "observation_id", "entity_id", "reporting_entity", "reporting_scope", "snapshot_id",
        "source_sha256", "statement_name", "source_label", "source_text", "currency",
        "published_scale", "normalized_amount_cad", "token_status", "measurement_status",
        "period_start", "period_end", "period_label", "pdf_page", "printed_page_label",
        "financial_statement_class", "revenue_expense_nature", "system_role", "presentation_basis",
        "mapping_relation", "amount_type", "row_role", "parent_observation_id",
        "exclusive_rollup_set_id", "aggregation_eligible", "publication_status",
    }
    return [
        {key: value for key, value in row.items() if key in allowed}
        for row in rows
        if row.get("publication_status", "").startswith("approved")
    ]


def _source_rows(rows: Iterable[dict[str, str]]) -> list[dict[str, str]]:
    allowed = {
        "snapshot_id", "entity_id", "reporting_entity", "source_family", "original_url", "final_url",
        "retrieved_at", "sha256", "bytes", "detected_format", "page_count", "status",
        "publication_eligibility", "limitation",
    }
    return [{key: value for key, value in row.items() if key in allowed} for row in rows]


def build_public_tables(site_root: Path, workspace_root: Path) -> tuple[str, dict[str, list[dict[str, object]]]]:
    evidence = workspace_root / "evidence" / "ontario-health-dollar-map"
    local_inputs = site_root / "data" / "input"
    use_public_inputs = (local_inputs / "manifest.json").exists()
    input_root = local_inputs if use_public_inputs else evidence
    extraction_root = local_inputs if use_public_inputs else evidence / "financial-extraction"
    required = (
        input_root / "payment-lines.csv",
        extraction_root / "financial-observations.csv",
        extraction_root / "source-snapshots.csv",
        extraction_root / "intermediary-outflows.csv",
    )
    missing = [path for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError(f"Missing public build inputs: {', '.join(str(path) for path in missing)}")
    pointer = read_json(site_root / "dist" / "data" / "current.json")
    release_path = site_root / "dist" / pointer["flow_v2"]["overview_path"]
    release_root = release_path.parent
    overview = read_json(release_path)
    convergence = read_json(release_root / "convergence-index.json")
    payments = read_csv(input_root / "payment-lines.csv")
    named, non_itemized = sanitize_payment_rows(payments)

    categories = [{
        "category_id": row["category_id"], "category_label": row["label"],
        "amount_cad": row["amount_cad"], "share_percent": row["share_percent"],
        "fiscal_year": overview["fiscal_year"],
    } for row in overview["categories"]]
    programs: list[dict[str, object]] = []
    non_itemized_source_rows: list[dict[str, object]] = []
    adjustment_source_rows: list[dict[str, object]] = []
    for category in overview["categories"]:
        payload = read_json(release_root / category["path"])
        for row in payload["programs"]:
            programs.append({
                "program_id": row["program_id"], "category_id": category["category_id"],
                "program_label": row["label"], "ministry": row["ministry"],
                "payment_category": row["payment_category"], "amount_cad": row["positive_amount_cad"],
                "program_label_status": row.get("label_status", "Source label"),
                "source_payment_detail": row.get("source_payment_detail", ""),
                "fiscal_year": overview["fiscal_year"], "source_url": flow_v2_data.PAYMENTS_SOURCE_URL,
            })
            aggregate_route_id = flow_v2_data.stable_id(
                "aggregate_route", str(overview["fiscal_year"]),
                flow_v2_data.program_key(str(row["ministry"]), str(category["category_id"]), str(row["label"])),
            )
            for source_row in row.get("not_itemized_source_rows", []):
                non_itemized_source_rows.append({
                    "route_id": aggregate_route_id,
                    "displayed_program_label": row["label"],
                    "program_label_status": row.get("label_status", "Source label"),
                    "category_id": category["category_id"],
                    "category_label": category["label"],
                    **source_row,
                })
            for source_row in row.get("adjustment_source_rows", []):
                adjustment_source_rows.append({
                    "route_id": flow_v2_data.stable_id("signed_adjustment", str(overview["fiscal_year"]), str(row["program_id"])),
                    "displayed_program_label": row["label"],
                    "program_label_status": row.get("label_status", "Source label"),
                    "category_id": category["category_id"],
                    "category_label": category["label"],
                    **source_row,
                })

    payees = [{
        key: row.get(key, "") for key in (
            "payment_label_id", "display_label", "payee_type", "identity_status", "entity_id",
            "published_payment_total_cad", "global_rank", "category_count", "program_count",
            "ministry_count", "has_profile",
        )
    } for row in convergence["payees"]]
    aliases: list[dict[str, object]] = []
    routes: list[dict[str, object]] = []
    evidence_stops: list[dict[str, object]] = []
    for index_row in convergence["payees"]:
        payload = read_json(release_root / index_row["path"])
        for label in payload.get("published_labels", [payload["published_label"]]):
            aliases.append({
                "payee_id": payload["payment_label_id"], "published_label": label,
                "identity_status": payload["identity_status"], "fiscal_year": payload["fiscal_year"],
            })
        for route in payload.get("incoming_routes", []):
            routes.append({
                "payee_id": payload["payment_label_id"], "published_payee": payload["published_label"],
                "payee_type": payload.get("payee_type", "published payee"),
                "identity_evidence": payload.get("identity_evidence") or ([payload["identity"]] if payload.get("identity") else []),
                **route,
            })
        for stop in payload.get("evidence_stops", []):
            evidence_stops.append({
                "payee_id": payload["payment_label_id"], "published_payee": payload["published_label"], **stop,
            })

    contributions: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    for row in routes:
        contributions[(str(row["payee_id"]), str(row["category_id"]))] += Decimal(str(row["amount_cad"]))
    category_contributions = [{
        "payee_id": key[0], "category_id": key[1], "amount_cad": str(amount),
    } for key, amount in sorted(contributions.items())]

    taxonomy = read_json(release_root / "taxonomy-crosswalk.json")["mappings"]
    financial = _public_financial_observations(read_csv(extraction_root / "financial-observations.csv"))
    sources = _source_rows(read_csv(extraction_root / "source-snapshots.csv"))
    intermediary = read_csv(extraction_root / "intermediary-outflows.csv")
    public_intermediary = [{key: value for key, value in row.items() if key not in {"local_path"}} for row in intermediary]
    tables: dict[str, list[dict[str, object]]] = {
        "payments_named": named,
        "payments_non_itemized": non_itemized,
        "categories": categories,
        "programs": programs,
        "payees": payees,
        "payee_aliases": aliases,
        "recipient_routes": routes,
        "non_itemized_source_rows": non_itemized_source_rows,
        "signed_adjustment_source_rows": adjustment_source_rows,
        "recipient_category_contributions": category_contributions,
        "financial_observations": financial,
        "sources": sources,
        "taxonomy_crosswalk": taxonomy,
        "evidence_stops": evidence_stops,
        "intermediary_outflows": public_intermediary,
    }
    return str(overview["fiscal_year"]), tables


def validate_public_tables(tables: dict[str, list[dict[str, object]]]) -> None:
    serialized = json.dumps(tables, ensure_ascii=False)
    forbidden = ("/Users/", "data/raw/", "person_or_employee", "candidate_id", "reviewer")
    found = [value for value in forbidden if value in serialized]
    if found:
        raise ValueError(f"Public release contains forbidden material: {found}")
    named = sum((Decimal(str(row["amount_cad"])) for row in tables["payments_named"]), Decimal("0"))
    non_itemized = sum((Decimal(str(row["amount_cad"])) for row in tables["payments_non_itemized"]), Decimal("0"))
    if named + non_itemized != Decimal("97433981876"):
        raise ValueError("Public payment exports do not reconcile to $97,433,981,876")


def build_release(site_root: Path, workspace_root: Path, output_root: Path) -> dict[str, object]:
    fiscal_year, tables = build_public_tables(site_root, workspace_root)
    validate_public_tables(tables)
    csv_root = output_root / f"ontario-health-dollar-flow-{fiscal_year}-csv"
    if output_root.exists():
        shutil.rmtree(output_root)
    csv_root.mkdir(parents=True)
    for name, rows in tables.items():
        write_csv(csv_root / f"{name}.csv", rows)

    try:
        import duckdb
    except ModuleNotFoundError as error:
        raise RuntimeError("DuckDB is required to build the public database asset") from error
    database = output_root / f"ontario-health-dollar-flow-{fiscal_year}.duckdb"
    connection = duckdb.connect(str(database))
    try:
        for name in tables:
            csv_path = (csv_root / f"{name}.csv").as_posix().replace("'", "''")
            connection.execute(f"CREATE TABLE {name} AS SELECT * FROM read_csv_auto('{csv_path}', HEADER=true, ALL_VARCHAR=true)")
        connection.execute("CREATE TABLE release_metadata AS SELECT ? AS fiscal_year, ? AS question", [
            fiscal_year,
            "Which organizations received Ontario's health dollars, how much did they receive, and what were the payments for?",
        ])
        connection.execute("CHECKPOINT")
    finally:
        connection.close()

    archive = output_root / f"ontario-health-dollar-flow-{fiscal_year}-csv.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for path in sorted(csv_root.glob("*.csv")):
            bundle.write(path, arcname=path.name)
    artifacts = [database, archive]
    manifest = {
        "fiscal_year": fiscal_year,
        "artifacts": [{
            "filename": path.name, "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        } for path in artifacts],
        "tables": {name: len(rows) for name, rows in tables.items()},
    }
    (output_root / "SHA256SUMS.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    site_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-root", type=Path, default=site_root.parents[1])
    parser.add_argument("--output", type=Path, default=site_root / "release-assets" / "2025-26")
    args = parser.parse_args()
    manifest = build_release(site_root, args.workspace_root.resolve(), args.output.resolve())
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
