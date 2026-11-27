# Data dictionary

The downloadable database and CSV archive contain the following tables.

| Table | Unit | Important fields |
| --- | --- | --- |
| `payments_named` | One positive published payment line to a non-person named payee | `payment_line_id`, `payment_label_id`, `ministry`, `payment_detail`, `category_id`, `amount_cad`, `source_url` |
| `payments_non_itemized` | One aggregated non-identifying amount by source program | `ministry`, `payment_detail`, `category_id`, `amount_cad`, `evidence_stop` |
| `categories` | One project-defined analytical funding purpose | `category_id`, `category_label`, `amount_cad`, `share_percent` |
| `programs` | One source program within a project-defined purpose and ministry | `program_id`, `program_label`, `program_label_status`, `source_payment_detail`, `category_id`, `amount_cad` |
| `payees` | One named source payee or verified legal organization | `payment_label_id`, `display_label`, `payee_type`, `published_payment_total_cad`, `global_rank` |
| `payee_aliases` | One published label attached to a public payee ID | `payee_id`, `published_label`, `identity_status` |
| `recipient_routes` | One ministry-category-program route into a payee | `payee_id`, `ministry`, `category_id`, `program_label`, `program_label_status`, `source_payment_detail`, `source_row_numbers`, `amount_cad` |
| `route-to-source-lineage.csv` | One original payment row behind a displayed route | `route_id`, `payment_line_id`, `source_row_number`, `published_payee`, `source_payment_category`, `source_payment_detail`, `amount_cad`, `source_version_id`, `source_url` |
| `recipient_category_contributions` | One category’s contribution to a payee’s published total | `payee_id`, `category_id`, `amount_cad` |
| `financial_observations` | One approved source-native financial-statement observation | entity, period, statement class, source label, normalized amount and source lineage fields |
| `sources` | One retained public statement source | URL, hash, retrieval date, eligibility and limitation |
| `taxonomy_crosswalk` | One source-program classification decision | ministry, payment category, payment detail, category and rationale |
| `evidence_stops` | One documented point where the public trail ends | `payee_id`, `state`, `period`, `source_id`, `limitation` |
| `intermediary_outflows` | One approved intermediary expense component | intermediary, mutually exclusive group, source label, amount and source fields |
| `intermediary-financial-totals.csv` | One agency-wide audited revenue/expense total retained for an intermediary | intermediary, period, revenue and expense totals, source URL/version/retrieval date/hash/page/limitation |

All financial amounts are fixed-precision Canadian dollars represented as decimal text in CSV. DuckDB infers public columns from the CSV release and retains the original decimal strings without binary floating-point conversion.

The 14 categories are project-defined analytical groupings, not Ministry program names. `program_label_status=Category fallback` means the source’s payment detail was `No Value`; the displayed name falls back to the source payment category. `source_payment_detail` and the lineage CSV retain that original source value.

`payment_label_id` identifies a published payee label unless a reviewed organization aggregation is explicitly documented. `entity_id` identifies an authoritative legal or reporting entity. They are not interchangeable. When labels are combined for ranking, the lineage export keeps the original payee name and the reviewed identity status/evidence fields.

“Not itemized” means the source publishes an aggregate or grouped payment without a named recipient in this product’s recipient universe. “Identity unresolved” means the published payee label is kept separate. “Profile not available in this release” describes evidence coverage here; it does not mean no financial statement exists.
