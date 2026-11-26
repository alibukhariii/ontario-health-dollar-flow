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
- **$53.114 billion** assigned to 2,076 named non-intermediary organizations in the recipient layer after reviewed alias resolution.
- **$12.070 billion** published under named intermediaries and retained as program-level evidence stops.
- **$32.251 billion**, or **33.10%**, not itemized to a public recipient.
- One recipient ranking of named non-intermediary organizations. The reproducible data exports retain the broader all-payee ranking separately.

## Rankings and concentration

The recipient ranking sums compatible positive payment lines for each named non-intermediary organization after approved alias resolution. Program rankings use only the selected program’s amount. The interface shows a program result’s recipient total and rank beside it.

Concentration is measured within named-payee dollars:

- Share received by the largest, five largest and ten largest named payees.
- Count of named payees required to reach 50% and 80% of named-payee dollars.

These are descriptive concentration measures. They do not measure efficiency, quality, need or value for money.

## Intermediaries and financial profiles

Ontario Health, Ontario Health atHome and other named intermediaries remain in the underlying payee data, but they do not appear as recipient bubbles or in the recipient ranking. Their Public Accounts amounts remain part of the $97.434 billion denominator and appear as program-level evidence stops. Ontario Health can administer funding that a ministry pays directly to a provider, then recognize the same funding as revenue and transfer expense. Its audited transfer totals can therefore overlap provider payments in Public Accounts and must not be added to them. A dotted treatment on a recipient route indicates a documented intermediary role only; it carries no additional amount because no complete public recipient-by-recipient crosswalk is available.

Public Accounts lists **$12.006 billion** with Ontario Health as the payee. Ontario Health separately reported **$48.203 billion** in 2025–26 expenses: **$47.311 billion** in provider and long-term-care transfers and **$892.331 million** in Ontario Health-run operations. The **$35.305 billion** difference reflects funding Ontario Health oversees that may be paid directly by ministries; it does not identify additional named-recipient amounts. These published figures overlap and should not be added together. Ontario Health atHome separately reported **$4.839 billion** in expenses, including **$3.607 billion** in contracted care.

The recipient-level share administered through either intermediary is not consistently published. Dotted routes therefore identify a documented role; their widths reuse the published recipient amount and do not add a second flow.

Recipient statements provide organization-wide revenue and expense context. Incoming payments are not connected to particular expenses, and statement totals are not added to the payment denominator.

## Reproduction

The build reads frozen evidence inputs, applies the reviewed taxonomy and identity links, runs reconciliation and privacy gates, and writes versioned static JSON. The website loads those files on demand. It does not query DuckDB.

The public DuckDB and CSV archive contain only public payment observations, categories, programs, payees, approved aliases, routes, contributions, approved financial observations, sources, crosswalks, intermediary outflows and evidence stops.
