# Excel migration

No workbook was present in the workspace or supplied attachment during implementation. Therefore
the July ₹12,000 collections / ₹8,649 expenses / ₹3,351 closing balance is a contextual baseline,
not a claimed result from an inspected file.

## Safe workflow

1. Copy the workbook to a private working location outside Git if it contains resident data.
2. Review `config/excel-import.mapping.json` and add exact workbook headers as aliases.
3. Run a dry run:

   ```bash
   npm run import:excel -- --file "/private/path/Mukunda.xlsx" --mode dry-run
   ```

4. Open `migration-output/*-dry-run-report.json`. Review every sheet, hidden row/column, merged
   range, formula count, mapped header, warning, ambiguous row, source reference, and total.
5. Validate strictly:

   ```bash
   npm run import:excel -- --file "/private/path/Mukunda.xlsx" --mode validate
   ```

   Exit code 3 means manual review remains.

6. After written approval, create an immutable normalized backup:

   ```bash
   npm run import:excel -- --file "/private/path/Mukunda.xlsx" --mode final --approved
   ```

   Final mode deliberately creates a reviewed backup and does **not** write production records.
   An authenticated migration operator must apply the backup after resolving all required database
   IDs. This prevents accidental production insertion.

## Column mapping

| Workbook concept         | Database target                         | Rule                                                 |
| ------------------------ | --------------------------------------- | ---------------------------------------------------- |
| Flat/floor               | `flats.flat_number` / `flats.floor`     | Text; never infer a missing flat                     |
| Maintenance amount       | `payments.amount` after charge matching | Positive decimal                                     |
| Billing/payment dates    | `billing_month`, `payment_date`         | Normalize real dates; display DD-MM-YYYY             |
| Expense description/date | `expenses.description`, `expense_date`  | Required for import-ready row                        |
| Paid-to/vendor           | `expenses.vendor_name`                  | Missing value becomes a warning                      |
| Amount paid              | `expenses.amount`                       | Positive decimal                                     |
| Phone                    | `expenses.vendor_phone`                 | Text, preserving digits/leading zero where available |
| Drive receipt link       | `documents.legacy_document_url`         | HTTPS external legacy link only                      |
| Running balance          | migration review only                   | Never financial truth; recalculate                   |
| Sheet/row                | `import_row_references`                 | Preserved with SHA-256 row hash                      |

## Normalization and reconciliation

- Excel serial dates and common DD-MM-YYYY text dates become ISO dates.
- Broken `MINUS()`/`#NAME?` results and manually entered running balances are never imported as
  authoritative totals.
- Collections use individual payment rows only. If flat, month, or payment date is missing, the row
  is warning/ambiguous and must not be invented.
- Recalculated closing balance = reviewed opening balance + normalized collections − normalized
  expenses.
- File checksum + stable row hashes support idempotency. The database also protects batch and row
  duplicates.

## Reconciliation report template

Record:

- source filename and SHA-256;
- sheet/range/header row;
- total, ready, warning, ambiguous, duplicate, skipped, and failed rows;
- normalized collections and expenses;
- reviewed opening and recalculated closing balance;
- last manual workbook balance and difference;
- July baseline differences;
- reviewer, review date, corrections, approval, and final backup checksum.

Do not download legacy Drive files or claim they are private without separate authorization and
permission verification.
