#!/usr/bin/env node
// Fails the build when a migration isn't safe to re-run.
//
// Why this exists: applying scripts/sql/apply_all_migrations.sql to the live
// project aborted with
//
//   ERROR: 42710: policy "Users update their own push token" for table
//   "device_push_tokens" already exists
//
// because that CREATE POLICY had no matching DROP POLICY IF EXISTS. One
// unguarded statement stops the entire script, so every statement after it is
// skipped — which is how a database ends up half-migrated and the app starts
// failing in ways that look unrelated (missing columns, "hours not confirmed").
//
// The rule: anything that can already exist must be dropped (or existence-
// checked) first. That is CREATE POLICY, CREATE TRIGGER, ADD CONSTRAINT,
// CREATE TABLE/INDEX, and seed INSERTs.
//
// Usage:  node scripts/check-migrations.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not URL.pathname — this project's path contains spaces.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const CONSOLIDATED = join(ROOT, 'scripts', 'sql', 'apply_all_migrations.sql');

/**
 * Split SQL on `;`, ignoring separators inside '…' literals, $$…$$ bodies and
 * `--` comments. A naive split reports false failures, because the seed data in
 * this repo contains semicolons inside prose strings.
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let inString = false;
  let inLineComment = false;
  let inDollar = false;

  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      buf += c;
      continue;
    }
    if (inString) {
      buf += c;
      if (c === "'") {
        if (sql[i + 1] === "'") { buf += "'"; i += 1; continue; } // escaped quote
        inString = false;
      }
      continue;
    }
    if (inDollar) {
      buf += c;
      if (two === '$$') { buf += '$'; inDollar = false; i += 1; }
      continue;
    }
    if (two === '--') { inLineComment = true; buf += two; i += 1; continue; }
    if (two === '$$') { inDollar = true; buf += two; i += 1; continue; }
    if (c === "'") { inString = true; buf += c; continue; }
    if (c === ';') { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function auditSql(sql) {
  const dropped = {
    policies: new Set([...sql.matchAll(/DROP\s+POLICY\s+IF\s+EXISTS\s+"([^"]+)"/gi)].map((m) => m[1])),
    triggers: new Set([...sql.matchAll(/DROP\s+TRIGGER\s+IF\s+EXISTS\s+(\w+)/gi)].map((m) => m[1].toLowerCase())),
    // A constraint counts as guarded by an explicit DROP, or by a
    // `WHERE conname = '…'` existence check inside a DO block.
    constraints: new Set([
      ...[...sql.matchAll(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+(\w+)/gi)].map((m) => m[1].toLowerCase()),
      ...[...sql.matchAll(/conname\s*=\s*'(\w+)'/gi)].map((m) => m[1].toLowerCase()),
    ]),
  };

  const problems = [];
  for (const statement of splitStatements(sql)) {
    const flat = statement.split(/\s+/).join(' ').trim();

    let m = /CREATE\s+POLICY\s+"([^"]+)"/i.exec(flat);
    if (m && !dropped.policies.has(m[1])) {
      problems.push(`CREATE POLICY "${m[1]}" — add: DROP POLICY IF EXISTS "${m[1]}" ON <table>;`);
    }

    m = /CREATE\s+TRIGGER\s+(\w+)/i.exec(flat);
    if (m && !dropped.triggers.has(m[1].toLowerCase())) {
      problems.push(`CREATE TRIGGER ${m[1]} — add: DROP TRIGGER IF EXISTS ${m[1]} ON <table>;`);
    }

    m = /ADD\s+CONSTRAINT\s+(\w+)/i.exec(flat);
    if (m && !dropped.constraints.has(m[1].toLowerCase())) {
      problems.push(`ADD CONSTRAINT ${m[1]} — add: DROP CONSTRAINT IF EXISTS ${m[1]};`);
    }

    m = /^\s*INSERT\s+INTO\s+([\w.]+)/i.exec(flat);
    if (m && !/ON\s+CONFLICT|WHERE\s+NOT\s+EXISTS/i.test(flat)) {
      problems.push(`INSERT INTO ${m[1]} — add ON CONFLICT … DO NOTHING, or it duplicates on re-run`);
    }

    for (const kind of ['TABLE', 'INDEX']) {
      const re = new RegExp(`^\\s*CREATE\\s+(?:UNIQUE\\s+)?${kind}\\s+(?!IF\\s+NOT\\s+EXISTS)(\\w+)`, 'i');
      const hit = re.exec(flat);
      if (hit) problems.push(`CREATE ${kind} ${hit[1]} — add IF NOT EXISTS`);
    }
  }
  return problems;
}

const targets = [];
if (existsSync(MIGRATIONS_DIR)) {
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    targets.push(join(MIGRATIONS_DIR, file));
  }
}
if (existsSync(CONSOLIDATED)) targets.push(CONSOLIDATED);

let failures = 0;
for (const path of targets) {
  const problems = auditSql(readFileSync(path, 'utf8'));
  if (problems.length) {
    console.error(`\n${basename(path)}`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    failures += problems.length;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} migration statement(s) would fail or duplicate on a re-run.`
    + '\nOne unguarded statement aborts the whole script and leaves the database'
    + '\nhalf-migrated, so these have to be fixed before applying.\n',
  );
  process.exit(1);
}

console.log(`✓ all ${targets.length} migration file(s) are safe to re-run.`);
