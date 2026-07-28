#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missingVariables = required.filter((name) => !process.env[name]?.trim());

if (missingVariables.length) {
  console.error(`Missing environment variables: ${missingVariables.join(', ')}`);
  process.exit(1);
}

const placeholderChecks = [
  /placeholder|your[_-]?project|example/i.test(process.env.SUPABASE_URL),
  /placeholder|your[_-]?anon|example/i.test(process.env.SUPABASE_ANON_KEY),
  /placeholder|your[_-]?service|example/i.test(process.env.SUPABASE_SERVICE_ROLE_KEY),
];
if (placeholderChecks.some(Boolean)) {
  console.error(
    'Supabase production inspection refused because one or more credentials are placeholders.',
  );
  process.exit(1);
}

const expectedTables = [
  'apartment_settings',
  'flats',
  'profiles',
  'maintenance_responsibilities',
  'maintenance_charges',
  'payments',
  'expense_categories',
  'expenses',
  'documents',
  'audit_logs',
  'import_batches',
  'import_row_references',
];
const expectedFunctions = [
  'complete_initial_password_change',
  'audit_session_event',
  'generate_monthly_charges',
  'record_payment',
  'verify_payment',
  'review_expense',
  'cancel_payment',
  'cancel_expense',
  'save_expense',
  'discard_failed_document',
  'complete_annual_handover',
];

const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failed = false;
const tableCounts = {};
for (const table of expectedTables) {
  const { count, error } = await service.from(table).select('id', { count: 'exact', head: true });
  if (error) {
    console.error(`FAIL: ${table} is not queryable through the production API`);
    failed = true;
  } else {
    tableCounts[table] = count ?? 0;
  }
}

const { data: bucket, error: bucketError } = await service.storage.getBucket('financial-documents');
if (bucketError || !bucket) {
  console.error('FAIL: financial-documents bucket is unavailable');
  failed = true;
} else {
  const allowedMimeTypes = new Set(bucket.allowed_mime_types ?? []);
  const expectedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const missingMimeTypes = expectedMimeTypes.filter((mimeType) => !allowedMimeTypes.has(mimeType));
  const bucketValid =
    bucket.public === false &&
    bucket.file_size_limit === 5 * 1024 * 1024 &&
    missingMimeTypes.length === 0;
  console.log(
    `Storage bucket: ${bucketValid ? 'PASS' : 'FAIL'} (private=${bucket.public === false}, limit=5MiB, MIME allow-list=${missingMimeTypes.length === 0})`,
  );
  failed ||= !bucketValid;
}

const { data: profiles, error: profilesError } = await service
  .from('profiles')
  .select('role,account_status,must_change_password,flat_id');
if (profilesError) {
  console.error('FAIL: account profile status could not be inspected');
  failed = true;
}

const safeProfiles = profiles ?? [];
const accountSummary = {
  owners: safeProfiles.filter((profile) => profile.role === 'owner').length,
  emergencyAdministrators: safeProfiles.filter((profile) => profile.role === 'emergency_admin')
    .length,
  active: safeProfiles.filter((profile) => profile.account_status === 'active').length,
  inactive: safeProfiles.filter((profile) => profile.account_status !== 'active').length,
  passwordChangeRequired: safeProfiles.filter((profile) => profile.must_change_password).length,
  ownersWithoutFlat: safeProfiles.filter((profile) => profile.role === 'owner' && !profile.flat_id)
    .length,
};
console.log(`Account profile counts: ${JSON.stringify(accountSummary)}`);

const { data: responsibilities, error: responsibilitiesError } = await service
  .from('maintenance_responsibilities')
  .select('status');
if (responsibilitiesError) {
  console.error('FAIL: maintenance responsibility status could not be inspected');
  failed = true;
}
const currentAdministrators = (responsibilities ?? []).filter(
  (responsibility) => responsibility.status === 'current',
).length;
console.log(`Current Maintenance Administrators: ${currentAdministrators}`);

const { data: authUsers, error: authUsersError } = await service.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (authUsersError) {
  console.error('FAIL: Auth user count could not be inspected');
  failed = true;
} else {
  console.log(`Supabase Auth users: ${authUsers.users.length}`);
}

try {
  const schemaResponse = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      Accept: 'application/openapi+json',
    },
  });
  if (!schemaResponse.ok) {
    console.error('FAIL: production REST schema could not be inspected');
    failed = true;
  } else {
    const schema = await schemaResponse.json();
    const availablePaths = new Set(Object.keys(schema.paths ?? {}));
    const missingTables = expectedTables.filter((table) => !availablePaths.has(`/${table}`));
    const missingFunctions = expectedFunctions.filter(
      (functionName) => !availablePaths.has(`/rpc/${functionName}`),
    );
    console.log(
      `REST schema: ${missingTables.length === 0 && missingFunctions.length === 0 ? 'PASS' : 'FAIL'} (${expectedTables.length - missingTables.length}/${expectedTables.length} tables, ${expectedFunctions.length - missingFunctions.length}/${expectedFunctions.length} functions)`,
    );
    if (missingTables.length || missingFunctions.length) failed = true;
  }
} catch {
  console.error('FAIL: production REST schema endpoint is unreachable');
  failed = true;
}

console.log(`Table counts: ${JSON.stringify(tableCounts)}`);
if (failed) process.exit(2);
