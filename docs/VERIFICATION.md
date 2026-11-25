# Verification report

Release: 2025–26.1  
Build ID: `e3c02059f840f1e84797`
Status: **Passed for publication on 2026-11-25**

## Verified results

- Positive MOH and MLTC payments: **$97,433,981,876**.
- Named payees: **$65,183,134,488**.
- Named non-intermediary organizations shown in the recipient layer: **$53,113,532,604**.
- Named intermediaries retained as evidence stops: **$12,069,601,884**.
- Not itemized to a public recipient: **$32,250,847,388 (33.10%)**.
- Fourteen categories, 74 source-native programs, 2,081 named payees in the reproducible data and 2,078 organizations in the recipient ranking.
- In the broader all-payee dataset, 22 payees reach 50% and 110 payees reach 80% of named-payee dollars. The public recipient view separately excludes intermediaries.
- Every generated payee path exists and every payee total equals its incoming routes.
- All 135 published financial profiles contain a direct source URL.
- The combined compressed initial payload is **364,863 bytes**, below the 500 KiB gate.
- The public database contains 14 approved tables. Its named and non-itemized payment tables reproduce the main denominator exactly.

## Numerical gates

- MOH and MLTC positive payments must sum to **$97,433,981,876**.
- Fourteen categories must sum to the same amount.
- Every category must equal its program total.
- Every program must equal named organizations plus intermediary stops plus non-itemized destinations.
- Named organizations, named intermediaries and non-itemized amounts must equal the positive-payment total.
- Every payee total must equal its incoming routes.
- Recipient category contributions must equal the recipient total.
- The −$421,011,479 adjustment must not enter a positive ribbon or ranking.
- Intermediary outflows must not enter the primary payment rollup.

## Evidence, identity and privacy gates

- Every visible amount carries source lineage.
- Every published financial profile links to its source statement.
- Known identity cases test Hospital for Sick Children, CAMH and the City of Toronto against authoritative or strongest-supported organization types.
- No personal label, restricted file, raw PDF, local filesystem path, extraction candidate or private review field enters a public bundle.
- Every unavailable node uses a controlled explanation.

## Interface gates

- Category, program and recipient views have equivalent structured tables.
- Keyboard, touch and screen-reader paths reach every selectable record.
- Reduced motion preserves the same information.
- Labels remain outside ribbon lanes.
- Browser history and deep links retain category, program and payee state.
- Recipient search covers the complete named non-intermediary organization universe.

Run all automated checks with `npm test`, then build with `npm run build`. The GitHub Actions workflow repeats both commands before deployment.

## Test record

- 32 Python data, privacy, identity, build and public-release tests passed.
- 65 JavaScript model and rendering tests passed.
- 28 end-to-end browser checks passed across Chromium, Firefox, WebKit and a reduced-motion mobile viewport; four device-specific checks were intentionally skipped outside their applicable viewport.
- The browser tests covered initial loading, 14-category rendering, global ranking, program navigation, recipient routes, financial-profile source links, complete-universe search, structured alternatives and page-level overflow.
- A rendered desktop review identified and resolved three material presentation/accessibility issues before this report was closed: a clipped MLTC label, a rounded `$97B` headline instead of `$97.4B`, and buttons incorrectly exposed as list items.

## Release artifacts

- DuckDB: `ontario-health-dollar-flow-2025-26.duckdb` — SHA-256 `1ff751c26051469b638ca0a6013231ab8c1598253caf409cb3429e81f50147be`.
- CSV archive: `ontario-health-dollar-flow-2025-26-csv.zip` — SHA-256 `ae7dca916d9f0bf951b0173797986f996efa400b1636722ca68482384f998740`.

No material numerical, identity, privacy, source-lineage, interaction or cross-browser defect remains in this release. The limitations in [LIMITATIONS.md](LIMITATIONS.md) remain applicable.
