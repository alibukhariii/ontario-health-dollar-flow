# Page 2 Concentration Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Page 2 into a two-column editorial overview with a data-derived top-ten recipient chart, and remove the three decorative scale rings from Page 3 without removing its navigation guide.

**Architecture:** The static build calculates the top-ten share and emits accessible recipient links and proportional bars from the publication contract. The browser progressively enhances those links so selection opens the same focused recipient state used by search. The network renderer stops emitting the decorative orbit rings while retaining all category, program and recipient nodes.

**Tech Stack:** Static HTML/CSS, Python 3.11 build scripts, ES modules, Node test runner, Playwright.

**Spec:** Approved conversation design dated 2026-11-24.

## Global Constraints

- The Page 2 denominator remains $97.434 billion in positive published payments.
- The chart contains the ten largest named recipients and calculates their share at build time.
- Chart links must work without JavaScript and open the focused Page 3 view with JavaScript.
- “A quarter (25.3%)” is bold and uses the main sentence scale.
- The not-itemized sentence is substantially smaller than the other Page 2 statements.
- The Page 3 navigation guide remains; only the three decorative diagram rings and their in-diagram labels are removed.
- Unrelated untracked files remain untouched.

## Review Focus

- A changed release must recalculate the share rather than preserve 25.3% as a hard-coded value.
- Long institution names must remain readable without covering their bars.
- Bar selection must load the network before focusing a recipient on slow connections.
- Mobile layout must stack without horizontal overflow.
- Removing the decorative rings must not remove category, program or recipient nodes.

---

### Task 1: Page 2 concentration chart

**Files:**
- Modify: `src/index.html`
- Modify: `src/styles.css`
- Modify: `src/browser-app.mjs`
- Modify: `scripts/build_site.py`
- Test: `tests/test_build_site.py`
- Test: `tests/e2e/final-product.spec.mjs`

**Interfaces:**
- Consumes: `network-overview.json` recipients and positive-payment denominator.
- Produces: `#overview-recipient-chart` with ten `[data-overview-recipient]` links.

- [ ] Write failing build and browser tests for the full ministry names, calculated 25.3% callout, ten bars, axis title, smaller not-itemized copy and recipient focus navigation.
- [ ] Run the focused tests and confirm they fail because the chart and copy do not exist.
- [ ] Implement build-time chart markup, Page 2 layout and progressive recipient-link enhancement.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Remove Page 3 decorative scale rings

**Files:**
- Modify: `src/network.mjs`
- Modify: `src/styles.css`
- Test: `tests/network.test.mjs`
- Test: `tests/e2e/final-product.spec.mjs`

**Interfaces:**
- Consumes: the existing network layout and top `.network-scale` guide.
- Produces: the same network without `.orbit` or `.orbit-label` SVG elements.

- [ ] Write failing renderer and browser tests asserting no decorative ring markup while the top scale guide remains.
- [ ] Run the focused tests and confirm they fail on the existing rings.
- [ ] Remove the orbit markup and unused ring styles without changing the data nodes.
- [ ] Run focused and full verification, build the release and inspect desktop/mobile screenshots.
- [ ] Commit and publish the verified revision.
