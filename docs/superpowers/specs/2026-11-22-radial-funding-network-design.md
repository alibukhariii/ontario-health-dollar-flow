# Radial Funding Network Redesign

## Intent

Replace the multi-page flow interface with a two-part editorial experience: the existing landing page, followed by one radial network that makes Ontario's largest health-funding recipients and their routes immediately visible.

The network answers: who received the money, through which published program, and from which ministry-funded category?

## Design

The landing page keeps its current composition. Its subtitle becomes “Follow the money through Ontario's health system from the ministry to the recipient.” The lower corners identify the period and credit the project with a GitHub link.

The second page is a deterministic radial SVG inspired by Information is Beautiful's “Who's Suing Whom in AI?” graphic:

- Fourteen funding-purpose bubbles form the outer ring. Bubble area represents the category amount. MOH and MLTC use separate accessible colours; mixed categories use a split fill.
- The 74 exact published program names form a middle ring. Arrows point from each category to its programs.
- All 2,081 named recipients appear in a packed centre. Bubble area represents each recipient's global published-payment total.
- The largest recipients are labelled by default. Smaller recipients remain interactive dots and are reachable through search.
- One strongest route for each labelled recipient is visible in the resting view. Hovering or focusing any recipient replaces those contextual routes with every published program route into that recipient.
- Solid program-to-recipient lines identify ordinary named recipients. Dotted lines and double-ring recipient nodes identify intermediaries.
- A separate callout states that $32.251B, or 33.10%, was not itemized to named recipients. It is not drawn as an invented recipient or funding purpose.

Hover and keyboard focus open a card with the recipient's total, global rank, type and program contributions ranked by amount. Clicking pins the card and, where available, reveals the approved reported revenue-and-expense profile without joining payments to expenses.

## Constraints

- The verified payment denominator, taxonomy, identity rules and evidence stops do not change.
- Layouts are deterministic and collision-checked rather than force-directed, so nodes do not jump between visits.
- The default network does not draw all 3,900-plus routes simultaneously. Complete routes appear on recipient focus and in a structured table alternative.
- The experience remains static, uses repository JSON, supports reduced motion, touch, keyboard navigation and screen readers, and preserves direct source links.

## Approaches considered

1. Draw every route at once. Rejected because thousands of edges would hide the very relationships the graphic is meant to explain.
2. Show only the largest recipients. Rejected because it would make the public trail incomplete.
3. Show every recipient bubble with focus-and-context routes. Selected because it preserves completeness, makes the largest hubs immediately visible, and keeps individual trails legible on demand.

