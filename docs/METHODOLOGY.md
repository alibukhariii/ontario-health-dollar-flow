# Methodology

## Question

**Which organizations received Ontario’s health dollars, how much did they receive, and what were the payments for?**

The operational analysis measures the distribution, concentration and documented routes of positive 2025–26 payments published for Ontario’s Ministry of Health and Ministry of Long-Term Care.

## Denominator

The main denominator is **$97,433,981,876 in positive published payment lines**. This is the amount that can move forward through the visual without rendering a negative value as funding.

The Detailed Schedule also contains a **−$421,011,479 Ontario Government Pharmacy adjustment**, producing **$97,012,970,397 in net published payments**. The adjustment is retained in the release metadata but does not enter the forward ribbons. The separate **$92.286 billion combined ministry actual-expense frame** comes from a different Public Accounts presentation and is not the denominator for recipient rankings.

The product maps published payments. It does not claim that the schedule is a complete transaction ledger or that a published payment equals the recipient’s recognized revenue.

## Classification

Each positive payment line maps to exactly one of 14 funding purposes using its ministry, payment category and exact published payment detail. The payee’s identity does not determine the category. The [taxonomy crosswalk](../dist/data/) is versioned and the build fails when it encounters an unmapped source label.

Official program names remain unchanged beneath the analytical categories. For example, `Operation Of Hospitals` is shown exactly as published.

> Operation of Hospitals combines multiple funding mechanisms, including base, targeted, activity-based and one-time funding. A consistent recipient-level breakdown is not publicly available.

HBAM, Quality-Based Procedures and other hospital funding mechanisms therefore do not appear as amount-bearing recipient branches.

## Named payees and evidence coverage

People and employee labels never enter public files. Their aggregate amount remains within `Not itemized by recipient`. Program aggregates and thresholded lines are also shown as non-itemized terminals.

Aliases are combined only when a reviewed authoritative link proves that the labels belong to the same legal organization. Otherwise the published label remains separate. Payee type uses authoritative entity evidence first and the strongest supported payment classification second.

The current release contains:

- **$65.183 billion** itemized to named public payees.
- **$32.251 billion**, or **33.10%**, not itemized to a public recipient.
- One combined global ranking of named providers, intermediaries, municipalities and vendors.

## Rankings and concentration

The global ranking sums compatible positive payment lines for each named payee after approved alias resolution. Program rankings use only the selected program’s amount. The interface shows a program result’s global total and global rank beside it.

Concentration is measured within named-payee dollars:

- Share received by the largest, five largest and ten largest named payees.
- Count of named payees required to reach 50% and 80% of named-payee dollars.

These are descriptive concentration measures. They do not measure efficiency, quality, need or value for money.

## Intermediaries and financial profiles

Ontario Health and Ontario Health atHome appear as payees when the Detailed Schedule assigns an amount to them. Independently published intermediary expenses appear in a separate frame. Receipt and outflow amounts are never added together.

Recipient statements provide organization-wide revenue and expense context. Incoming payments are not connected to particular expenses, and statement totals are not added to the payment denominator.

## Reproduction

The build reads frozen evidence inputs, applies the reviewed taxonomy and identity links, runs reconciliation and privacy gates, and writes versioned static JSON. The website loads those files on demand. It does not query DuckDB.

The public DuckDB and CSV archive contain only public payment observations, categories, programs, payees, approved aliases, routes, contributions, approved financial observations, sources, crosswalks, intermediary outflows and evidence stops.
