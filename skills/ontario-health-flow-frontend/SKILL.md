---
name: ontario-health-flow-frontend
description: Design or revise the Ontario Health Dollar Flow frontend, especially its landing page and interactive funding network. Use for visual, interaction, accessibility, or frontend implementation work on this project.
---

# Ontario Health Dollar Flow frontend

Treat the latest user brief as binding. Use this skill to preserve the product’s visual point of view and prevent the interface from drifting back toward a dashboard or a generic data template.

## Product job

Help an untrained reader follow Ontario’s published health-ministry payments from ministries to funding purposes, official programs and named recipients. The visual should make large financial hubs immediately visible while allowing any recipient’s complete published route to be inspected.

The interface is an editorial data object, not an audit screen, financial dashboard or global systems diagram.

## Current visual structure

1. Preserve the black, near-edge-to-edge landing page and monumental title.
2. Follow it with one expansive radial funding network on a light canvas.
3. Place the 14 funding-purpose bubbles on the outer ring, official programs in the middle ring and named recipients in the centre.
4. Make bubble **area**, not diameter, proportional to amount.
5. Connect categories to programs and programs to recipients. Use solid routes for ordinary recipients and dotted routes for intermediaries.
6. Keep all named recipients searchable and present in the visual. Label only the largest recipients in the resting state; reveal every route for one recipient on hover, focus, search or selection.
7. Show the amount that was not itemized to a named recipient as a clear callout, not as a fictional organization.

## Visual direction

Spend the visual boldness on the network itself.

- Use true black, crisp white and quiet neutral grey as the base.
- Use one distinct colour for the Ministry of Health and another for the Ministry of Long-Term Care. A mixed category may use a split fill based on exact ministry shares.
- Keep controls, legends and source notes visually restrained.
- Avoid cards, shadows, gradients used as decoration, rounded SaaS chrome, decorative numbering and repeated eyebrow labels.
- Do not use all caps for ordinary labels. Use uppercase only where it carries a specific diagrammatic function and a sentence-case alternative would be less clear.
- Retain the existing landing typography unless the user asks for a new identity. Use type scale, spacing and weight to establish hierarchy rather than ornamental treatments.
- Keep body copy short, active and literal. Name what the reader sees rather than how the data pipeline works.

## Interaction

- The landing page scrolls directly into the network.
- Hover and keyboard focus reveal a recipient’s total, global rank, type and program amounts sorted from largest to smallest.
- Clicking pins the recipient detail so it remains available for touch users and can open the approved financial profile where one exists.
- Search must reach the complete named-recipient universe.
- Dim surrounding context during focus instead of hiding it.
- Use one intentional entrance for the network. Do not add repeated fade-and-slide effects.
- Respect reduced motion and provide a structured table alternative.

## Data and evidence invariants

- Render only approved public contracts. Never infer a downstream amount.
- Preserve official program labels and authoritative recipient identities where resolved.
- Keep non-itemized amounts separate from named recipients.
- Do not add intermediary receipts and outflows together.
- Do not connect published payments directly to a recipient’s reported expenses.
- Every displayed amount must retain a source, period and stable identifier.

## Build review

Before finishing, inspect the actual rendered page at desktop and mobile sizes. Check that:

- the largest categories and recipients are recognizable without interaction;
- labels do not overlap important bubbles or routes;
- the network remains intelligible before and after focus;
- every recipient is reachable through search and keyboard use;
- intermediary line treatment is visible without relying on colour;
- the page still feels like one authored editorial composition rather than a collection of interface components.

When this guide and a later user instruction differ, follow the later user instruction.
