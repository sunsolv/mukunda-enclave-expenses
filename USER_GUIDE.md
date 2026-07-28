# User guide

## Sign in

Enter your flat number or assigned username and password. There is no public registration or
“Forgot password.” Ask the Emergency Administrator for a temporary reset if needed. A temporary
password immediately opens the mandatory password-change screen.

The application signs out after 15 minutes without activity.

## Every owner can

- See apartment billed, collected, pending, and approved-expense totals.
- Review charges, verified payments, approved expenses, reports, documents, and handover history.
- Upload payment proof only for their own flat.
- Download authorized receipts, bills, and reports.
- Change their password.

Owners cannot edit financial history or another flat’s proof.

## Current Maintenance Administrator

### Generate charges

Open **Monthly maintenance**, choose the month and due date, review the four active flats, then
confirm. Existing non-cancelled charges for that flat/month are protected from duplicates.

### Record and verify payment

Open **Payments**, choose a flat and outstanding month, enter the date, amount, mode, reference, and
optional proof. Payments begin as pending. Verification checks the current balance, applies the
payment, and generates a database receipt number. Rejection requires a reason.

Only verified, non-cancelled payments count as collections.

### Add an expense

Open **Expenses**, enter the bill details, and save a draft or submit it. A pending expense needs a
clear approval confirmation. Rejection and cancellation require reasons. Only approved,
non-cancelled expenses count in totals.

### Reports

Open **Reports**, select a report and period, adjust the dates if needed, preview, then download
PDF, XLSX, or CSV. Use the browser’s print action for a print-friendly view.

### Annual handover

Open **Responsibility** and select **Begin annual handover**. Review opening balance + verified
collections − approved expenses, choose the next flat, confirm the exact closing balance, and add
meaningful notes. Production executes this in one database transaction. The previous manager
becomes read-only and the next becomes current.

## Emergency Administrator

Use this account only for provisioning, activation/deactivation, secure temporary-password resets,
responsibility corrections, critical settings, and exceptional audited reopening. It is not the
normal daily accounting account.

## Documents

New documents use private Supabase Storage. A preview/download URL expires quickly. Historical
Google Drive links are labelled legacy; their Drive permissions are not guaranteed by this app.
