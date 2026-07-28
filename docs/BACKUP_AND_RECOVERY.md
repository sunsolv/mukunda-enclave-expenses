# Backup and recovery

## What to back up

- Supabase PostgreSQL, including Auth-linked profile IDs, financial tables, audit logs, import
  references, and responsibility history.
- The private `financial-documents` Storage bucket and object metadata.
- Reviewed normalized Excel migration backups.
- Repository source and versioned SQL migrations.

Never put production database dumps, documents, passwords, or service-role keys in Git.

## Schedule

- Use Supabase automated database backups appropriate to the project plan.
- Take an additional logical backup before migrations, imports, yearly handover corrections, or
  major releases.
- Export private Storage to an encrypted, access-controlled backup at least monthly.
- Test a restore in an isolated project at least twice a year.

## Recovery drill

1. Declare the incident window and stop financial writes.
2. Create a new isolated Supabase project.
3. Restore the database backup, then private Storage using the same object paths.
4. Apply any later reviewed migrations in order.
5. Verify Auth/profile links, RLS, private bucket status, and signed URL access.
6. Reconcile verified collections, approved expenses, opening balance, and closing balance.
7. Compare document metadata counts/checksums and import source hashes.
8. Run SQL and live security verification.
9. Obtain owner/administrator approval before switching production.

## Financial validation after restore

For each responsibility and report period:

```text
closing = opening + verified non-cancelled collections − approved non-cancelled expenses
```

Confirm one current responsibility, no duplicate active flat/month charges, no duplicate receipt
numbers, and no public Storage access. Preserve the old project read-only until recovery is signed
off.
