# Methodology

## Question

**Which organizations received Ontario’s health dollars, how much did they receive, and what were the payments for?**

The operational analysis measures the distribution, concentration and documented routes of positive 2025–26 payments published for Ontario’s Ministry of Health and Ministry of Long-Term Care.

## Denominator

The main denominator is **$97,433,981,876 in positive published payment lines**. This is the amount that can move forward through the visual without rendering a negative value as funding.

The Detailed Schedule also contains a **−$421,011,479 Ontario Government Pharmacy adjustment**, producing **$97,012,970,397 in net published payments**. The adjustment is retained in the release metadata but does not enter the forward ribbons. The separate **$92.286 billion combined ministry actual-expense frame** comes from a different Public Accounts presentation and is not the denominator for recipient rankings.

The product maps published payments. It does not claim that the schedule is a complete transaction ledger or that a published payment equals the recipient’s recognized revenue.

## Classification

Each positive payment line maps to one of 14 **project-defined analytical funding purposes** using its ministry, payment category and published payment detail. The payee’s identity does not determine the category. The [taxonomy crosswalk](../dist/data/) is versioned and the build fails when it encounters an unmapped source label.

Program names follow the source detail unless it is `No Value`. In that case, the displayed program name is marked **Category fallback** and uses the source payment category as a stand-in; the downloadable data retains the original source detail. This includes “Long-term care transfer payments.”

> Operation of Hospitals combines multiple funding mechanisms, including base, targeted, activity-based and one-time funding. A consistent recipient-level breakdown is not publicly available.

HBAM, Quality-Based Procedures and other hospital funding mechanisms therefore do not appear as amount-bearing recipient branches.

## Named payees and evidence coverage

Personal payee labels never enter public files. Their amounts remain grouped with program aggregates and other rows that are not itemized to named recipients. The diagram identifies the source program or group where available; it does not assign those amounts to a named person or organization.

Aliases are combined only when a reviewed authoritative link proves that the labels belong to the same legal organization. Otherwise the published label remains separate. Payee type uses authoritative entity evidence first and the strongest supported payment classification second.

The current release contains:

- **$65.183 billion** listed across **2,079 named payees**, including three named intermediaries.
- **$53.114 billion** assigned to 2,076 named non-intermediary organizations in the recipient layer after reviewed alias resolution.
- **$12.070 billion** in Public Accounts rows naming Ontario Health, Ontario Health atHome or Accerta.
- **$32.251 billion**, or **33.10%**, published as program-level aggregates or grouped payments and not itemized to named recipients.
- One recipient ranking of named non-intermediary organizations. The reproducible data exports retain the broader all-payee ranking separately.

## Rankings and concentration

The recipient ranking sums compatible positive payment lines for each named non-intermediary organization after approved alias resolution. Program rankings use only the selected program’s amount. The interface shows a program result’s recipient total and rank beside it.

Concentration is measured within named-payee dollars:

- Share received by the largest, five largest and ten largest named payees.
- Count of named payees required to reach 50% and 80% of named-payee dollars.

These are descriptive concentration measures. They do not measure efficiency, quality, need or value for money.

## Intermediaries and financial profiles

Ontario Health, Ontario Health atHome and Accerta appear as distinct intermediary nodes, separate from the 2,076-organization recipient ranking. Their Public Accounts rows remain in the $97.434 billion positive-payment frame. An audited transfer from Ontario Health to Ontario Health atHome is shown as a separate reporting view; it is not added to Ministry of Health payment rows. Route amounts are the published ministry payments to named payees. Dotted styling marks documented oversight; it does not mean that money passed through an intermediary or show a complete allocation.

Public Accounts lists **$12.006 billion** with Ontario Health as payee. Ontario Health separately reported **$48.203 billion** in expenses: **$47.311 billion** in transfer expenses and **$892.331 million** in its own operations. The **$35.305 billion** arithmetic difference between the transfer-expense total and Public Accounts payee rows is not reconciled by the sources; it is not a third payment amount. Ontario Health reports **$4.822 billion** in transfer expense to Ontario Health atHome. OHaH reports **$4.841 billion** in revenue, **$4.839 billion** in expenses, including **$3.607 billion** in contracted care. Its Public Accounts direct ministry payment is **$150,000**. Accerta’s Public Accounts amount is **$62.981 million**; its onward-payment and operating-cost split is not published in the collected evidence.

These audited totals do not give a complete recipient-by-recipient match of intermediary outflows. The amounts are not added to recipient totals. Dotted lines mark documented funding, accountability or contracting oversight. They do not show a separate payment, do not mean that the displayed ministry-to-payee amount passed through the intermediary, and do not provide a complete allocation.

Recipient statements provide organization-wide revenue and expense context. Incoming payments are not connected to particular expenses, and statement totals are not added to the payment denominator.

## Reproduction

The build reads frozen evidence inputs, applies the reviewed taxonomy and identity links, runs reconciliation and privacy gates, and writes versioned static JSON. The website loads those files on demand. It does not query DuckDB.

The public DuckDB and CSV archive contain public payment observations, categories, programs, payees, approved aliases, routes, contributions, approved financial observations, sources, crosswalks, intermediary outflows and evidence stops. `route-to-source-lineage.csv` links each displayed route to its source row number, published payee, original category and detail, amount and source version. It retains source-native labels even when the displayed ranking name is a reviewed canonical name.
