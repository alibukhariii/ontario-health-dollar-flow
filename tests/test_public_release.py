import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

try:
    import build_public_release
except ModuleNotFoundError:
    build_public_release = None


class PublicReleaseTests(unittest.TestCase):
    def test_payment_export_excludes_people_and_preserves_nonidentifying_coverage(self):
        self.assertIsNotNone(build_public_release)
        rows = [
            {
                "payment_line_id": "named", "payment_label_id": "provider", "fiscal_year": "2025-26",
                "ministry": "Ministry Of Health", "payment_category": "Transfer Payments",
                "payment_detail": "Operation Of Hospitals", "recipient_label_raw": "Example Hospital",
                "recipient_class": "hospital_corporation", "amount_cad": "70", "source_version_id": "source-1",
            },
            {
                "payment_line_id": "aggregate", "payment_label_id": "aggregate", "fiscal_year": "2025-26",
                "ministry": "Ministry Of Health", "payment_category": "Transfer Payments",
                "payment_detail": "Operation Of Hospitals", "recipient_label_raw": "Accounts under threshold",
                "recipient_class": "program_aggregate", "amount_cad": "20", "source_version_id": "source-1",
            },
            {
                "payment_line_id": "person", "payment_label_id": "person", "fiscal_year": "2025-26",
                "ministry": "Ministry Of Health", "payment_category": "Transfer Payments",
                "payment_detail": "Operation Of Hospitals", "recipient_label_raw": "Private Person",
                "recipient_class": "person_or_employee", "amount_cad": "10", "source_version_id": "source-1",
            },
        ]

        named, non_itemized = build_public_release.sanitize_payment_rows(rows)

        self.assertEqual([row["published_payee"] for row in named], ["Example Hospital"])
        self.assertNotIn("Private Person", str(named) + str(non_itemized))
        self.assertEqual(sum(Decimal(row["amount_cad"]) for row in non_itemized), Decimal("30"))
        self.assertEqual({row["evidence_stop"] for row in non_itemized}, {"Not itemized by recipient"})

    def test_public_release_can_use_repo_local_inputs_without_private_workspace(self):
        self.assertIsNotNone(build_public_release)
        with tempfile.TemporaryDirectory() as directory:
            fiscal_year, tables = build_public_release.build_public_tables(ROOT, Path(directory))
        self.assertEqual(fiscal_year, "2025-26")
        build_public_release.validate_public_tables(tables)
        self.assertTrue(tables["payments_named"])
        self.assertTrue(tables["financial_observations"])


if __name__ == "__main__":
    unittest.main()
