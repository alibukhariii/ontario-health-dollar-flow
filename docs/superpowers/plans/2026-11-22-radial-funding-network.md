# Radial Funding Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the post-landing flow with a complete, legible radial funding network and deploy it through the existing verified GitHub Pages pipeline.

**Architecture:** Add a compact network publication contract during the Python build. A pure JavaScript layout/rendering module turns it into a deterministic SVG and structured alternative; the browser controller handles lazy loading, search, focus, tooltips and profiles.

**Tech Stack:** Python 3.11, browser-native ES modules and SVG, Playwright 1.57.

**Spec:** `docs/superpowers/specs/2026-11-22-radial-funding-network-design.md`

## Global Constraints

- Preserve the $97,433,981,876 positive-payment denominator and 14-category taxonomy.
- Show all 2,081 named recipients; default labels and contextual edges may be reduced for legibility.
- Never add non-itemized amounts to named recipients or connect payments to recipient expenses.
- Preserve source URLs, organization type, intermediary status and exact program names.
- Use area, not radius, to encode amounts.

## Review Focus

- Very small recipients remain focusable and searchable.
- Mixed-ministry categories retain both ministry amounts.
- Recipient packing has no material overlaps or out-of-bounds nodes.
- Keyboard focus produces the same route and tooltip detail as pointer hover.
- The mobile view remains usable without clipping the data table alternative.

### Task 1: Compact network contract

**Files:** Modify `scripts/flow_v2_data.py`, `scripts/build_data.py`, `tests/test_flow_v2_data.py`, `tests/test_build_site.py`.

- [ ] Add failing tests for category ministry totals, 74 programs, 2,081 compact payees and valid default route keys.
- [ ] Implement `build_network_overview(...)` and publish `network-overview.json` through `current.json`.
- [ ] Run the Python suite and commit.

### Task 2: Deterministic radial layout and renderer

**Files:** Create `src/network.mjs`, `tests/network.test.mjs`; modify `scripts/build_site.py`.

- [ ] Add failing tests for area scaling, category/program placement, collision-free recipient packing, route selection and accessible SVG output.
- [ ] Implement the pure layout and rendering functions.
- [ ] Run JavaScript tests and commit.

### Task 3: Editorial interface and interaction

**Files:** Modify `src/index.html`, `src/browser-app.mjs`, `src/styles.css`, `tests/e2e/final-product.spec.mjs`.

- [ ] Add failing browser tests for the landing copy, 14 categories, complete recipient universe, hover detail, search, intermediary styling and responsive overflow.
- [ ] Implement lazy network loading, recipient focus, popup, search, profile panel, legend and structured alternative.
- [ ] Run the full build, unit suite and cross-browser suite.

### Task 4: Publication

**Files:** Update `docs/VERIFICATION.md` and `CHANGELOG.md`.

- [ ] Record the new interface checks and release ID.
- [ ] Push to the public repository, wait for GitHub Actions and verify the live page and JSON contract.

