#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INITIAL_TEMP_PASSWORD'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.INITIAL_TEMP_PASSWORD.length < 12) {
  console.error('INITIAL_TEMP_PASSWORD must contain at least 12 characters.');
  process.exit(1);
}
if (process.argv.includes('--confirm') === false) {
  console.error(
    'Dry safety stop: review scripts/accounts.example.json, then rerun with --confirm.',
  );
  process.exit(2);
}

const configPath = new URL('../config/accounts.example.json', import.meta.url);
const accounts = JSON.parse(await (await import('node:fs/promises')).readFile(configPath, 'utf8'));
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const account of accounts) {
  const username = account.username.trim().toLowerCase();
  const email = `${username}@owners.mukunda-enclave.invalid`;
  const { data: existing } = await client
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle();
  if (existing) {
    console.log(`Skipped existing account: ${username}`);
    continue;
  }
  const { data: created, error } = await client.auth.admin.createUser({
    email,
    password: process.env.INITIAL_TEMP_PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !created.user) throw error ?? new Error(`Could not provision ${username}`);
  const flatId = account.flatNumber
    ? (await client.from('flats').select('id').eq('flat_number', account.flatNumber).single()).data
        ?.id
    : null;
  const { error: profileError } = await client.from('profiles').insert({
    id: created.user.id,
    username,
    flat_id: flatId,
    owner_name: account.ownerName,
    role: account.role,
    account_status: 'active',
    must_change_password: true,
  });
  if (profileError) {
    await client.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }
  console.log(`Provisioned: ${username} (password change required)`);
}
