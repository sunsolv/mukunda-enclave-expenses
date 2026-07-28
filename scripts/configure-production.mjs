#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  console.error(`Missing production build variables: ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Refusing to build while SUPABASE_SERVICE_ROLE_KEY is present.');
  process.exit(1);
}

let supabaseUrl;
try {
  supabaseUrl = new URL(process.env.SUPABASE_URL);
} catch {
  console.error('SUPABASE_URL must be a valid URL.');
  process.exit(1);
}

if (supabaseUrl.protocol !== 'https:') {
  console.error('SUPABASE_URL must use HTTPS for production.');
  process.exit(1);
}

const repositoryPath = '/mukunda-enclave-expenses/';
const productionBaseUrl =
  process.env.PRODUCTION_BASE_URL?.trim() || `https://sunsolv.github.io${repositoryPath}`;
const githubPagesBasePath = process.env.GITHUB_PAGES_BASE_PATH?.trim() || repositoryPath;

if (!githubPagesBasePath.startsWith('/') || !githubPagesBasePath.endsWith('/')) {
  console.error('GITHUB_PAGES_BASE_PATH must start and end with "/".');
  process.exit(1);
}

const configuration = `export const environment = {
  production: true,
  appName: 'Mukunda Enclave',
  supabaseUrl: ${JSON.stringify(supabaseUrl.toString().replace(/\/$/, ''))},
  supabaseAnonKey: ${JSON.stringify(process.env.SUPABASE_ANON_KEY.trim())},
  storageBucket: 'financial-documents',
  demoMode: false,
  baseUrl: ${JSON.stringify(githubPagesBasePath)},
  githubPagesBasePath: ${JSON.stringify(githubPagesBasePath)},
  productionBaseUrl: ${JSON.stringify(productionBaseUrl)},
  storageLimitBytes: 1024 * 1024 * 1024,
};
`;

await writeFile(
  new URL('../src/environments/environment.production.ts', import.meta.url),
  configuration,
  { mode: 0o600 },
);

console.log('Production frontend configuration generated without printing credential values.');
