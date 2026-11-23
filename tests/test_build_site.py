import sys
import tempfile
import unittest
import json
import gzip
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

try:
    import build_site
except ModuleNotFoundError:
    build_site = None


class BuildSiteTests(unittest.TestCase):
    def test_build_uses_repo_public_inputs_when_private_workspace_is_unavailable(self):
        self.assertIsNotNone(build_site)
        with tempfile.TemporaryDirectory() as workspace, tempfile.TemporaryDirectory() as output:
            release = build_site.build_site(ROOT, Path(workspace), Path(output))
            self.assertEqual(release["fiscal_year"], "2025-26")
            self.assertTrue((Path(output) / "data" / "current.json").is_file())

    def test_build_produces_editorial_flow_with_rankings_sources_and_accessible_views(self):
        self.assertIsNotNone(build_site, "scripts/build_site.py must exist")
        workspace_root = ROOT.parents[1]
        with tempfile.TemporaryDirectory() as directory:
            output_root = Path(directory)
            release = build_site.build_site(ROOT, workspace_root, output_root)

            self.assertTrue((output_root / "index.html").is_file())
            self.assertTrue((output_root / "styles.css").is_file())
            self.assertTrue((output_root / "browser-app.mjs").is_file())
            self.assertTrue((output_root / "app-model.mjs").is_file())
            self.assertTrue((output_root / "renderers.mjs").is_file())
            self.assertTrue((output_root / "network.mjs").is_file())
            self.assertTrue((output_root / "data" / "current.json").is_file())
            pointer = json.loads((output_root / "data" / "current.json").read_text(encoding="utf-8"))
            self.assertIn("flow_v2", pointer)
            self.assertTrue(pointer["flow_v2"]["overview_path"].endswith("flow-v2-overview.json"))
            self.assertTrue(
                (
                    output_root
                    / "data"
                    / "releases"
                    / release["release_id"]
                    / "release.json"
                ).is_file()
            )
            release_root = output_root / "data" / "releases" / release["release_id"]
            overview_path = release_root / "flow-v2-overview.json"
            overview = json.loads(overview_path.read_text(encoding="utf-8"))
            self.assertEqual(overview["schema_version"], "2.0.0")
            self.assertEqual(len(overview["categories"]), 14)
            self.assertEqual(overview["positive_published_payments_cad"], "97433981876.00")
            self.assertEqual(overview["signed_adjustments_cad"], "-421011479.00")
            self.assertEqual(overview["net_published_payments_cad"], "97012970397.00")
            self.assertLess(len(gzip.compress(overview_path.read_bytes())), 500 * 1024)
            self.assertTrue((release_root / "taxonomy-crosswalk.json").is_file())
            self.assertTrue((release_root / "taxonomy-sample.json").is_file())
            self.assertTrue((release_root / "convergence-index.json").is_file())
            self.assertTrue(pointer["flow_v2"]["network_path"].endswith("network-overview.json"))
            network = json.loads((release_root / "network-overview.json").read_text(encoding="utf-8"))
            self.assertEqual(len(network["categories"]), 14)
            self.assertEqual(len(network["programs"]), 74)
            self.assertEqual(len(network["recipients"]), 2081)
            self.assertEqual(network["named_recipient_count"], 2081)
            self.assertEqual(network["displayed_recipient_count"], 50)
            self.assertEqual(network["collapsed_recipient_count"], 2031)
            self.assertEqual(network["signed_adjustments_cad"], "-421011479.00")
            self.assertEqual(network["net_published_payments_cad"], "97012970397.00")
            self.assertEqual(
                sum(Decimal(row["amount_cad"]) for row in network["default_routes"] if row["target_type"] == "not_itemized"),
                Decimal(network["not_itemized_to_public_recipient_cad"]),
            )
            self.assertEqual(network["not_itemized_share_percent"], "33.10")
            program_keys = {row["program_key"] for row in network["programs"]}
            self.assertTrue(all(row["program_key"] in program_keys for row in network["default_routes"]))
            recipient_ids = {row["recipient_id"] for row in network["recipients"]}
            self.assertTrue(network["named_routes"])
            self.assertTrue(all(row["recipient_id"] in recipient_ids for row in network["named_routes"]))
            self.assertEqual(
                sum(Decimal(row["amount_cad"]) for row in network["named_routes"]),
                Decimal(network["named_destination_amount_cad"]),
            )
            route_totals = {
                program_key: sum(
                    Decimal(row["amount_cad"])
                    for row in network["default_routes"]
                    if row["program_key"] == program_key
                )
                for program_key in program_keys
            }
            self.assertEqual(set(route_totals), program_keys)
            for program in network["programs"]:
                self.assertEqual(route_totals[program["program_key"]], Decimal(program["amount_cad"]))
            root_html = (output_root / "index.html").read_text(encoding="utf-8")
            self.assertIn("Hospital care", root_html)
            self.assertIn("2,081 named recipients", root_html)
            self.assertNotIn("Loading the published payment network", root_html)
            ontario_health = next(row for row in network["recipients"] if row["label"] == "Ontario Health")
            recipient_page = output_root / "recipient" / ontario_health["recipient_id"] / "index.html"
            self.assertTrue(recipient_page.is_file())
            recipient_html = recipient_page.read_text(encoding="utf-8")
            self.assertIn("Ontario Health", recipient_html)
            self.assertIn("Home Care", recipient_html)
            self.assertIn("$12.0B", recipient_html)
            self.assertIn(f'data-recipient-id="{ontario_health["recipient_id"]}"', recipient_html)
            self.assertNotIn("Loading the published payment network", recipient_html)
            self.assertTrue((output_root / "recipients" / "index.html").is_file())
            convergence = json.loads((release_root / "convergence-index.json").read_text(encoding="utf-8"))
            self.assertEqual(convergence["not_itemized_to_public_recipient_cad"], "32250847388.00")
            self.assertEqual(convergence["not_itemized_share_percent"], "33.10")
            self.assertGreater(len(convergence["payees"]), 1000)
            self.assertEqual(convergence["payees"][0]["display_label"], "Ontario Health")
            self.assertEqual(convergence["payees"][0]["payee_type"], "intermediary")
            self.assertEqual(convergence["concentration"]["payees_to_50_percent"], 22)
            self.assertEqual(convergence["concentration"]["payees_to_80_percent"], 110)
            ontario_health_payee = json.loads((release_root / convergence["payees"][0]["path"]).read_text(encoding="utf-8"))
            ontario_health_profile = json.loads((release_root / ontario_health_payee["profile_path"]).read_text(encoding="utf-8"))
            self.assertTrue(ontario_health_profile["source"]["url"].startswith("https://"))
            initial_assets = [
                output_root / "index.html", output_root / "styles.css", output_root / "browser-app.mjs",
                output_root / "app-model.mjs", output_root / "renderers.mjs", output_root / "data" / "current.json",
                overview_path, release_root / "convergence-index.json",
            ]
            self.assertLess(sum(len(gzip.compress(path.read_bytes())) for path in initial_assets), 500 * 1024)
            self.assertTrue((release_root / "intermediaries" / "ontario_health.json").is_file())
            self.assertTrue((release_root / "intermediaries" / "ontario_health_athome.json").is_file())
            self.assertTrue((release_root / "categories" / "hospital_care.json").is_file())
            self.assertTrue(any((release_root / "payees").glob("*.json")))
            self.assertFalse((release_root / "system-map-contract.json").exists())
            self.assertFalse((release_root / "graph-index.json").exists())
            html = (output_root / "index.html").read_text(encoding="utf-8")
            self.assertIn("Where Ontario’s Health Dollars Went", html)
            self.assertIn("Follow the money through Ontario's health system from the ministry to the recipient", html)
            self.assertIn('id="page-landing"', html)
            self.assertIn('id="page-network"', html)
            self.assertIn("Data for FY 2025–26", html)
            self.assertIn("Created for Quantika by", html)
            self.assertIn(">Ali Bukhari</a>", html)
            self.assertIn("Who received Ontario’s health dollars?", html)
            self.assertNotIn("Ontario · 2025–26", html)
            self.assertNotIn("Scroll to follow the money", html)
            self.assertNotIn("The organization’s accounts", html)
            styles = (output_root / "styles.css").read_text(encoding="utf-8")
            browser_app = (output_root / "browser-app.mjs").read_text(encoding="utf-8")
            self.assertNotIn("perspective:", styles)
            self.assertIn(".funding-network", styles)
            self.assertIn(".network-tooltip", styles)
            self.assertIn("@media (prefers-reduced-motion: reduce)", styles)
            self.assertIn("prefers-reduced-motion: reduce", browser_app)


if __name__ == "__main__":
    unittest.main()
