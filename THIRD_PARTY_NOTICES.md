# Third-party notices

This project uses the following third-party software. These notices cover the project dependencies, not the linked government and recipient source materials described in `docs/SOURCE_LEDGER.md`.

| Component | Version | Purpose | Licence |
|---|---:|---|---|
| DuckDB Python package | 2.0.0 | Build the downloadable public database | MIT |
| `@playwright/test` | 1.57.0 | Cross-browser acceptance tests | Apache-2.0 |
| `playwright` | 1.57.0 | Browser automation used by the acceptance tests | Apache-2.0 |
| `playwright-core` | 1.57.0 | Browser automation core | Apache-2.0 |
| `fsevents` | 2.3.2 | Optional macOS filesystem dependency | MIT |

Exact JavaScript package versions and integrity hashes are recorded in `package-lock.json`. The DuckDB distribution hashes accepted by the release environment are recorded in `requirements-release.txt`. A machine-readable CycloneDX inventory is provided in `sbom.cdx.json`.
