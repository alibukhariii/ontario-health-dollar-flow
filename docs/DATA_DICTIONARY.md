# Data dictionary

The downloadable database and CSV archive contain the following tables.

| Table | Unit | Important fields |
| --- | --- | --- |
| `payments_named` | One positive published payment line to a non-person named payee | `payment_line_id`, `payment_label_id`, `ministry`, `payment_detail`, `category_id`, `amount_cad`, `source_url` |
| `payments_non_itemized` | One aggregated non-identifying amount by source program | `ministry`, `payment_detail`, `category_id`, `amount_cad`, `evidence_stop` |
| `categories` | One analytical funding purpose | `category_id`, `category_label`, `amount_cad`, `share_percent` |
| `programs` | One source-native program within a category and ministry | `program_id`, `program_label`, `category_id`, `amount_cad` |
| `payees` | One public ranked payee or verified legal organization | `payment_label_id`, `display_label`, `payee_type`, `published_payment_total_cad`, `global_rank` |
| `payee_aliases` | One published label attached to a public payee ID | `payee_id`, `published_label`, `identity_status` |
| `recipient_routes` | One ministry-category-program route into a payee | `payee_id`, `ministry`, `category_id`, `program_label`, `amount_cad` |
| `recipient_category_contributions` | One category’s contribution to a payee’s published total | `payee_id`, `category_id`, `amount_cad` |
| `financial_observations` | One approved source-native financial-statement observation | entity, period, statement class, source label, normalized amount and source lineage fields |
| `sources` | One retained public statement source | URL, hash, retrieval date, eligibility and limitation |
| `taxonomy_crosswalk` | One source-program classification decision | ministry, payment category, payment detail, category and rationale |
| `evidence_stops` | One documented point where the public trail ends | `payee_id`, `state`, `period`, `source_id`, `limitation` |
| `intermediary_outflows` | One approved intermediary expense component | intermediary, mutually exclusive group, source label, amount and source fields |

All financial amounts are fixed-precision Canadian dollars represented as decimal text in CSV. DuckDB infers public columns from the CSV release and retains the original decimal strings without binary floating-point conversion.

`payment_label_id` identifies a published payee label unless a verified organization aggregation is explicitly documented. `entity_id` identifies an authoritative legal or reporting entity. They are not interchangeable.
