# Ontario Health Dollar Flow

An editorial data product that asks:

> **Which organizations received Ontario’s health dollars, how much did they receive, and what were the payments for?**

The 2025–26 release follows **$97.434 billion in positive payments** published by Ontario’s Ministry of Health and Ministry of Long-Term Care. It moves from the two ministries through 14 analytical funding purposes, exact source-native program labels and named payees. It then shows every supported incoming route for a selected payee and an approved financial profile where one is available.

## What the product contains

- One recipient ranking of named non-intermediary organizations, with provider, municipality, vendor and other organization types shown beside each result.
- A separate, reconciled treatment of amounts published under Ontario Health, Ontario Health atHome and other named intermediaries; these amounts remain evidence stops until a compatible downstream recipient crosswalk is public.
- Program-specific rankings that retain each organization’s recipient rank and total published payments.
- Concentration measures for the largest named payees.
- Recipient category and program contributions.
- Explicit evidence stops when a payment is not itemized, a downstream amount is not published, an identity is unresolved or a financial profile is unavailable.
- Approved revenue and expense profiles for 134 hospital corporations and Ontario Health, linked to their source statements.
- A public DuckDB database and matching CSV archive built from the same release contracts as the website.

## Project-created datasets

Three analysis-ready datasets are published under [`data/derived`](data/derived):

- **Recipient funding routes:** 3,926 ministry → purpose → official program → named recipient routes with amounts and source lineage.
- **Organization and alias index:** 2,084 published aliases attached to 2,081 ranked payees, with organization type and identity status.
- **Harmonized financial statements:** 4,995 approved, source-native hospital and Ontario Health financial observations with page-level lineage.

These files are derived from public records, but the connected routes, reviewed identities and harmonized statement observations are project-created. See the [dataset guide](data/README.md) for schemas, limitations and reproduction instructions.

The downloadable route and alias datasets retain all 2,081 named payees, including intermediaries, for reproducibility. The public recipient diagram ranks 2,078 named non-intermediary organizations. It keeps the **$12.070 billion** published under named intermediaries separate from the **$53.114 billion** assigned to named organizations and the **$32.251 billion** that was not itemized. These three parts reconcile to the $97.434 billion positive-payment denominator.

The main visual does not use the $97.013 billion net figure, the −$421.011 million pharmacy adjustment or the $92.286 billion ministry-expense frame. Those figures are documented in [the methodology](docs/METHODOLOGY.md).

## Run locally

Requirements: Python 3.11 or later, Node.js 20 or later, and DuckDB 2.0.0 for the downloadable database.

```bash
python -m pip install --require-hashes -r requirements-release.txt
npm ci
npm run build
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
npm run serve
```

Open <http://localhost:4173>.

Build the public database and matching CSV archive with the locked project environment:

```bash
python scripts/build_public_release.py
```

## Repository guide

- `src/`: accessible editorial interface.
- `scripts/build_data.py`: static website data contracts.
- `scripts/flow_v2_data.py`: taxonomy, rankings, concentration and recipient-route logic.
- `scripts/build_public_release.py`: sanitized DuckDB and CSV release builder.
- `tests/`: numerical, privacy, identity, rendering and build checks.
- `docs/`: methodology, data dictionary, source ledger, limitations and verification report.
- `dist/`: generated GitHub Pages build.

Raw PDFs, OCR files, extraction candidates, private review records and personal payment labels are deliberately excluded.

## Documentation

- [Methodology](docs/METHODOLOGY.md)
- [Data dictionary](docs/DATA_DICTIONARY.md)
- [Source ledger](docs/SOURCE_LEDGER.md)
- [Limitations](docs/LIMITATIONS.md)
- [Verification report](docs/VERIFICATION.md)
- [How to cite](CITATION.cff)
- [Third-party dependency notices](THIRD_PARTY_NOTICES.md)
- [CycloneDX software bill of materials](sbom.cdx.json)

## Licences

Original code is available under the [MIT License](LICENSE). Original documentation and project-created crosswalks are available under [CC BY 4.0](LICENSE-DATA.md). Third-party source material remains subject to its original terms and is linked rather than redistributed. Runtime and test dependencies are listed in [the third-party notices](THIRD_PARTY_NOTICES.md) and [SBOM](sbom.cdx.json).
