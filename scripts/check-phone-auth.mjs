// Is phone signup actually working?
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// MEASURED 2026-09-22: phone signup was enabled, advertised on /register, and
// had NEVER ONCE SUCCEEDED. 16 accounts existed; zero had a phone number.
// Every attempt died with Twilio error 21212 — a Twilio API Key SID (SK…) had
// been pasted into the sender field, where a Messaging Service SID (MG…) or a
// phone number belongs.
//
// Nothing surfaced that. The dashboard said "Phone: enabled", the settings
// endpoint said `sms_provider: twilio`, and both were true — the provider was
// configured, just not with a value it could send from. A config that reads as
// working and fails on every real attempt is exactly the shape of bug this
// repo keeps finding, so it gets a check rather than a note.
//
// ── USAGE ────────────────────────────────────────────────────────────────
//
//   node scripts/check-phone-auth.mjs            read-only: what is configured
//   node scripts/check-phone-auth.mjs --probe    also attempt a real send
//
// The probe is opt-in because it is a real request to the SMS provider. It
// uses an unassigned number, so no message reaches a person, and a failed send
// creates no user — verified on production: `auth.users` was unchanged after
// the probe that found this bug.
//
// EXIT CODES: 0 configured and (if probed) sending; 1 misconfigured; 2 unable
// to check. Non-zero so CI or a cron can fail on it rather than print into a
// log nobody reads.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(join(root, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : null;
  } catch {
    return null;
  }
}

const URL_ = env('VITE_SUPABASE_URL');
const ANON = env('VITE_SUPABASE_ANON_KEY');

if (!URL_ || !ANON) {
  console.error('✗ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not found.');
  process.exit(2);
}

/*
 * An unassigned number in a valid Nigerian format.
 *
 * Structurally valid so it reaches the provider rather than being rejected by
 * GoTrue's own validation — the whole point is to exercise the send path — and
 * unassigned so nothing arrives on anybody's handset.
 */
const PROBE_NUMBER = '+2348000000000';

const settings = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } })
  .then((r) => r.json())
  .catch(() => null);

if (!settings) {
  console.error('✗ Could not read /auth/v1/settings.');
  process.exit(2);
}

const phoneEnabled = settings?.external?.phone === true;
const provider = settings.sms_provider ?? '(none)';
const autoconfirm = settings.phone_autoconfirm === true;

console.log('Phone auth');
console.log(`  provider         : ${provider}`);
console.log(`  phone enabled    : ${phoneEnabled ? 'yes' : 'NO'}`);
console.log(`  otp required     : ${autoconfirm ? 'NO — phone_autoconfirm is on' : 'yes'}`);

let bad = false;

if (!phoneEnabled) {
  console.error('\n✗ Phone provider is disabled, but /register offers phone signup.');
  bad = true;
}

/*
 * phone_autoconfirm would mean anybody can claim any number without proving
 * they hold it. It is a development convenience and a takeover vector in
 * production: an account keyed to a phone number nobody verified.
 */
if (autoconfirm) {
  console.error('\n✗ phone_autoconfirm is ON — numbers are trusted without an OTP.');
  bad = true;
}

if (process.argv.includes('--probe')) {
  console.log(`\nProbing the send path with ${PROBE_NUMBER} (unassigned)…`);
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PROBE_NUMBER, password: `Probe-${Date.now()}-x9!` }),
  });
  const body = await res.json().catch(() => ({}));

  if (body?.error_code === 'sms_send_failed' || /sending.*otp/i.test(body?.msg ?? '')) {
    console.error(`\n✗ The provider refused to send: ${body.msg}`);
    /*
     * 21212 is the specific failure this script was written for, so it gets
     * the specific fix rather than a generic "check your config".
     */
    if (/21212|invalid from/i.test(body.msg ?? '')) {
      console.error(
        '\n  Twilio 21212 — the sender is not a valid caller ID.\n'
        + '  Supabase Auth → Providers → Phone → Twilio "Message Service SID" must be\n'
        + '  either a Messaging Service SID (MG…) or a Twilio number in E.164 (+234…).\n'
        + '  An API Key SID (SK…) is NOT a sender and will fail every send.',
      );
    }
    bad = true;
  } else if (res.status >= 400) {
    console.error(`\n✗ Signup refused (${res.status}): ${body?.msg ?? JSON.stringify(body)}`);
    bad = true;
  } else {
    /*
     * A success here means a real OTP was sent and an unconfirmed user now
     * exists for the probe number. Say so loudly — a check that quietly
     * litters the user table is worse than no check.
     */
    console.log(`\n✓ The provider accepted the send.`);
    /*
     * GoTrue STRIPS THE LEADING "+". It stores "2348000000000", not
     * "+2348000000000", so a cleanup query written with the plus matches
     * nothing and silently leaves the row behind. This printed exactly that
     * query once, and the resulting "no user was created" reading was wrong —
     * the user had existed the whole time.
     */
    const stored = PROBE_NUMBER.replace(/^[+]/, '');
    console.log(`  NOTE: an unconfirmed user for ${PROBE_NUMBER} now exists. Delete it:`);
    console.log(`  delete from auth.users where phone = '${stored}' and phone_confirmed_at is null;`);
    console.log('  (no leading "+" — that is how GoTrue normalises it on the way in)');
  }
}

if (bad) {
  console.error('\nPhone signup is NOT working.');
  process.exit(1);
}
console.log('\n✓ Phone auth configuration looks correct.');
