#!/usr/bin/env node
// Cross-checks every external host referenced in src/ against the CSP in
// vercel.json, and fails the build if one isn't allowlisted.
//
// Why this exists: dev has no CSP, so a missing host works locally, passes
// tests, builds clean, and only breaks in production. That is exactly how
// api.pexels.com (stock footage) and open.er-api.com (live currency rates)
// shipped broken — both silently failing for every visitor.
//
// KNOWN BLIND SPOT: hosts that only appear at runtime are invisible here. The
// Pexels video API, for instance, returns file URLs on videos.pexels.com that
// never appear as a literal in source. Those are listed in RUNTIME_HOSTS below
// and checked too — add to it whenever an API hands back URLs on a new host.
//
// Usage:  node scripts/check-csp.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — this project's path contains spaces, which
// pathname leaves percent-encoded.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

// Hosts a response body can point at, which static analysis can't see.
const RUNTIME_HOSTS = [
  { host: 'https://videos.pexels.com', directive: 'media-src', why: 'Pexels video file URLs from api.pexels.com' },
];

// Demo/doc hosts, and localhost (any port) which only appears in dev-only
// branches — never requested from a production origin.
const IGNORE = [/example\.com$/, /schema\.org$/, /^https?:\/\/localhost(:\d+)?$/];

// Hosts the app only ever LINKS to — window.open, href, share intents, an XML
// namespace, our own canonical origin. Navigation is governed by form-action /
// navigate-to, not the fetch directives, so flagging these is noise.
//
// Adding a host here is a deliberate assertion: "this is never fetched." If
// something the code actually loads ends up here, the CSP is the right place
// for it instead — that mistake is exactly what this script exists to catch.
const NAVIGATION_ONLY = new Set([
  'https://facebook.com', 'https://www.facebook.com',
  'https://instagram.com', 'https://www.instagram.com',
  'https://x.com', 'https://twitter.com',
  'https://tiktok.com', 'https://www.tiktok.com',
  'https://youtube.com', 'https://www.youtube.com',
  'https://linkedin.com', 'https://www.linkedin.com',
  'https://www.pinterest.com', 'https://www.threads.net',
  'https://wa.me', 'https://web.whatsapp.com', 'https://t.me',
  'https://nowopenafrica.com', 'https://www.nowopen.africa',
  'http://www.w3.org', // SVG xmlns attribute
  'http://localhost',  // dev-only reference
]);

function loadCsp() {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  for (const block of cfg.headers ?? []) {
    for (const h of block.headers ?? []) {
      if (h.key === 'Content-Security-Policy') return h.value;
    }
  }
  throw new Error('No Content-Security-Policy found in vercel.json');
}

function parseCsp(csp) {
  const out = {};
  for (const part of csp.split(';')) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length) out[bits[0]] = bits.slice(1);
  }
  return out;
}

function allowed(directives, host, directive) {
  const sources = directives[directive] ?? directives['default-src'] ?? [];
  return sources.some((raw) => {
    const s = raw.replace(/\/$/, '');
    if (s === host) return true;
    if (s.startsWith('https://*.')) {
      const suffix = s.slice('https://*.'.length);
      return host.startsWith('https://') && host.slice('https://'.length).endsWith(suffix);
    }
    return false;
  });
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.ts', '.tsx'].includes(extname(name)) && !name.includes('.test.')) acc.push(p);
  }
  return acc;
}

/**
 * Blank out comments so a URL mentioned in prose can't fail the build — code
 * that fetches a host is the only thing that matters here. (This script's own
 * note about the dead image.pollinations.ai endpoint tripped it otherwise.)
 *
 * Replaces comment bodies with spaces rather than deleting them, so reported
 * line numbers still line up with the real file. Only whole-line `//` and `*`
 * comments and `/* … *\/` blocks are stripped — a trailing comment after code
 * is left alone, because naively cutting at `//` would also cut the `//` inside
 * every https:// literal.
 */
function stripComments(text) {
  const blanked = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return blanked
    .split('\n')
    .map((line) => (/^\s*(\/\/|\*)/.test(line) ? ' '.repeat(line.length) : line))
    .join('\n');
}

// Classify by the nearest preceding tag/call in the WHOLE file, not line by
// line — a JSX <iframe> often carries its src two lines below the tag, which a
// per-line scan misreads as an image.
function classify(text, index) {
  const before = text.slice(Math.max(0, index - 400), index).toLowerCase();
  const nearest = (needles) =>
    Math.max(...needles.map((n) => before.lastIndexOf(n)));

  const candidates = [
    ['connect-src', nearest(['fetch(', 'axios', 'new websocket(', '.invoke('])],
    ['frame-src', nearest(['<iframe'])],
    ['media-src', nearest(['<video', '<audio'])],
    ['script-src', nearest(['<script', "createelement('script'"])],
    ['img-src', nearest(['<img', 'image_url'])],
  ].filter(([, at]) => at >= 0);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0][0];
}

// Directives that actually gate a network fetch. An unclassified host must at
// least be known to one of these, or it's unreachable in production.
const FETCH_DIRECTIVES = ['connect-src', 'img-src', 'media-src', 'script-src', 'frame-src', 'font-src'];

const directives = parseCsp(loadCsp());
const gaps = [];
const seen = new Set();

for (const file of walk(SRC)) {
  const text = stripComments(readFileSync(file, 'utf8'));
    // Require a real hostname: a dotted name with a 2+ char TLD, or localhost.
    // A looser pattern matches the `https?://` inside regex literals (e.g.
    // stripProtocol) and reports a bogus "https://." host.
  for (const m of text.matchAll(/https?:\/\/(?:localhost(?::\d+)?|[a-zA-Z0-9][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})/g)) {
    const host = m[0].replace(/\/$/, '');
    if (IGNORE.some((re) => re.test(host))) continue;
    if (NAVIGATION_ONLY.has(host)) continue;
    const directive = classify(text, m.index);
    const key = `${host}|${directive ?? '*'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = text.slice(0, m.index).split('\n').length;
    const where = `${relative(ROOT, file).replace(/\\/g, '/')}:${line}`;

    if (directive) {
      if (!allowed(directives, host, directive)) gaps.push({ host, directive, where });
      continue;
    }
    // Unclassified: a bare constant like `const BASE = 'https://x.example'`,
    // used indirectly later. This is NOT safe to skip — it's how
    // gen.pollinations.ai slipped past an earlier version of this script.
    // Require the host to appear under at least one fetching directive.
    if (!FETCH_DIRECTIVES.some((d) => allowed(directives, host, d))) {
      gaps.push({ host, directive: '(unclassified)', where });
    }
  }
}

for (const { host, directive, why } of RUNTIME_HOSTS) {
  if (!allowed(directives, host, directive)) gaps.push({ host, directive, where: `runtime — ${why}` });
}

if (gaps.length) {
  console.error(`\n✗ CSP is missing ${gaps.length} host${gaps.length === 1 ? '' : 's'}.`);
  console.error('  These work in dev (no CSP) and fail silently in production:\n');
  for (const g of gaps) console.error(`    ${g.directive.padEnd(12)} ${g.host.padEnd(32)} ${g.where}`);
  console.error('\n  Add them to the Content-Security-Policy in vercel.json.\n');
  process.exit(1);
}

console.log(`✓ CSP allows every external host referenced in src/ (${seen.size} checked, plus ${RUNTIME_HOSTS.length} runtime).`);
