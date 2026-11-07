# Financial reports, receipts, and CSV export

## Receipt configuration

Set these environment values for the backend before issuing receipts:

| Variable | Meaning |
| --- | --- |
| `INSTITUTE_NAME` | Name printed on receipts |
| `INSTITUTE_ADDRESS` | Address printed on receipts |
| `INSTITUTE_GST_TAXABILITY` | `NOT_CONFIGURED` (default), `TAXABLE`, or `NON_TAXABLE` |
| `INSTITUTE_GST_RATE_BPS` | Required integer basis points when taxability is `TAXABLE`; for example, a configured `1800` means 18%. No value is supplied by this module. |
| `INSTITUTE_GST_TREATMENT` | Required `INCLUSIVE` or `EXCLUSIVE` when taxability is `TAXABLE` |

The module does not decide whether the institute or a fee is taxable, the legal rate, or the applicable treatment. Confirm those values with the institute's tax adviser before configuration. With `NOT_CONFIGURED`, receipt GST values are blank and the receipt states that GST is not configured; this is not a representation that the payment is non-taxable. `NON_TAXABLE` must be explicitly configured to show zero GST. Inclusive tax is extracted from the paid amount; exclusive tax is added to the configured fee base as a displayed gross amount. The receipt separately preserves the actual amount collected.

Receipt institute and GST configuration is copied into each receipt at its first issue. A receipt is created lazily when an authorized user requests it or when an export needs its receipt number. The unique payment reference prevents duplicate receipts. Receipt snapshots are not recalculated when fee plans, student records, or environment configuration changes.

## API routes

- `GET /api/receipts/payment/:paymentId` — issue or retrieve the receipt for a successful payment. Parent access checks current ownership and active `STUDENT_DATA_PROCESSING` consent; Accounts access checks the assigned centre.
- `GET /api/receipts/student/:studentId?page=1&limit=20` — list successful-payment receipts for a student with the same ownership/centre checks.
- `GET /api/receipts/:receiptId` — retrieve a previously issued receipt with current ownership/consent or centre authorization.
- `GET /api/reports/accounts/options` — authorized centres and their batches for report filters.
- `GET /api/reports/accounts/receipt-configuration` — configured institute and GST receipt fields.
- `GET /api/reports/accounts/fee-collection` — billed, collected, outstanding, and overdue totals.
- `GET /api/reports/accounts/payment-collections` — successful payment totals, groupings, and paginated transactions.
- `GET /api/reports/accounts/outstanding-dues` — paginated unpaid instalments and overdue totals.
- `GET /api/reports/accounts/refunds` — paginated refund requests and status totals.
- `GET /api/reports/accounts/tally.csv` — CSV export of successful payments and processed refunds.

Report filters are `centreId`, `batchId`, `startDate`, `endDate`, `paymentMethod`, `page`, and `limit` where relevant. Dates use inclusive UTC calendar days. Fee collection retains the existing dashboard semantics and filters fee plans by `FeePlan.createdAt`; payment collections filter `Payment.paidAt`; dues filter instalment `dueDate`; refund report filters request `createdAt`; processed refund CSV rows filter `processedAt`.

## CSV columns and suggested Tally mapping

The CSV is UTF-8 with a BOM, uses stable headers, and includes a `source_record_id` that remains stable across exports to help an importer detect already-seen source records. It is accounting data for mapping/reconciliation and has not been verified as a native Tally import format.

| CSV column | Suggested Tally use |
| --- | --- |
| `source_record_id` | Type-prefixed external reference / idempotency key (`PAYMENT:<id>` or `REFUND:<id>`); do not create a second voucher for a previously imported value |
| `record_type` | Voucher class: `PAYMENT` or `REFUND` |
| `transaction_date` | Voucher date |
| `receipt_number` | Voucher number/reference for payment receipts; refund transaction reference for refund rows |
| `student_reference`, `student_name` | Party/ledger reference; map to institute ledger names after reconciliation |
| `centre`, `batch` | Cost centre / cost category dimensions |
| `payment_method` | Bank/cash ledger suggestion; refund rows use `REFUND` |
| `status` | Source status; only `SUCCESS` payments and `PROCESSED` refunds are exported |
| `amount_paise`, `amount_inr` | Transaction amount in exact paise and display rupees; refund rows are separate positive refund entries |
| `gst_taxability`, `gst_rate_bps`, `gst_treatment` | Tax classification metadata from receipt configuration |
| `gst_amount_paise`, `gst_amount_inr` | Configured GST snapshot for payment receipts; blank when unavailable or not configured |

Refunds are exported as separate rows rather than silently netted against collections. The CSV export is audited. All report APIs and exports are limited to the Accounts user's assigned centres.
