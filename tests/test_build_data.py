import sys
import tempfile
import unittest
import gzip
import json
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

try:
    import build_data
except ModuleNotFoundError:
    build_data = None


class BuildDataTests(unittest.TestCase):
    def test_financial_profile_includes_direct_statement_source_and_period(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        observations = [{
            "entity_id": "hospital-1", "reporting_entity": "Example Hospital",
            "reporting_scope": "hospital corporation", "period_label": "2025-26",
            "publication_status": "approved_automated_review", "financial_statement_class": "revenue",
            "row_role": "total", "normalized_amount_cad": "100", "source_label": "Revenue",
            "snapshot_id": "snapshot-1", "source_sha256": "abc", "presentation_basis": "nature",
        }]
        snapshots = [{
            "snapshot_id": "snapshot-1", "original_url": "https://example.test/statement.pdf",
            "final_url": "https://example.test/statement.pdf", "reporting_entity": "Example Hospital",
            "publication_eligibility": "derived_values_and_citation_only",
        }]

        result = build_data.build_profiles(
            fiscal_year="2025-26", observations=observations, reviewed_links=[], payments=[],
            source_snapshots=snapshots,
        )

        profile = result["profiles"][0]
        self.assertEqual(profile["source"]["url"], "https://example.test/statement.pdf")
        self.assertEqual(profile["source"]["period"], "2025-26")
        self.assertEqual(profile["source"]["publication_eligibility"], "derived_values_and_citation_only")

    def test_flow_overview_uses_fourteen_exclusive_buckets_and_capital_override(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        payments = [
            {
                "payment_line_id": "line-1", "payment_label_id": "hospital-1",
                "recipient_label_raw": "Example Hospital", "recipient_class": "hospital_corporation",
                "amount_cad": "80", "ministry": "Ministry Of Health", "service_category": "hospitals",
                "payment_category": "Transfer Payments", "payment_detail": "Operation Of Hospitals",
                "route_id": "route-operating",
            },
            {
                "payment_line_id": "line-2", "payment_label_id": "hospital-1",
                "recipient_label_raw": "Example Hospital", "recipient_class": "hospital_corporation",
                "amount_cad": "20", "ministry": "Ministry Of Health", "service_category": "hospitals",
                "payment_category": "Transfer Payments", "payment_detail": "Health Infrastructure Renewal Fund",
                "route_id": "route-capital",
            },
        ]
        routes = [
            {"route_id": "route-operating", "operating_targeted_or_capital": "operating_or_mixed"},
            {"route_id": "route-capital", "operating_targeted_or_capital": "capital"},
        ]

        result = build_data.build_flow_overview("2025-26", payments, routes)

        amounts = {row["bucket_id"]: Decimal(row["amount_cad"]) for row in result["buckets"]}
        self.assertEqual(len(result["buckets"]), 14)
        self.assertEqual(result["net_published_payments_cad"], "100.00")
        self.assertEqual(amounts["hospitals"], Decimal("80.00"))
        self.assertEqual(amounts["capital"], Decimal("20.00"))
        self.assertEqual(sum(amounts.values()), Decimal("100.00"))

    def test_bucket_payload_withholds_people_and_preserves_program_aggregate_stop(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        payments = [
            {
                "payment_line_id": "line-1", "payment_label_id": "provider-1",
                "recipient_label_raw": "Provider One", "recipient_class": "hospital_corporation",
                "amount_cad": "70", "ministry": "Ministry Of Health", "service_category": "hospitals",
                "payment_category": "Transfer Payments", "payment_detail": "Operation Of Hospitals",
                "route_id": "route-operating",
            },
            {
                "payment_line_id": "line-2", "payment_label_id": "aggregate-1",
                "recipient_label_raw": "Accounts Under Threshold", "recipient_class": "program_aggregate",
                "amount_cad": "20", "ministry": "Ministry Of Health", "service_category": "hospitals",
                "payment_category": "Transfer Payments", "payment_detail": "Operation Of Hospitals",
                "route_id": "route-operating",
            },
            {
                "payment_line_id": "line-3", "payment_label_id": "person-1",
                "recipient_label_raw": "Person, Private", "recipient_class": "person_or_employee",
                "amount_cad": "10", "ministry": "Ministry Of Health", "service_category": "hospitals",
                "payment_category": "Transfer Payments", "payment_detail": "Operation Of Hospitals",
                "route_id": "route-operating",
            },
        ]
        routes = [{"route_id": "route-operating", "operating_targeted_or_capital": "operating_or_mixed"}]

        result = build_data.build_bucket_payload(
            fiscal_year="2025-26", bucket_id="hospitals", payments=payments, routes=routes,
            reviewed_links=[], profiles={"profiles": []}, athome_observations=[], municipal_observations=[],
        )

        program = result["programs"][0]
        self.assertEqual(program["amount_cad"], "100.00")
        self.assertEqual([row["recipient_label"] for row in program["recipients"]], ["Provider One"])
        self.assertEqual(program["aggregate_destination_cad"], "20.00")
        self.assertEqual(program["withheld_person_cad"], "10.00")
        self.assertNotIn("Person, Private", json.dumps(result))

    def test_home_care_special_case_keeps_oh_and_athome_amounts_as_separate_segments(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        payments = [{
            "payment_line_id": "line-oh", "payment_label_id": "oh-label",
            "recipient_label_raw": "Ontario Health", "recipient_class": "intermediary",
            "amount_cad": "4684589899", "ministry": "Ministry Of Health",
            "service_category": "home_and_community_care", "payment_category": "Transfer Payments",
            "payment_detail": "Home Care", "route_id": "route-home",
        }]
        routes = [{"route_id": "route-home", "operating_targeted_or_capital": "operating_or_mixed"}]
        athome = [
            {
                "fiscal_year": "2025-26", "amount_role": "funding_received_or_recovered",
                "counterparty": "Ontario Health", "parent_observation_id": "total",
                "observation_id": "base", "amount_cad": "4822342000",
                "source_id": "athome-statements", "funding_status": "base",
            },
        ]

        result = build_data.build_bucket_payload(
            fiscal_year="2025-26", bucket_id="home_and_community_care", payments=payments,
            routes=routes, reviewed_links=[], profiles={"profiles": []},
            athome_observations=athome, municipal_observations=[],
        )

        special = next(row for row in result["special_routes"] if row["route_type"] == "ontario_health_athome")
        self.assertEqual(special["ministry_to_intermediary_cad"], "4684589899.00")
        self.assertEqual(special["intermediary_to_athome_cad"], "4822342000.00")
        self.assertEqual(special["downstream_amount_status"], "no_published_amount")
        self.assertFalse(special["segments_reconciled"])

    def test_program_keeps_positive_destinations_separate_from_signed_adjustment(self):
        payments = [
            {
                "payment_line_id": "positive", "payment_label_id": "pharmacy",
                "recipient_label_raw": "Ontario Government Pharmacy", "recipient_class": "government_entity",
                "amount_cad": "500", "ministry": "Ministry Of Health", "service_category": "administration",
                "payment_category": "Statutory Payments", "payment_detail": "Ontario Government Pharmacy",
                "route_id": "route-pharmacy",
            },
            {
                "payment_line_id": "recovery", "payment_label_id": "recovery",
                "recipient_label_raw": "Less: Distribution And Sales", "recipient_class": "program_aggregate",
                "amount_cad": "-400", "ministry": "Ministry Of Health", "service_category": "non_transfer_accounting_line",
                "payment_category": "Statutory Payments", "payment_detail": "Ontario Government Pharmacy",
                "route_id": "route-pharmacy",
            },
        ]
        routes = [{"route_id": "route-pharmacy", "operating_targeted_or_capital": "operating_or_mixed"}]

        result = build_data.build_bucket_payload(
            fiscal_year="2025-26", bucket_id="system_operations_and_other", payments=payments,
            routes=routes, reviewed_links=[], profiles={"profiles": []},
            athome_observations=[], municipal_observations=[],
        )

        program = result["programs"][0]
        self.assertEqual(program["amount_cad"], "100.00")
        self.assertEqual(program["positive_destination_cad"], "500.00")
        self.assertEqual(program["signed_adjustment_cad"], "-400.00")

    def test_recipient_routes_preserve_both_ministries_and_parallel_institutional_context(self):
        payments = [
            {
                "payment_line_id": "public-health", "payment_label_id": "city",
                "recipient_label_raw": "City Of Toronto", "recipient_class": "vendor",
                "amount_cad": "156512601", "ministry": "Ministry Of Health",
                "service_category": "public_health", "payment_category": "Transfer Payments",
                "payment_detail": "Official Local Health Agencies", "route_id": "route-ph",
            },
            {
                "payment_line_id": "ltc", "payment_label_id": "city",
                "recipient_label_raw": "City Of Toronto", "recipient_class": "vendor",
                "amount_cad": "265503669", "ministry": "Ministry Of Long-Term Care",
                "service_category": "long_term_care", "payment_category": "Transfer Payments",
                "payment_detail": "Transfer Payments", "route_id": "route-ltc",
            },
            {
                "payment_line_id": "hospital", "payment_label_id": "hospital",
                "recipient_label_raw": "Example Hospital", "recipient_class": "hospital_corporation",
                "amount_cad": "80", "ministry": "Ministry Of Health",
                "service_category": "hospitals", "payment_category": "Transfer Payments",
                "payment_detail": "Operation Of Hospitals", "route_id": "route-hospital",
            },
        ]
        routes = [
            {"route_id": "route-ph", "operating_targeted_or_capital": "operating_or_mixed"},
            {"route_id": "route-ltc", "operating_targeted_or_capital": "operating_or_mixed"},
            {"route_id": "route-hospital", "operating_targeted_or_capital": "operating_or_mixed"},
        ]

        _, payloads = build_data.build_recipient_payloads(
            fiscal_year="2025-26", payments=payments, routes=routes,
            reviewed_links=[], profiles={"profiles": []},
        )

        city = payloads["city"]
        self.assertEqual(
            {(row["route_id"], row["ministry"], row["bucket_id"], row["amount_status"], row["amount_cad"]) for row in city["incoming_routes"]},
            {
                ("route-ph", "Ministry Of Health", "public_health", "amount_disclosed", "156512601.00"),
                ("route-ltc", "Ministry Of Long-Term Care", "long_term_care", "amount_disclosed", "265503669.00"),
            },
        )
        ltc_context = next(row for row in city["institutional_context"] if row["route_type"] == "ltc_ontario_health_role")
        self.assertEqual(ltc_context["source_label"], "Ontario Health")
        self.assertEqual(ltc_context["amount_status"], "relationship_disclosed_amount_not_disclosed")
        self.assertIsNone(ltc_context["amount_cad"])
        self.assertEqual(ltc_context["path_placement"], "parallel")
        municipal = next(row for row in city["institutional_context"] if row["route_type"] == "municipal_cofunding")
        self.assertEqual(municipal["amount_status"], "period_or_scope_incompatible")
        self.assertIsNone(municipal["amount_cad"])

        hospital = payloads["hospital"]
        self.assertEqual(hospital["incoming_routes"][0]["amount_cad"], "80.00")
        self.assertEqual(hospital["incoming_routes"][0]["target_label"], "Example Hospital")
        oh_context = next(row for row in hospital["institutional_context"] if row["route_type"] == "ontario_health_provider_role")
        self.assertIsNone(oh_context["amount_cad"])

    def test_ontario_health_is_an_exact_payee_across_multiple_buckets_not_only_physicians(self):
        payments = [
            {
                "payment_line_id": "home", "payment_label_id": "oh",
                "recipient_label_raw": "Ontario Health", "recipient_class": "intermediary",
                "amount_cad": "4684589899", "ministry": "Ministry Of Health",
                "service_category": "home_and_community_care", "payment_category": "Transfer Payments",
                "payment_detail": "Home Care", "route_id": "route-home",
            },
            {
                "payment_line_id": "cancer", "payment_label_id": "oh",
                "recipient_label_raw": "Ontario Health", "recipient_class": "intermediary",
                "amount_cad": "1858005000", "ministry": "Ministry Of Health",
                "service_category": "cancer_care", "payment_category": "Transfer Payments",
                "payment_detail": "Cancer Treatment Services", "route_id": "route-cancer",
            },
            {
                "payment_line_id": "physicians", "payment_label_id": "oh",
                "recipient_label_raw": "Ontario Health", "recipient_class": "intermediary",
                "amount_cad": "830529648", "ministry": "Ministry Of Health",
                "service_category": "physicians_and_practitioners", "payment_category": "Transfer Payments",
                "payment_detail": "Payments Made For Services And Care Provided By Physicians And Practitioners",
                "route_id": "route-physicians",
            },
        ]
        routes = [
            {"route_id": row["route_id"], "operating_targeted_or_capital": "operating_or_mixed"}
            for row in payments
        ]

        _, payloads = build_data.build_recipient_payloads(
            fiscal_year="2025-26", payments=payments, routes=routes,
            reviewed_links=[], profiles={"profiles": []},
        )

        oh = payloads["oh"]
        self.assertEqual(
            {row["bucket_id"] for row in oh["incoming_routes"]},
            {"home_and_community_care", "cancer_care", "physicians_and_primary_care"},
        )
        self.assertTrue(all(row["target_label"] == "Ontario Health" for row in oh["incoming_routes"]))
        self.assertFalse(
            any(row["source_label"] == "Ontario Health" for row in oh["institutional_context"]),
            "Ontario Health cannot be rendered as its own institutional intermediary",
        )

    def test_system_map_contract_separates_composition_funding_and_boundaries(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        contract = build_data.build_system_map_contract(
            release_id="release-test",
            fiscal_year="2025-26",
            ministry_sources=[
                {"ministry": "Health", "amount_cad": "83430094694"},
                {"ministry": "Long-Term Care", "amount_cad": "8856019584"},
            ],
            categories=[
                {"presentation_category": "hospitals", "amount_cad": "80"},
                {"presentation_category": "source_does_not_specify", "amount_cad": "20"},
            ],
            expense_total=Decimal("92286114278"),
            adjustments=[{"amount_cad": "-18000", "source_record_id": "recovery-1"}],
        )

        self.assertEqual(contract["schema_version"], "2.0.0")
        self.assertEqual(
            set(contract["vocabulary"]),
            {"topologies", "funding_mechanisms", "institutional_roles", "relationship_types", "evidence_states"},
        )
        nodes = {row["node_id"]: row for row in contract["nodes"]}
        combined = nodes[contract["root_node_id"]]
        self.assertEqual(combined["amount_cad"], "92286114278.00")
        self.assertIn("accounting_boundary", combined["topologies"])
        source_edges = [
            row for row in contract["edges"]
            if row["target_node_id"] == contract["root_node_id"]
            and row["topology"] == "composition"
        ]
        self.assertEqual(len(source_edges), 2)
        self.assertTrue(all(row["relationship_type"] == "classifies_expense" for row in source_edges))
        self.assertTrue(all(row["topology"] == "composition" for row in source_edges))
        self.assertTrue(all(row["funding_mechanism"] is None for row in source_edges))
        self.assertTrue(all(row["amount_status"] == "amount_disclosed" for row in source_edges))
        self.assertTrue(all(row["economic_event_id"] for row in source_edges))
        category_edges = [row for row in contract["edges"] if row["relationship_type"] == "classifies_expense" and row["source_node_id"] == contract["root_node_id"]]
        self.assertTrue(any(nodes[row["target_node_id"]]["evidence_state"] == "source_does_not_specify" for row in category_edges))
        adjustment = next(row for row in contract["edges"] if row["funding_mechanism"] == "recovery_or_settlement")
        self.assertEqual(adjustment["amount_cad"], "-18000.00")
        self.assertFalse(adjustment["aggregation_eligible"])

    def test_overview_preserves_complete_denominator_and_derives_top_five(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        categories = [
            {"presentation_category": f"category_{index}", "amount_cad": str(amount)}
            for index, amount in enumerate([40, 20, 10, 8, 7, 5, 4, 3, 2, 1])
        ]

        result = build_data.build_overview(
            fiscal_year="2024-25",
            expense_total=Decimal("100"),
            disclosed_payment_total=Decimal("110"),
            categories=categories,
        )

        self.assertEqual(result["fiscal_year"], "2024-25")
        self.assertEqual(result["ministry_expense_total_cad"], "100.00")
        self.assertEqual(len(result["expense_categories"]), 10)
        self.assertEqual(result["top_five_share_percent"], "85.0000")
        self.assertEqual(
            sum(Decimal(row["amount_cad"]) for row in result["expense_categories"]),
            Decimal("100"),
        )

    def test_ranking_excludes_people_and_negative_adjustments_without_merging_labels(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        rows = [
            {
                "payment_label_id": "label-a",
                "recipient_label_raw": "Alpha Hospital",
                "recipient_class": "hospital_corporation",
                "amount_cad": "80",
                "ministry": "Health",
                "service_category": "hospitals",
                "payment_category": "Transfer",
                "payment_detail": "Operations",
            },
            {
                "payment_label_id": "label-a",
                "recipient_label_raw": "Alpha Hospital",
                "recipient_class": "hospital_corporation",
                "amount_cad": "20",
                "ministry": "Health",
                "service_category": "hospitals",
                "payment_category": "Transfer",
                "payment_detail": "Operations",
            },
            {
                "payment_label_id": "label-b",
                "recipient_label_raw": "Alpha Hospital Inc.",
                "recipient_class": "hospital_corporation",
                "amount_cad": "70",
                "ministry": "Health",
                "service_category": "hospitals",
                "payment_category": "Transfer",
                "payment_detail": "Capital",
            },
            {
                "payment_label_id": "person-1",
                "recipient_label_raw": "Person, Test",
                "recipient_class": "person_or_employee",
                "amount_cad": "999",
                "ministry": "Health",
                "service_category": "administration",
                "payment_category": "Travel",
                "payment_detail": "No Value",
            },
            {
                "payment_label_id": "adjustment-1",
                "recipient_label_raw": "Less: Recoveries",
                "recipient_class": "program_aggregate",
                "amount_cad": "-10",
                "ministry": "Health",
                "service_category": "hospitals",
                "payment_category": "Statutory",
                "payment_detail": "Recoveries",
            },
        ]

        result = build_data.build_recipient_rankings(rows)

        self.assertEqual([row["payment_label_id"] for row in result["labels"]], ["label-a", "label-b"])
        self.assertEqual(result["labels"][0]["amount_cad"], "100.00")
        self.assertEqual(result["labels"][1]["amount_cad"], "70.00")
        self.assertEqual(result["included_payment_line_count"], 3)
        self.assertEqual(result["excluded_person_line_count"], 1)
        self.assertEqual(result["excluded_negative_line_count"], 1)

    def test_profile_is_standalone_until_a_reviewed_payment_link_exists(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        observations = [
            {
                "entity_id": "entity-1",
                "reporting_entity": "Example Hospital",
                "period_label": "2024-25",
                "financial_statement_class": "expense",
                "source_label": "Compensation",
                "normalized_amount_cad": "75",
                "row_role": "component",
                "aggregation_eligible": "yes_if_total_excluded",
                "publication_status": "approved_automated_review",
            },
            {
                "entity_id": "entity-1",
                "reporting_entity": "Example Hospital",
                "period_label": "2024-25",
                "financial_statement_class": "expense",
                "source_label": "Supplies",
                "normalized_amount_cad": "25",
                "row_role": "component",
                "aggregation_eligible": "yes_if_total_excluded",
                "publication_status": "approved_automated_review",
            },
        ]

        profiles = build_data.build_profiles(
            fiscal_year="2024-25",
            observations=observations,
            reviewed_links=[],
            payments=[],
        )

        profile = profiles["profiles"][0]
        self.assertEqual(profile["payment_link_status"], "not_verified")
        self.assertEqual(profile["payment_label_ids"], [])
        self.assertEqual(profile["expense_total_cad"], "100.00")
        self.assertEqual(profile["expense_insight"]["source_label"], "Compensation")
        self.assertEqual(profile["expense_insight"]["share_percent"], "75.0000")

    def test_current_release_builds_lightweight_v2_contract(self):
        self.assertIsNotNone(build_data, "scripts/build_data.py must exist")
        workspace_root = ROOT.parents[1]
        with tempfile.TemporaryDirectory() as directory:
            output_root = Path(directory)
            release = build_data.build_release(workspace_root, output_root)
            release_root = output_root / "data" / "releases" / release["release_id"]
            manifest = build_data.read_json(release_root / "manifest.json")
            overview = build_data.read_json(release_root / "flow-v2-overview.json")
            crosswalk = build_data.read_json(release_root / "taxonomy-crosswalk.json")
            sample = build_data.read_json(release_root / "taxonomy-sample.json")
            source_index = build_data.read_json(release_root / "source-index.json")
            hospital_category = build_data.read_json(release_root / "categories" / "hospital_care.json")
            payee_files = list((release_root / "payees").glob("*.json"))

        self.assertEqual(release["fiscal_year"], "2025-26")
        self.assertEqual(release["schema_version"], "2.0.0")
        self.assertIn("flow_v2", release)
        self.assertEqual(overview["positive_published_payments_cad"], "97433981876.00")
        self.assertEqual(overview["signed_adjustments_cad"], "-421011479.00")
        self.assertEqual(overview["net_published_payments_cad"], "97012970397.00")
        self.assertEqual(len(overview["categories"]), 14)
        self.assertEqual(
            sum((Decimal(row["amount_cad"]) for row in overview["categories"]), Decimal("0")),
            Decimal(overview["positive_published_payments_cad"]),
        )
        self.assertFalse(Path(manifest["source_structural_release"]).is_absolute())
        self.assertNotIn(str(workspace_root), manifest["source_structural_release"])
        self.assertIn("artifact_sha256", manifest)
        self.assertGreater(manifest["payee_count"], 2000)
        self.assertGreater(manifest["profile_count"], 0)
        self.assertEqual(len(crosswalk["mappings"]), 74)
        self.assertEqual(sample["seed"], 20261121)
        self.assertEqual(sample["sample_row_count"], 1027)
        self.assertEqual(len(source_index["sources"]), 2)
        self.assertGreater(len(hospital_category["programs"]), 0)
        self.assertGreater(len(payee_files), 2000)
        self.assertFalse((release_root / "system-map-contract.json").exists())
        self.assertFalse((release_root / "graph-index.json").exists())


if __name__ == "__main__":
    unittest.main()
