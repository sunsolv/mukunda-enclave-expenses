# Deployment status

Status date: 28-07-2026

## Completed and verified

- Production Angular environment configured with the Supabase project URL and publishable key.
- `.env.local` remains git-ignored and restricted to local use.
- No service-role key, Supabase access token, or database password is present in the frontend.
- Clean dependency installation completed.
- Prettier formatting check passed.
- ESLint passed.
- Angular unit tests passed: 10/10.
- Excel-import tests passed: 4/4.
- Production GitHub Pages build passed with the `/mukunda-enclave-expenses/` base path.
- Browser artifact contains no private Supabase environment-variable names.
- Live anonymous-access checks passed for payments, expenses, documents, audit logs,
  maintenance charges, and private document listing.

## Not yet completed

- Supabase migrations were not applied from this workspace because the private access token and
  database password were not provided here.
- Service-role production inspection and owner-account provisioning were not run.
- The four owner accounts, Emergency Administrator, opening balance, and first yearly assignment
  are not provisioned.
- GitHub repository access is verified with repository-level administrator permission.
- The local `origin` points only to `sunsolv/mukunda-enclave-expenses`.
- GitHub Pages is configured to use GitHub Actions.
- GitHub deployment has not run because the required public repository variables are not present.

## Required GitHub configuration

1. Add repository variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Push the reviewed deployment changes to the `master` branch.
3. Monitor the validation and Pages deployment jobs to completion.

Never add `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, or
`SUPABASE_DB_PASSWORD` to the Angular frontend or the GitHub Pages workflow.
