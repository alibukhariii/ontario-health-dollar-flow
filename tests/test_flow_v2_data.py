import csv
import json
import sys
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

try:
    import flow_v2_data
except ModuleNotFoundError:
    flow_v2_data = None


def payment(
    line_id,
    amount,
    detail,
    *,
    label_id="label-1",
    label="Example Provider",
    recipient_class="hospital_corporation",
    ministry="Ministry Of Health",
    payment_category="Transfer Payments",
):
    return {
        "payment_line_id": line_id,
        "payment_label_id": label_id,
        "fiscal_year": "2025-26",
        "ministry": ministry,
        "payment_category": payment_category,
        "payment_detail": detail,
        "recipient_label_raw": label,
        "recipient_class": recipient_class,
        "amount_cad": str(amount),
    }


class FlowV2DataTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(flow_v2_data, "scripts/flow_v2_data.py must exist")

    def test_taxonomy_uses_program_purpose_and_rejects_unmapped_labels(self):
        cases = [
            (payment("1", 1, "Operation Of Hospitals"), "hospital_care"),
            (payment("2", 1, "Major Hospital Projects"), "health_capital_and_infrastructure"),
            (payment("3", 1, "Specialty Psychiatric Hospitals"), "mental_health_and_addictions"),
            (payment("4", 1, "Payments Made For Services And Care Provided By Physicians And Practitioners"), "physician_practitioner_and_insured_services"),
            (payment("5", 1, "Community Health Centres"), "primary_health_care"),
            (payment("6", 1, "Cancer Treatment Services"), "specialized_provincial_clinical_services"),
            (
                payment(
                    "7", 1, "No Value", ministry="Ministry Of Long-Term Care",
                    payment_category="Transfer Payments",
                ),
                "long_term_care",
            ),
        ]
        for row, expected in cases:
            with self.subTest(row=row):
                self.assertEqual(flow_v2_data.classify_payment(row), expected)

        with self.assertRaisesRegex(ValueError, "Unmapped payment program"):
            flow_v2_data.classify_payment(payment("x", 1, "New Unsupported Program"))

    def test_overview_separates_positive_payments_adjustment_and_net(self):
        rows = [
            payment("hospital", 80, "Operation Of Hospitals"),
            payment("capital", 20, "Major Hospital Projects"),
            payment(
                "drug", 50, "Ontario Government Pharmacy", label_id="drug", label="Drug Vendor",
                recipient_class="vendor", payment_category="Statutory Payments",
            ),
            payment(
                "adjustment", -40, "Ontario Government Pharmacy", label_id="adjustment",
                label="Less: Distribution And Sales", recipient_class="program_aggregate",
                payment_category="Statutory Payments",
            ),
        ]

        overview = flow_v2_data.build_overview("2025-26", rows)

        self.assertEqual(overview["schema_version"], "2.0.0")
        self.assertEqual(overview["positive_published_payments_cad"], "150.00")
        self.assertEqual(overview["signed_adjustments_cad"], "-40.00")
        self.assertEqual(overview["net_published_payments_cad"], "110.00")
        self.assertEqual(len(overview["categories"]), 14)
        amounts = {row["category_id"]: Decimal(row["amount_cad"]) for row in overview["categories"]}
        self.assertEqual(amounts["hospital_care"], Decimal("80.00"))
        self.assertEqual(amounts["health_capital_and_infrastructure"], Decimal("20.00"))
        self.assertEqual(amounts["drugs_and_assistive_devices"], Decimal("50.00"))
        self.assertEqual(sum(amounts.values()), Decimal("150.00"))

    def test_program_memberships_identify_only_exact_cross_category_programs(self):
        payloads = {
            "hospital_care": {
                "category_id": "hospital_care", "label": "Hospital care",
                "programs": [{
                    "program_id": "hospital-home", "label": "Home Care",
                    "ministry": "Ministry Of Health", "positive_amount_cad": "70.00",
                }],
            },
            "home_and_community_care": {
                "category_id": "home_and_community_care", "label": "Home and community care",
                "programs": [
                    {
                        "program_id": "community-home", "label": "Home Care",
                        "ministry": "Ministry Of Health", "positive_amount_cad": "30.00",
                    },
                    {
                        "program_id": "community-support", "label": "Community Support Services",
                        "ministry": "Ministry Of Health", "positive_amount_cad": "20.00",
                    },
                ],
            },
        }

        flow_v2_data.annotate_program_memberships(payloads)

        memberships = payloads["hospital_care"]["programs"][0]["category_memberships"]
        self.assertEqual(
            [(row["category_id"], row["amount_cad"]) for row in memberships],
            [("hospital_care", "70.00"), ("home_and_community_care", "30.00")],
        )
        self.assertEqual(
            payloads["home_and_community_care"]["programs"][1]["category_memberships"],
            [{
                "category_id": "home_and_community_care",
                "category_label": "Home and community care",
                "ministry": "Ministry Of Health",
                "amount_cad": "20.00",
            }],
        )

    def test_overview_quantifies_named_and_not_itemized_recipient_amounts(self):
        rows = [
            payment("provider", 70, "Community Health Centres", label_id="provider", recipient_class="community_provider"),
            payment("intermediary", 10, "Community Health Centres", label_id="oh", label="Ontario Health", recipient_class="intermediary"),
            payment("aggregate", 15, "Community Health Centres", label_id="aggregate", label="Program total", recipient_class="program_aggregate"),
            payment("person", 5, "Community Health Centres", label_id="person", label="Private Person", recipient_class="person_or_employee"),
        ]

        overview = flow_v2_data.build_overview("2025-26", rows)

        self.assertEqual(overview["named_destination_amount_cad"], "80.00")
        self.assertEqual(overview["aggregate_program_amount_cad"], "15.00")
        self.assertEqual(overview["withheld_person_amount_cad"], "5.00")
        self.assertEqual(overview["not_itemized_to_public_recipient_cad"], "20.00")
        self.assertEqual(overview["not_itemized_share_percent"], "20.00")

    def test_convergence_index_ranks_all_named_payees_and_labels_intermediaries(self):
        rows = [
            payment("a-hospital", 100, "Operation Of Hospitals", label_id="a", label="Alpha Health"),
            payment("a-capital", 20, "Major Hospital Projects", label_id="a", label="Alpha Health"),
            payment("b-hospital", 70, "Operation Of Hospitals", label_id="b", label="Beta Health"),
            payment("oh-home", 50, "Home Care", label_id="oh", label="Ontario Health", recipient_class="intermediary"),
            payment("aggregate", 30, "Ontario Drug Programs", label_id="aggregate", label="Program total", recipient_class="program_aggregate"),
        ]
        links = {
            "a": {"entity_id": "entity-a", "authoritative_name": "Alpha Health Corporation"},
        }
        overview = flow_v2_data.build_overview("2025-26", rows)
        payee_index, _ = flow_v2_data.build_payee_payloads("2025-26", rows, links, {})

        result = flow_v2_data.build_convergence_index(payee_index, overview)

        self.assertEqual([row["display_label"] for row in result["payees"]], [
            "Alpha Health Corporation", "Beta Health", "Ontario Health",
        ])
        self.assertEqual(result["payees"][0]["global_rank"], 1)
        self.assertEqual(result["payees"][0]["category_count"], 2)
        self.assertEqual(result["payees"][0]["identity_status"], "reviewed_resolved")
        self.assertEqual(result["payees"][2]["payee_type"], "intermediary")
        self.assertEqual(result["not_itemized_to_public_recipient_cad"], "30.00")
        self.assertEqual(result["concentration"]["top_1_share_of_named_payees_percent"], "50.00")

    def test_network_overview_is_compact_complete_and_reconciled(self):
        rows = [
            payment("hospital", 100, "Operation Of Hospitals", label_id="hospital", label="Alpha Hospital"),
            payment(
                "ltc", 50, "No Value", label_id="ltc", label="Beta Home",
                recipient_class="long_term_care_related_recipient",
                ministry="Ministry Of Long-Term Care",
            ),
            payment(
                "aggregate", 25, "Community Health Centres", label_id="aggregate",
                label="Program total", recipient_class="program_aggregate",
            ),
        ]
        overview = flow_v2_data.build_overview("2025-26", rows)
        categories = {
            category_id: flow_v2_data.build_category_payload("2025-26", category_id, rows, set())
            for category_id, _ in flow_v2_data.CATEGORIES
        }
        payee_index, payee_payloads = flow_v2_data.build_payee_payloads("2025-26", rows, {}, {})
        convergence = flow_v2_data.build_convergence_index(payee_index, overview)
        for recipient in convergence["payees"]:
            payee_payloads[recipient["payment_label_id"]]["global_rank"] = recipient["global_rank"]

        network = flow_v2_data.build_network_overview(
            overview, categories, convergence, payee_payloads, {}, labelled_count=1,
        )

        self.assertEqual(network["schema_version"], "3.0.0")
        self.assertEqual(len(network["categories"]), 14)
        self.assertEqual(len(network["programs"]), 3)
        self.assertEqual(len(network["recipients"]), 2)
        self.assertEqual(network["recipients"][0]["label"], "Alpha Hospital")
        self.assertTrue(network["recipients"][0]["label_by_default"])
        self.assertFalse(network["recipients"][1]["label_by_default"])
        self.assertEqual(network["not_itemized_to_public_recipient_cad"], "25.00")
        program_keys = {row["program_key"] for row in network["programs"]}
        self.assertTrue(all(row["program_key"] in program_keys for row in network["default_routes"]))
        category_total = sum(Decimal(row["amount_cad"]) for row in network["categories"])
        self.assertEqual(category_total, Decimal("175.00"))
        for category in network["categories"]:
            ministry_total = sum(Decimal(row["amount_cad"]) for row in category["ministry_amounts"])
            self.assertEqual(ministry_total, Decimal(category["amount_cad"]))

    def test_network_treats_intermediaries_as_reconciled_stops_not_recipients(self):
        rows = [
            payment(
                "provider", 70, "Operation Of Hospitals", label_id="provider",
                label="Alpha Hospital", recipient_class="hospital_corporation",
            ),
            payment(
                "intermediary", 10, "Operation Of Hospitals", label_id="oh",
                label="Ontario Health", recipient_class="intermediary",
            ),
            payment(
                "aggregate", 20, "Operation Of Hospitals", label_id="aggregate",
                label="Program total", recipient_class="program_aggregate",
            ),
        ]
        overview = flow_v2_data.build_overview("2025-26", rows)
        categories = {
            category_id: flow_v2_data.build_category_payload("2025-26", category_id, rows, set())
            for category_id, _ in flow_v2_data.CATEGORIES
        }
        payee_index, payee_payloads = flow_v2_data.build_payee_payloads("2025-26", rows, {}, {})
        convergence = flow_v2_data.build_convergence_index(payee_index, overview)

        network = flow_v2_data.build_network_overview(
            overview, categories, convergence, payee_payloads, {}, labelled_count=10,
        )

        self.assertEqual([row["label"] for row in network["recipients"]], ["Alpha Hospital"])
        self.assertEqual(network["named_non_intermediary_amount_cad"], "70.00")
        self.assertEqual(network["named_intermediary_amount_cad"], "10.00")
        self.assertEqual(network["not_itemized_to_public_recipient_cad"], "20.00")
        self.assertEqual(network["named_recipient_count"], 1)
        self.assertNotIn("oh", {row["recipient_id"] for row in network["named_routes"]})
        program = next(row for row in network["programs"] if row["label"] == "Operation Of Hospitals")
        self.assertEqual(program["intermediary_amount_cad"], "10.00")
        self.assertEqual(program["not_itemized_amount_cad"], "20.00")
        program_routes = [
            row for row in network["default_routes"]
            if row["program_key"] == program["program_key"]
        ]
        self.assertEqual(
            {row["target_type"]: Decimal(row["amount_cad"]) for row in program_routes},
            {"named_recipient": Decimal("70.00"), "intermediary_stop": Decimal("10.00"), "not_itemized": Decimal("20.00")},
        )
        self.assertEqual(
            sum((Decimal(row["amount_cad"]) for row in program_routes), Decimal("0")),
            Decimal(program["amount_cad"]),
        )
        route = payee_payloads["provider"]["incoming_routes"][0]
        self.assertEqual(route["intermediary_context"]["label"], "Ontario Health")
        self.assertEqual(route["intermediary_context"]["amount_status"], "not_separately_published")

    def test_authoritative_entity_level_overrides_a_misleading_payment_class(self):
        rows = [
            payment(
                "sickkids", 100, "Operation Of Hospitals", label_id="sickkids",
                label="The Hospital For Sick Children", recipient_class="vendor",
            ),
            payment(
                "toronto", 50, "Official Local Health Agencies", label_id="toronto",
                label="City Of Toronto", recipient_class="vendor",
            ),
        ]
        links = {
            "sickkids": {
                "entity_id": "hospital-1", "authoritative_name": "Hospital for Sick Children",
                "entity_level": "hospital_corporation",
            },
            "toronto": {
                "entity_id": "municipality-1", "authoritative_name": "City of Toronto",
                "entity_level": "municipality",
            },
        }

        index, payloads = flow_v2_data.build_payee_payloads("2025-26", rows, links, {})

        by_id = {row["payment_label_id"]: row for row in index}
        self.assertEqual(by_id["sickkids"]["payee_type"], "hospital corporation")
        self.assertEqual(by_id["toronto"]["payee_type"], "municipality")
        self.assertEqual(payloads["sickkids"]["payee_type"], "hospital corporation")
        self.assertEqual(payloads["sickkids"]["incoming_routes"][0]["source"]["period"], "2025-26")
        self.assertEqual(
            payloads["sickkids"]["evidence_stops"],
            [{
                "state": "2025–26 financial statement unavailable",
                "source_id": "public-profile-coverage-2025-26",
                "period": "2025-26",
                "limitation": "No approved 2025–26 financial profile is linked to this hospital corporation.",
            }],
        )

    def test_convergence_combines_only_verified_aliases_and_preserves_source_labels(self):
        rows = [
            payment("legacy", 100, "Operation Of Hospitals", label_id="legacy", label="Old Hospital Name"),
            payment("current", 70, "Major Hospital Projects", label_id="current", label="New Hospital Name"),
            payment("lookalike", 25, "Operation Of Hospitals", label_id="lookalike", label="New Hospital Name Foundation"),
        ]
        links = {
            "legacy": {"entity_id": "entity-hospital", "authoritative_name": "Regional Health Network"},
            "current": {"entity_id": "entity-hospital", "authoritative_name": "Regional Health Network"},
        }
        overview = flow_v2_data.build_overview("2025-26", rows)
        payee_index, payee_payloads = flow_v2_data.build_payee_payloads("2025-26", rows, links, {})

        result = flow_v2_data.build_convergence_index(payee_index, overview)
        organizations = result["organizations"]

        self.assertEqual(len(organizations), 2)
        verified = organizations[0]
        self.assertEqual(verified["display_label"], "Regional Health Network")
        self.assertEqual(verified["published_payment_total_cad"], "170.00")
        self.assertEqual(verified["payment_label_ids"], ["current", "legacy"])
        self.assertEqual(verified["published_labels"], ["New Hospital Name", "Old Hospital Name"])
        self.assertEqual(verified["category_count"], 2)
        self.assertEqual(organizations[1]["display_label"], "New Hospital Name Foundation")

        organization_payloads, label_to_organization = flow_v2_data.build_organization_payloads(
            payee_index,
            payee_payloads,
        )
        organization_id = label_to_organization["legacy"]["payment_label_id"]
        self.assertEqual(label_to_organization["current"]["payment_label_id"], organization_id)
        payload = organization_payloads[organization_id]
        self.assertEqual(payload["published_payment_total_cad"], "170.00")
        self.assertEqual(payload["published_labels"], ["New Hospital Name", "Old Hospital Name"])
        self.assertEqual(len(payload["incoming_routes"]), 2)
        self.assertEqual(label_to_organization["lookalike"]["payment_label_id"], "lookalike")

    def test_category_destinations_can_point_to_verified_organization_payload(self):
        rows = [
            payment("legacy", 100, "Operation Of Hospitals", label_id="legacy", label="Old Hospital Name"),
            payment("current", 70, "Operation Of Hospitals", label_id="current", label="New Hospital Name"),
        ]
        links = {
            "legacy": {"entity_id": "entity-hospital", "authoritative_name": "Regional Health Network"},
            "current": {"entity_id": "entity-hospital", "authoritative_name": "Regional Health Network"},
        }
        category = flow_v2_data.build_category_payload("2025-26", "hospital_care", rows, set())
        payee_index, payee_payloads = flow_v2_data.build_payee_payloads("2025-26", rows, links, {})
        organization_payloads, label_to_organization = flow_v2_data.build_organization_payloads(
            payee_index,
            payee_payloads,
        )

        flow_v2_data.remap_category_destinations(
            {"hospital_care": category},
            label_to_organization,
            organization_payloads,
        )

        destinations = category["programs"][0]["destinations"]
        self.assertEqual(len(destinations), 1)
        self.assertEqual(destinations[0]["label"], "Regional Health Network")
        self.assertEqual(destinations[0]["amount_cad"], "170.00")
        self.assertTrue(destinations[0]["path"].startswith("organizations/"))

    def test_intermediary_outflows_keep_passed_on_and_own_operations_separate(self):
        rows = [
            {
                "intermediary_id": "ontario_health", "intermediary_label": "Ontario Health",
                "fiscal_year": "2025-26", "group_id": "passed_on", "group_label": "Money passed onward",
                "source_label": "Hospital operations", "amount_cad": "80", "source_url": "https://example.test/oh",
                "source_page": "19", "target_intermediary_id": "ontario_health_athome",
            },
            {
                "intermediary_id": "ontario_health", "intermediary_label": "Ontario Health",
                "fiscal_year": "2025-26", "group_id": "own_operations", "group_label": "Ontario Health-run operations",
                "source_label": "Salaries and benefits", "amount_cad": "20", "source_url": "https://example.test/oh",
                "source_page": "19",
            },
        ]

        payloads = flow_v2_data.build_intermediary_payloads("2025-26", rows)
        result = payloads["ontario_health"]

        self.assertEqual(result["reported_expense_total_cad"], "100.00")
        self.assertEqual(result["groups"][0]["group_id"], "passed_on")
        self.assertEqual(result["groups"][0]["amount_cad"], "80.00")
        self.assertEqual(result["groups"][0]["components"][0]["target_intermediary_id"], "ontario_health_athome")
        self.assertEqual(result["groups"][1]["group_id"], "own_operations")
        self.assertEqual(result["groups"][1]["amount_cad"], "20.00")
        self.assertEqual(sum(Decimal(row["amount_cad"]) for row in result["groups"]), Decimal("100.00"))

    def test_category_payload_withholds_people_and_marks_amount_bearing_intermediary(self):
        rows = [
            payment("provider", 70, "Community Health Centres", label_id="provider", label="Provider One", recipient_class="community_provider"),
            payment("oh", 10, "Community Health Centres", label_id="oh", label="Ontario Health", recipient_class="intermediary"),
            payment("aggregate", 15, "Community Health Centres", label_id="aggregate", label="Accounts Under Threshold", recipient_class="program_aggregate"),
            payment("person", 5, "Community Health Centres", label_id="person", label="Private Person", recipient_class="person_or_employee"),
        ]

        payload = flow_v2_data.build_category_payload("2025-26", "primary_health_care", rows, set())

        self.assertEqual(payload["source"]["period"], "2025-26")
        self.assertTrue(payload["source"]["url"].startswith("https://www.ontario.ca/"))
        terminal = next(
            row for row in payload["programs"][0]["destinations"]
            if row["destination_type"] == "not_itemized"
        )
        self.assertEqual(terminal["evidence_stop"], "Not itemized by recipient")
        self.assertEqual(terminal["source"]["period"], "2025-26")

        program = payload["programs"][0]
        self.assertEqual(program["positive_amount_cad"], "100.00")
        self.assertEqual([row["label"] for row in program["destinations"]], ["Provider One", "Ontario Health", "Not itemized by recipient"])
        intermediary = next(row for row in program["destinations"] if row["label"] == "Ontario Health")
        self.assertEqual(intermediary["destination_type"], "intermediary")
        self.assertTrue(intermediary["selectable"])
        aggregate = next(row for row in program["destinations"] if row["label"] == "Not itemized by recipient")
        self.assertEqual(aggregate["amount_cad"], "20.00")
        self.assertFalse(aggregate["selectable"])
        self.assertNotIn("Private Person", str(payload))

    def test_payee_payload_contains_all_amount_routes_and_no_role_only_context(self):
        rows = [
            payment("hospital", 80, "Operation Of Hospitals", label_id="hospital", label="Example Hospital"),
            payment("capital", 20, "Major Hospital Projects", label_id="hospital", label="Example Hospital"),
            payment("mental", 5, "Community Mental Health", label_id="hospital", label="Example Hospital"),
        ]

        _, payloads = flow_v2_data.build_payee_payloads("2025-26", rows, {}, {})

        payload = payloads["hospital"]
        self.assertEqual(payload["published_payment_total_cad"], "105.00")
        self.assertEqual(
            {row["category_id"] for row in payload["incoming_routes"]},
            {"hospital_care", "health_capital_and_infrastructure", "mental_health_and_addictions"},
        )
        self.assertNotIn("institutional_context", payload)
        self.assertEqual(payload["profile_status"], "no_published_amounts")

    def test_actual_ledger_reconciles_to_binding_taxonomy_and_sample_fixture(self):
        public_evidence = ROOT / "data" / "input" / "payment-lines.csv"
        evidence = public_evidence if public_evidence.exists() else (
            ROOT.parents[1] / "evidence" / "ontario-health-dollar-map" / "payment-lines.csv"
        )
        with evidence.open(encoding="utf-8-sig", newline="") as handle:
            rows = [
                row for row in csv.DictReader(handle)
                if row["ministry"] in {"Ministry Of Health", "Ministry Of Long-Term Care"}
            ]

        overview = flow_v2_data.build_overview("2025-26", rows)
        public_fixture = ROOT / "data" / "input" / "taxonomy-sample-fixture.json"
        sample = (
            json.loads(public_fixture.read_text(encoding="utf-8"))
            if public_fixture.exists()
            else flow_v2_data.build_sample_fixture(rows, seed=20261121)
        )

        self.assertEqual(overview["positive_published_payments_cad"], "97433981876.00")
        self.assertEqual(overview["signed_adjustments_cad"], "-421011479.00")
        self.assertEqual(overview["net_published_payments_cad"], "97012970397.00")
        self.assertEqual(
            {row["category_id"]: row["amount_cad"] for row in overview["categories"]}["hospital_care"],
            "27487601667.00",
        )
        self.assertEqual(sample["seed"], 20261121)
        self.assertEqual(sample["sample_row_count"], 1027)
        self.assertEqual(sample["sample_amount_cad"], "14471173946.00")
        self.assertEqual(sample["represented_source_route_count"], 52)
        self.assertEqual(sample["total_source_route_count"], 74)


if __name__ == "__main__":
    unittest.main()
