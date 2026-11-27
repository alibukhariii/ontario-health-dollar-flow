# Source ledger

## Core sources

| Source | Period | Role | Reuse terms | Publication treatment |
| --- | --- | --- | --- | --- |
| [Ontario Public Accounts 2025–26, Detailed Schedules of Payments](https://www.ontario.ca/page/public-accounts-2025-26-detailed-schedules-payments) | 2025–26 | Payment amounts, ministries, payment categories, exact program labels and published payee labels | [Ontario.ca Terms of Use](https://www.ontario.ca/page/terms-use); explicitly not Open Government Licence | Derived rows and citation; © King’s Printer for Ontario attribution |
| [Ontario Public Accounts 2025–26, consolidated financial statements](https://www.ontario.ca/page/public-accounts-2025-26-consolidated-financial-statements) | 2025–26 | Defines the broader accounting context and the distinction between payments and consolidated expense | [Ontario.ca Terms of Use](https://www.ontario.ca/page/terms-use) | Citation only |
| [Ontario Public Accounts 2025–26](https://www.ontario.ca/page/public-accounts-ontario-2025-26) | 2025–26 | Index for public hospital and agency financial statements | Ontario terms for Ontario-hosted index; each linked statement publisher may set its own terms | Derived observations and direct statement links; raw PDFs are not redistributed |
| [Ontario Health accountability and transparency](https://www.ontariohealth.ca/about/governance/accountability-transparency) | 2025–26 context | Ontario Health governance and public financial documents | [Ontario Health Terms and Conditions](https://www.ontariohealth.ca/terms-conditions) | Factual derived observations and citation; raw PDFs not redistributed |
| [Ontario Health atHome accountability agreement](https://www.ontariohealth.ca/content/dam/ontariohealth/documents/ontario-health-athome-service-accountability-agreement.pdf) | Current agreement | Institutional context for Ontario Health atHome | [Ontario Health atHome Terms of Use](https://www.ontariohealthathome.ca/terms-of-use/) | Factual derived observations and citation; raw PDF not redistributed |
| [Ontario Health atHome 2025–26 audited financial statements](https://www.ontariohealthathome.ca/blobohahprod4cd80afe1b/wp-content/uploads/2026/06/OHaH-2025-26-Audited-Financial-Statements-EN.pdf) | Year ended 2026-03-31 | Agency-wide revenue and expense totals; not a recipient-level allocation | [Ontario Health atHome Terms of Use](https://www.ontariohealthathome.ca/terms-of-use/) | Derived observations and citation; PDF retained only for source verification |

The retained English PDF version was retrieved on **2026-11-27**. Its SHA-256 is `4c62d6217d2eb41fdd536b6de2408df67ba911f7a8295841edae0bdeccfbfe75`; the figures are on PDF page 5. The source limitation is recorded in [`intermediary-financial-totals.csv`](../data/input/intermediary-financial-totals.csv), and the input manifest records that CSV’s hash.

Every financial profile in the website includes the direct URL and period of its source statement. The downloadable `sources` table includes the retained source hash, retrieval date, publication eligibility and limitation.

The Open Government Licence is used only when a source page explicitly applies it. It does not apply to the Detailed Schedule of Payments used here. See [the project’s source-licence notice](../LICENSE-DATA.md).

## Evidence stops

The release uses the following controlled public labels:

- `Not itemized by recipient`
- `Downstream amount not published`
- `Identity unresolved`
- `Profile not available in this release`
- `Source not retrieved`
- `Not collected in this release`

A missing profile means no reviewed profile is connected in this release; it does not mean that no financial statements exist. Where a source was not retrieved or a profile has not yet been collected, the interface should state that specific coverage limit.
