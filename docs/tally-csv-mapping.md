# Tally CSV mapping

Coachify's Accounts Tally export is a CSV convenience export. It is not a native Tally integration and does not post vouchers to an accounting system. Review and reconcile the file with institute accounting policy before import.

## Collection rows

The export uses stable transaction/receipt references and separates refund rows from collections. Amounts originate from integer paise in Coachify and are formatted for currency in the CSV. Reports and exports include successful payment collections; pending and failed payment records are excluded.

| Export concept | Coachify source | Tally review/use |
|---|---|---|
| Voucher/transaction reference | Successful payment transaction ID or receipt number | Use as the external reference and duplicate-check key. |
| Voucher date | Payment/receipt date | Confirm the accounting period before import. |
| Student/party reference | Student ID/name fields provided by the report | Map to the institute's approved party ledger; verify party master naming. |
| Centre | Student's centre | Use for cost-centre/classification mapping if configured by the institute. |
| Amount | Successful payment amount | Reconcile against bank/cash settlement; export is not settlement proof. |
| Refund | Separate refund report rows/state | Map to the institute's approved refund/contra ledger, not collections. |

The exact column headers are defined by `backend/src/services/reports/accountsReports.service.js`; use that implementation as the source of truth when configuring an import template. GST is not inferred by the export. Tax treatment remains subject to institute configuration and applicable accounting review.
