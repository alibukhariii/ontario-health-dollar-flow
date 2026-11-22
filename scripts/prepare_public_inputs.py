#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

import flow_v2_data


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    fields = sorted({key for row in rows for key in row})
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def public_payment_inputs(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    output = [dict(row) for row in rows if row.get("recipient_class") != "person_or_employee"]
    grouped: dict[tuple[str, ...], Decimal] = defaultdict(Decimal)
    exemplars: dict[tuple[str, ...], dict[str, str]] = {}
    for row in rows:
        if row.get("recipient_class") != "person_or_employee":
            continue
        key = (
            row["source_version_id"], row["fiscal_year"], row["ministry"], row["payment_category"],
            row["payment_detail"], row.get("service_category", ""), row.get("route_id", ""),
        )
        grouped[key] += Decimal(row["amount_cad"])
        exemplars[key] = row
    for key, amount in grouped.items():
        exemplar = dict(exemplars[key])
        identifier = hashlib.sha256("\x1f".join(key).encode("utf-8")).hexdigest()[:16]
        exemplar.update({
            "payment_line_id": f"public_person_aggregate_{identifier}",
            "payment_label_id": f"public_person_aggregate_{identifier}",
            "recipient_label_raw": "Personal payments aggregated",
            "recipient_class": "program_aggregate",
            "source_amount": str(amount),
            "amount_cad": str(amount),
            "terminal_state": "not_itemized_by_recipient",
            "review_status": "public_privacy_aggregate",
        })
        output.append(exemplar)
    return output


def selected(rows: list[dict[str, str]], fields: set[str], predicate=lambda row: True) -> list[dict[str, str]]:
    return [{key: value for key, value in row.items() if key in fields} for row in rows if predicate(row)]


def prepare(evidence_root: Path, output_root: Path) -> dict[str, object]:
    if output_root.exists():
        shutil.rmtree(output_root)
    output_root.mkdir(parents=True)
    raw_payments = read_csv(evidence_root / "payment-lines.csv")
    payments = public_payment_inputs(raw_payments)
    links = selected(
        read_csv(evidence_root / "financial-extraction" / "entity-links-reviewed.csv"),
        {"entity_link_id", "payment_label_id", "recipient_label_raw", "entity_id", "authoritative_name", "entity_level", "relationship_type", "effective_start", "effective_end", "source_id", "confidence", "review_status"},
    )
    observations = selected(
        read_csv(evidence_root / "financial-extraction" / "financial-observations.csv"),
        {
            "observation_id", "entity_id", "reporting_entity", "reporting_scope", "snapshot_id", "source_sha256",
            "statement_name", "source_label", "source_text", "source_numeric_value", "currency", "published_scale",
            "normalized_amount_cad", "display_precision", "sign_convention", "token_status", "measurement_status",
            "period_start", "period_end", "period_label", "pdf_page", "printed_page_label", "financial_statement_class",
            "revenue_expense_nature", "system_role", "presentation_basis", "mapping_relation", "comparison_allowed",
            "amount_type", "row_role", "parent_observation_id", "exclusive_rollup_set_id", "aggregation_eligible",
            "publication_status",
        },
        lambda row: row.get("publication_status", "").startswith("approved"),
    )
    snapshot_rows = read_csv(evidence_root / "financial-extraction" / "source-snapshots.csv")
    context_path = evidence_root / "financial-extraction" / "context-source-snapshots.csv"
    if context_path.exists():
        for row in read_csv(context_path):
            normalized = dict(row)
            normalized.setdefault("entity_id", "entity_ontario_health" if row.get("source_id", "").startswith("oh-") else "")
            normalized.setdefault("reporting_entity", "Ontario Health" if row.get("source_id", "").startswith("oh-") else row.get("title", ""))
            normalized.setdefault("source_family", "context_financial_statement")
            snapshot_rows.append(normalized)
    snapshots = selected(
        snapshot_rows,
        {"snapshot_id", "entity_id", "reporting_entity", "source_family", "original_url", "final_url", "retrieved_at", "sha256", "bytes", "detected_format", "page_count", "status", "publication_eligibility", "limitation"},
    )
    intermediary = selected(
        read_csv(evidence_root / "financial-extraction" / "intermediary-outflows.csv"),
        {"intermediary_id", "intermediary_label", "published_label_match", "fiscal_year", "group_id", "group_label", "group_order", "source_label", "amount_cad", "target_intermediary_id", "source_url", "source_page", "source_sha256"},
    )
    tables = {
        "payment-lines.csv": payments,
        "entity-links-reviewed.csv": links,
        "financial-observations.csv": observations,
        "source-snapshots.csv": snapshots,
        "intermediary-outflows.csv": intermediary,
    }
    for filename, rows in tables.items():
        write_csv(output_root / filename, rows)
    sample_fixture_path = output_root / "taxonomy-sample-fixture.json"
    sample_fixture_path.write_text(
        json.dumps(flow_v2_data.build_sample_fixture(raw_payments, seed=20261121), indent=2) + "\n",
        encoding="utf-8",
    )
    manifest = {
        "schema_version": "1.0.0",
        "privacy": "Personal labels are replaced by non-identifying program aggregates.",
        "files": [{
            "filename": filename,
            "rows": len(rows),
            "sha256": hashlib.sha256((output_root / filename).read_bytes()).hexdigest(),
        } for filename, rows in tables.items()] + [{
            "filename": sample_fixture_path.name,
            "rows": None,
            "sha256": hashlib.sha256(sample_fixture_path.read_bytes()).hexdigest(),
        }],
    }
    (output_root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    site_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-root", type=Path, default=site_root.parents[1] / "evidence" / "ontario-health-dollar-map")
    parser.add_argument("--output", type=Path, default=site_root / "data" / "input")
    args = parser.parse_args()
    print(json.dumps(prepare(args.evidence_root.resolve(), args.output.resolve()), indent=2))


if __name__ == "__main__":
    main()
