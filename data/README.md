# Project-created datasets

This directory publishes the three analysis-ready datasets created for **Ontario Health Dollar Flow**. They are derived from public records, but Ontario does not publish them in this connected and standardized form.

All amounts are nominal Canadian dollars. The current release covers fiscal year **2025–26**. Personal payment labels and internal review records are excluded.

## Datasets

### `derived/recipient-funding-routes.csv`

**Grain:** one supported ministry → funding purpose → official program → named recipient route.

This is the analytical route dataset behind the interactive diagram. It contains 3,926 routes and reconciles to **$65,183,134,488** itemized to 2,081 named public payees. It deliberately retains intermediary payees for reproducibility.

Important fields:

- `ministry`, `category_label`, `program_label`: the route into the recipient.
- `display_label`, `published_payee`, `payee_type`: the recipient identity and published label.
- `route_amount_cad`: the amount assigned to this route.
- `recipient_total_cad`, `global_rank`: the recipient's total and rank across named payees.
- `route_share_of_recipient_percent`: this route's share of the recipient's published-payment total.
- `source_url`, `source_id`, `source_limitation`: direct evidence lineage.

The routes cover named public payees only. A further **$32,250,847,388** was published through aggregate or non-public-recipient lines and is therefore not assigned to named recipients.

For presentation, the diagram separates **$12,069,601,884** published under named intermediaries from **$53,113,532,604** assigned to 2,078 named non-intermediary organizations. Intermediaries remain in this source dataset, but they are not ranked as recipient organizations in the main visual.

### `derived/organization-alias-index.csv`

**Grain:** one published alias attached to one ranked payee.

The file contains 2,084 alias rows for 2,081 payees. It supplies the names, organization types, identity status and entity identifiers required to render the diagram without merging names speculatively.

An `identity_status` of `reviewed_resolved` indicates that authoritative evidence supports the organization link. Other labels remain separate rather than being consolidated through fuzzy matching.

### `derived/harmonized-financial-statements.csv`

**Grain:** one approved, source-native financial-statement observation.

The file contains 4,995 observations extracted from 2025–26 hospital and Ontario Health statements, including the 2024–25 comparative values printed in those statements. It standardizes periods, scales, statement classes and amount types while preserving every source label.

Important fields:

- `reporting_entity`, `reporting_scope`: the legal or consolidated reporting boundary.
- `period_label`, `measurement_status`: the applicable period and whether the value is current or comparative.
- `source_label`, `normalized_amount_cad`: the disclosed line and normalized value.
- `financial_statement_class`, `revenue_expense_nature`, `row_role`: analytical structure without discarding the original label.
- `source_url`, `source_sha256`, `pdf_page`: direct source and page-level lineage.

These observations describe each reporting organization's complete accounts. They do **not** show that a particular ministry payment funded a particular expense.

## Reproducing the files

From the repository root:

```bash
npm ci
npm run build
python3 scripts/export_core_datasets.py
python3 -m unittest tests.test_core_datasets -v
```

`derived/manifest.json` records the row count, byte size and SHA-256 digest of each CSV.

## Sources

- [Ontario Public Accounts 2025–26: Detailed Schedules of Payments](https://www.ontario.ca/page/public-accounts-2025-26-detailed-schedules-payments)
- [Ontario Public Accounts 2025–26: Consolidated Financial Statements](https://www.ontario.ca/page/public-accounts-2025-26-consolidated-financial-statements)
- [Ontario Public Accounts 2025–26 index](https://www.ontario.ca/page/public-accounts-ontario-2025-26)
- [Ontario Health accountability and transparency](https://www.ontariohealth.ca/about/governance/accountability-transparency)

Project-created classifications and documentation are licensed under [CC BY 4.0](../LICENSE-DATA.md). Third-party source records remain subject to their original terms.
