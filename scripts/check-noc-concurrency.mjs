#!/usr/bin/env node
// NOC concurrency proof: two REAL database sessions spending from one wallet
// at the same time.
//
// Usage:  node scripts/check-noc-concurrency.mjs
//
// scripts/check-noc.sql runs in one session, so it can prove idempotency and
// "no overdraw" but not what happens when two requests race. This script
// opens two sessions through `supabase db query --linked`:
//
//   A  BEGIN; charge the wallet (takes the wallet row lock); hold 40 s; ROLLBACK
//   B  launched 15 s later (the CLI's temporary login role cannot be set up by
//      two processes at once); lock_timeout 3 s; charge the SAME wallet; ROLLBACK
//
// If spends serialise on the wallet lock, B cannot read the balance while A
// holds it and fails with 55P03 (lock_not_available). If B succeeds, two
// spends could both read the same balance — the double spend the lock exists
// to stop — and this script fails.
//
// SAFE: both sessions end in ROLLBACK. The wallet used is an existing one
// with at least one spendable credit; nothing is written to it.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'noc-conc-'));

// The wallet: any user with available credit (chosen inside each session the
// same way, so both sessions target the same row).
const pick = `(select w.user_id from public.credit_wallets w
                where w.balance - coalesce((select sum(r.amount) from public.credit_reservations r
                                             where r.wallet_id = w.id and r.status = 'reserved'), 0) >= 2
                order by w.user_id limit 1)`;

const sessionA = `
begin;
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub', ${pick}::text)::text, true);
set local role authenticated;
select (public.credit_charge('ai.business_description', 'zz-noc-conc-a')).id is not null as a_charged;
reset role;
select pg_sleep(40);
select 'A held the lock and rolled back' as a_result;
rollback;
`;

const sessionB = `
begin;
set local lock_timeout = '3s';
select set_config('request.jwt.claims', json_build_object('role','authenticated','sub', ${pick}::text)::text, true);
set local role authenticated;
select (public.credit_charge('ai.business_description', 'zz-noc-conc-b')).id is not null as b_charged;
rollback;
`;

const fileA = join(dir, 'a.sql');
const fileB = join(dir, 'b.sql');
writeFileSync(fileA, sessionA);
writeFileSync(fileB, sessionB);

function run(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(`npx supabase db query --linked -f "${file}"`, { cwd: ROOT, shell: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
  });
}

const aRun = run(fileA);
await new Promise((r) => setTimeout(r, 15_000));
const bRun = run(fileB);
const [a, b] = await Promise.all([aRun, bRun]);

const aOk = a.code === 0 && /A held the lock/.test(a.out);
const bConnected = !/Failed to connect|LegacyDbConfigConnectTempRoleError/i.test(b.out);
const bBlocked = bConnected && /55P03|lock timeout|lock_not_available|canceling statement due to lock timeout/i.test(b.out);

console.log(`session A: exit ${a.code} after ${a.ms} ms${aOk ? ' (charged, held the lock, rolled back)' : ''}`);
console.log(`session B: exit ${b.code} after ${b.ms} ms${bBlocked ? ' (blocked by A\'s wallet lock: 55P03)' : ''}`);

if (!aOk) {
  console.error('\nFAILED: session A did not run as expected.\n', a.out.trim());
  process.exit(1);
}
if (!bConnected) {
  console.error('\nINCONCLUSIVE: session B could not connect, so nothing was tested. Re-run.\n', b.out.trim());
  process.exit(2);
}
if (!bBlocked) {
  console.error('\nFAILED: session B was not blocked — two spends on one wallet ran at once.\n', b.out.trim());
  process.exit(1);
}
console.log('\nConcurrency check passed: concurrent spends on one wallet serialise on its row lock (both rolled back).');
