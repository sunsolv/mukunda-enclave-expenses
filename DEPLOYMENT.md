# Deployment

The only permitted repository is `sunsolv/mukunda-enclave-expenses`. Do not connect this project to
`reddyprasadkv-sunsolv` or silently choose another organization.

## Connect source control

This workspace currently has no remote. First confirm the repository exists and that the installed
GitHub connection can access the `sunsolv` organization. Then:

```bash
git remote add origin https://github.com/sunsolv/mukunda-enclave-expenses.git
git fetch origin
```

If the repository does not exist, obtain explicit confirmation before creating it. If access is
denied, grant the GitHub app access to `sunsolv`; do not fall back to another account.

Use the repository’s branch convention. A normal feature branch would be:

```bash
git switch -c codex/phase-1-implementation
```

No push, pull request, merge, or repository creation is performed by these instructions
automatically.

## GitHub Pages

`.github/workflows/validate-and-deploy.yml`:

- installs with `npm ci`;
- verifies formatting and lint;
- runs Angular and Excel-import tests;
- builds with `/mukunda-enclave-expenses/` as the base path;
- uploads only `dist/mukunda-enclave/browser`;
- deploys only a validated `main` build with least-privilege Pages permissions.

The application uses hash routing, so GitHub Pages reloads are reliable without a server-side SPA
fallback. Enable **GitHub Actions** as the Pages source in repository settings.

The workflow contains no Supabase service-role secret. A frontend publishable key is safe to ship
only because RLS is authoritative. Before the first push, create these GitHub **repository
variables** under Settings → Secrets and variables → Actions → Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The workflow runs `npm run configure:production` to validate and inject those public values without
printing them. It fails closed if either value is absent or if a service-role key is present. Never
create a GitHub variable or secret named `SUPABASE_SERVICE_ROLE_KEY` for this frontend workflow.

## Optional custom domain

No domain is assumed. Supply a verified domain before adding `public/CNAME`; then update
`APP_ORIGIN`, the Angular base URL, and Supabase redirect/origin settings. Enable HTTPS after DNS is
verified.

## Manual release check

1. Verify migrations and RLS in a non-production project.
2. Run `npm ci && npm run format:check && npm run lint && npm run test:all`.
3. Run `npm run build -- --base-href /mukunda-enclave-expenses/`.
4. Confirm the artifact contains static frontend assets only.
5. Push the reviewed branch to `sunsolv`.
6. Verify the actual Actions and Pages deployment before calling it deployed.
