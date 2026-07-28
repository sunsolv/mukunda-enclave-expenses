#!/usr/bin/env node
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required for live security verification.');
  process.exit(1);
}

const anonymous = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const protectedTables = ['payments', 'expenses', 'documents', 'audit_logs', 'maintenance_charges'];
let failed = false;
for (const table of protectedTables) {
  const { data, error } = await anonymous.from(table).select('*').limit(1);
  if (!error && data?.length) {
    console.error(`FAIL: anonymous user read data from ${table}`);
    failed = true;
  } else {
    console.log(`PASS: anonymous read blocked for ${table}`);
  }
}

const { data: publicFiles, error: storageError } = await anonymous.storage
  .from('financial-documents')
  .list('', { limit: 1 });
if (!storageError && publicFiles?.length) {
  console.error('FAIL: anonymous user listed private financial documents');
  failed = true;
} else {
  console.log('PASS: anonymous private document listing blocked');
}

if (failed) process.exit(2);
console.log(
  'Anonymous-access checks passed. Run supabase/tests/rls_verification.sql and the documented owner fixtures for full role-negative tests.',
);
