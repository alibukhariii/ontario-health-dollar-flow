import csv
import hashlib
import json
import sys
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

try:
    import export_core_datasets
except ModuleNotFoundError:
    export_core_datasets = None


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


class CoreDatasetTests(unittest.TestCase):
    def test_three_public_datasets_are_complete_reconciled_and_sanitized(self):
        self.assertIsNotNone(export_core_datasets)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            manifest = export_core_datasets.export_core_datasets(ROOT, target)

            routes = read_csv(target / "recipient-funding-routes.csv")
            organizations = read_csv(target / "organization-alias-index.csv")
            financial = read_csv(target / "harmonized-financial-statements.csv")

            self.assertEqual(len(routes), 3926)
            self.assertEqual(len({row["route_id"] for row in routes}), len(routes))
            self.assertEqual(
                sum(Decimal(row["route_amount_cad"]) for row in routes),
                Decimal("65183134488.00"),
            )
            self.assertTrue(all(row["source_url"].startswith("https://") for row in routes))

            self.assertEqual(len(organizations), 2084)
            self.assertEqual(len({row["payee_id"] for row in organizations}), 2079)
            st_thomas = [row for row in organizations if "Thomas-Elgin General Hospital" in row["published_label"]]
            self.assertEqual(len({row["payee_id"] for row in st_thomas}), 1)
            shoppers = [row for row in organizations if row["published_label"] in {"Shoppers Drug Mart Inc", "Shoppers Drug Mart Inc."}]
            self.assertEqual(len({row["payee_id"] for row in shoppers}), 1)
            specialty = next(row for row in organizations if row["published_label"] == "Shoppers Drugmart Specialty Health Network")
            self.assertNotEqual(specialty["payee_id"], shoppers[0]["payee_id"])
            google = [row for row in organizations if row["published_label"] in {"Google Canada Corporation", "Google Canada Corporation*"}]
            self.assertEqual(len({row["payee_id"] for row in google}), 2)
            self.assertEqual(organizations[0]["display_label"], "Ontario Health")
            self.assertEqual(organizations[0]["global_rank"], "1")

            self.assertEqual(len(financial), 4995)
            self.assertTrue(all(row["source_url"].startswith("https://") for row in financial))
            self.assertTrue(all(row["source_sha256"] for row in financial))

            serialized = "\n".join(
                path.read_text(encoding="utf-8")
                for path in target.glob("*.csv")
            )
            for forbidden in ("/Users/", "person_or_employee", "candidate_id", "reviewer"):
                self.assertNotIn(forbidden, serialized)

            self.assertEqual(manifest["fiscal_year"], "2025-26")
            self.assertEqual(set(manifest["datasets"]), {
                "recipient-funding-routes.csv",
                "route-to-source-lineage.csv",
                "organization-alias-index.csv",
                "harmonized-financial-statements.csv",
            })
            for filename, metadata in manifest["datasets"].items():
                payload = (target / filename).read_bytes()
                self.assertEqual(metadata["sha256"], hashlib.sha256(payload).hexdigest())

    def test_export_is_deterministic(self):
        self.assertIsNotNone(export_core_datasets)
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            left = export_core_datasets.export_core_datasets(ROOT, Path(first))
            right = export_core_datasets.export_core_datasets(ROOT, Path(second))
        self.assertEqual(left, right)


if __name__ == "__main__":
    unittest.main()
