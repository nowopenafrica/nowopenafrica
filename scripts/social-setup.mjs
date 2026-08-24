#!/usr/bin/env node
/**
 * One command to stand up (or check) social publishing.
 *
 *   node scripts/social-setup.mjs check     what is live right now
 *   node scripts/social-setup.mjs deploy    push functions + secrets, then check
 *
 * Why this exists: getting social publishing working needs a migration, two
 * edge functions, eight provider secrets and a callback URL pasted into four
 * different developer consoles. Every one of those is invisible when it is
 * wrong — the panel just says a channel needs setup — so the failure mode was
 * an afternoon of guessing which piece was missing. This tells you.
 *
 * Secrets are read from `.env.social` (gitignored) so they never reach a shell
 * history or a commit. See the template printed by `check` when it is absent.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = resolve(root, '.env.social');

const PROVIDER_SECRETS = {
  'Instagram + Facebook': ['META_APP_ID', 'META_APP_SECRET'],
  LinkedIn: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  X: ['X_CLIENT_ID', 'X_CLIENT_SECRET'],
  TikTok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
};
const PLATFORM_SECRETS = ['SOCIAL_TOKEN_KEY', 'AUTOMATION_SECRET'];
const FUNCTIONS = ['social-auth', 'social-publish', 'publish-due-posts'];

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

function readEnvFile() {
  if (!existsSync(ENV_FILE)) return null;
  const out = {};
  for (const line of readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function projectUrl() {
  // Prefer the linked project ref; fall back to the app's own env.
  const refFile = resolve(root, 'supabase/.temp/project-ref');
  if (existsSync(refFile)) {
    const ref = readFileSync(refFile, 'utf-8').trim();
    if (ref) return `https://${ref}.supabase.co`;
  }
  for (const f of ['.env.local', '.env']) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    const m = /VITE_SUPABASE_URL\s*=\s*(\S+)/.exec(readFileSync(p, 'utf-8'));
    if (m) return m[1].replace(/\/$/, '');
  }
  return null;
}

function anonKey() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(root, f);
    if (!existsSync(p)) continue;
    const m = /VITE_SUPABASE_ANON_KEY\s*=\s*(\S+)/.exec(readFileSync(p, 'utf-8'));
    if (m) return m[1];
  }
  return null;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });
}

async function check() {
  const url = projectUrl();
  const key = anonKey();
  console.log(c.b('\nNowOpen social publishing — status\n'));

  if (!url) {
    console.log(c.bad('  ✗ No Supabase project found.'));
    console.log(c.dim('    Link one with `npx supabase link`, or set VITE_SUPABASE_URL.\n'));
    return 1;
  }
  console.log(`  project  ${c.dim(url)}\n`);

  // 1. Is the auth function deployed and answering?
  let caps = null;
  const capsUrl = `${url}/functions/v1/social-auth?action=capabilities`;
  try {
    const res = await fetch(capsUrl, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
    if (res.ok) caps = await res.json();
    else console.log(c.bad(`  ✗ social-auth answered ${res.status}.`));
  } catch {
    console.log(c.bad('  ✗ social-auth is not reachable — it is probably not deployed.'));
    console.log(c.dim('    Fix: node scripts/social-setup.mjs deploy\n'));
  }

  // Channel readiness needs the function, but everything below does not —
  // and when nothing is deployed the secret template and callback URL are
  // the most useful things to print, so never bail before them.
  let live = 0;
  if (caps) {
    console.log(c.ok('  ✓ social-auth is deployed and answering.\n'));
    console.log(c.b('  Channels'));
    for (const [label, secrets] of Object.entries(PROVIDER_SECRETS)) {
      const keys = label === 'Instagram + Facebook' ? ['instagram', 'facebook'] : [label.toLowerCase()];
      const ready = keys.every((k) => caps.configured?.[k] === true);
      if (ready) live += keys.length;
      console.log(ready
        ? `    ${c.ok('✓')} ${label.padEnd(22)} ${c.dim('ready to post')}`
        : `    ${c.warn('•')} ${label.padEnd(22)} ${c.dim(`needs ${secrets.join(' + ')}`)}`);
    }
    console.log('');
  }

  // 3. The callback URL each console needs. Wrong here = every handshake fails.
  // Derivable from the project URL alone, which is exactly what someone
  // needs while registering the apps — before anything is deployed.
  console.log(c.b('  Callback URL to whitelist (must match exactly)'));
  const uris = caps?.redirectUris
    ? [...new Set(Object.values(caps.redirectUris))]
    : ['instagram', 'facebook', 'linkedin', 'x', 'tiktok']
        .map((prov) => `${url}/functions/v1/social-auth?action=callback&provider=${prov}`);
  for (const u of uris) console.log(`    ${c.dim(u)}`);
  console.log('');

  // 4. Are the other two functions up?
  console.log(c.b('  Functions'));
  for (const fn of FUNCTIONS) {
    try {
      const res = await fetch(`${url}/functions/v1/${fn}`, { method: 'OPTIONS' });
      console.log(res.ok
        ? `    ${c.ok('✓')} ${fn}`
        : `    ${c.bad('✗')} ${fn} ${c.dim(`(${res.status})`)}`);
    } catch {
      console.log(`    ${c.bad('✗')} ${fn} ${c.dim('(unreachable — not deployed)')}`);
    }
  }
  console.log('');

  // 5. Local secret file, so `deploy` has something to push.
  const env = readEnvFile();
  if (!env) {
    console.log(c.warn('  ! No .env.social found. Create it with the values from each developer console:\n'));
    console.log(c.dim([...Object.values(PROVIDER_SECRETS).flat(), ...PLATFORM_SECRETS]
      .map((k) => `      ${k}=`).join('\n')));
    console.log(c.dim('\n    SOCIAL_TOKEN_KEY and AUTOMATION_SECRET can be any long random strings.'));
    console.log(c.dim('    Generate one: node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"\n'));
  } else {
    const missing = [...Object.values(PROVIDER_SECRETS).flat(), ...PLATFORM_SECRETS].filter((k) => !env[k]);
    console.log(missing.length === 0
      ? c.ok('  ✓ .env.social has every secret.\n')
      : c.warn(`  ! .env.social is missing: ${missing.join(', ')}\n`));
  }

  if (live === 0) {
    console.log(c.warn('  No channel can post yet.'));
    console.log(c.dim('  The Studio will correctly show every channel as "needs setup" until'));
    console.log(c.dim('  at least one provider\'s credentials are set.\n'));
  } else {
    console.log(c.ok(`  ${live} channel(s) can post.\n`));
    console.log(c.dim('  Last step is the cron: point a 5-minute schedule at'));
    console.log(c.dim(`  ${url}/functions/v1/publish-due-posts`));
    console.log(c.dim('  with header  x-automation-key: <AUTOMATION_SECRET>\n'));
  }
  return 0;
}

function deploy() {
  const env = readEnvFile();
  if (!env) {
    console.log(c.bad('\nNo .env.social — run `check` first to see the template.\n'));
    process.exit(1);
  }

  console.log(c.b('\nSetting secrets…\n'));
  // --env-file rather than KEY=VALUE arguments: argv is readable from the
  // process table on a shared machine, and a secret containing a quote or $
  // would need escaping on top of that. The file is covered by .gitignore's
  // `.env*` rule, so it cannot be committed either.
  run('npx', ['supabase', 'secrets', 'set', '--env-file', ENV_FILE]);

  console.log(c.b('\nDeploying functions…\n'));
  for (const fn of FUNCTIONS) {
    // social-auth must skip JWT verification: provider redirects arrive
    // without our token, and the callback trusts only the signed state.
    const args = ['supabase', 'functions', 'deploy', fn];
    if (fn === 'social-auth') args.push('--no-verify-jwt');
    run('npx', args);
  }

  console.log(c.b('\nApplying migrations…\n'));
  run('npx', ['supabase', 'db', 'push']);

  console.log('');
  return check();
}

// process.exit() while fetch keep-alive sockets are still open aborts with a
// libuv assertion on Windows. Setting exitCode lets Node drain and exit.
const mode = process.argv[2] ?? 'check';
if (mode === 'deploy') {
  process.exitCode = (await deploy()) ?? 0;
} else if (mode === 'check') {
  process.exitCode = await check();
} else {
  console.log('Usage: node scripts/social-setup.mjs [check|deploy]');
  process.exitCode = 1;
}
