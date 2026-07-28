# Supabase setup

## 1. Create the project

Create one Supabase project in the intended organization and record:

- Project URL
- publishable/anon key
- project reference

The publishable key may be used by Angular but is not an authorization boundary. RLS is mandatory.
Keep the service-role key only in Supabase Function secrets or a secure administrator shell.

Disable public sign-up and email confirmations in Authentication settings. Do not configure social
providers, OTP login, or email password recovery for this application.

## 2. Apply database and Storage setup

Follow `DATABASE_SETUP.md`. The migration creates a private `financial-documents` bucket with a
5 MB limit and JPG/JPEG/PNG/WebP/PDF MIME allow-list. Confirm the bucket remains **Private** in the
dashboard.

## 3. Configure Angular

Put the URL and publishable key into the production build configuration. Do not commit real values.
For local Supabase work, copy the shape of `.env.example` into a git-ignored secret store and inject
the values at build time.

Production must have:

```ts
demoMode: false;
```

The browser signs in with a deterministic internal identity:
`username@owners.mukunda-enclave.invalid`. It is only an Auth identifier, is never presented as the
owner’s real email, and receives no email.

## 4. Provision five accounts

Review `config/accounts.example.json`, replacing placeholder owner names while keeping exactly four
owners plus one Emergency Administrator. Set secrets in the current shell only:

```bash
export SUPABASE_URL='https://PROJECT.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='SECURE_VALUE'
export INITIAL_TEMP_PASSWORD='SECURE_TEMPORARY_VALUE'
npm run provision:accounts -- --confirm
unset SUPABASE_SERVICE_ROLE_KEY INITIAL_TEMP_PASSWORD
```

The script does not print passwords and skips existing usernames. Every created profile has
`must_change_password = true`. The application blocks ordinary authenticated routes until the
password is changed.

Use the service-role bootstrap utility only from a trusted administrator computer. After the first
Emergency Administrator exists, deploy `supabase/functions/manage-owner`; subsequent provision,
activation/deactivation, and resets use that trusted function.

```bash
supabase functions deploy manage-owner --no-verify-jwt=false
supabase secrets set APP_ORIGIN='https://sunsolv.github.io'
```

Supabase automatically provides the project URL and service-role secret to deployed functions.

## 5. Emergency reset

The Emergency Administrator submits a new temporary password to the Edge Function over TLS. The
function changes Auth, sets `must_change_password = true`, and audits only the reset event and
reason. The temporary password is never stored in a table or log. Send it to the owner through a
separate trusted channel.

## 6. Private document flow

1. Create a `documents` metadata row after validating extension, MIME type, and size.
2. Upload to `{year}/{month}/{entityType}/{entityId}/{uuid}.{extension}`.
3. Store only the private path.
4. Request a signed URL with a short expiry when an authorized user previews/downloads it.
5. Replace or logically delete metadata with an audit entry; never expose a permanent public URL.

Historical Drive URLs belong only in `legacy_document_url` with `document_type = 'legacy_link'`.
Their privacy is unknown until Drive permissions are separately verified.
