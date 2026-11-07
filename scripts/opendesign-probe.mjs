#!/usr/bin/env node
/**
 * What OpenDesign on this machine can actually do, right now.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * The published write-ups about driving OpenDesign from a coding agent
 * describe commands this installation does not have. `od skill run --stdin`,
 * `od daemon serve --headless`, `od project list`, `od files read` — all
 * documented somewhere, none of them in 0.25.0's `od --help`. Build against a
 * blog post and you get an integration that fails on the first real call.
 *
 * So nothing here is taken from documentation. It asks the installation.
 *
 * ── WHAT IT ESTABLISHES ──────────────────────────────────────────────────
 *
 *   1. Is OpenDesign installed, and at what version.
 *   2. Is its daemon running, and on which port — which is EPHEMERAL. The
 *      documented default of 7456 was not the port in any observed run, and
 *      an integration that hardcodes it connects to nothing. The port is
 *      discovered from the daemon's own health file (which carries the pid)
 *      and the OS socket table.
 *   3. Whether the daemon answers, and which design systems it can see.
 *   4. Whether NowOpen's own design system is installed and parsed.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 * It starts nothing, generates nothing and spends no model credit. It is
 * read-only by construction, so it is safe to run in a loop, on a schedule,
 * or as the first line of a support conversation.
 *
 *   node scripts/opendesign-probe.mjs            report
 *   node scripts/opendesign-probe.mjs --json     machine-readable
 *   node scripts/opendesign-probe.mjs --require  exit 1 unless fully usable
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const JSON_OUT = process.argv.includes('--json');
const REQUIRE = process.argv.includes('--require');

const HOME = process.env.USERPROFILE || process.env.HOME || '';
const LOCALAPPDATA = process.env.LOCALAPPDATA || join(HOME, 'AppData', 'Local');
const APPDATA = process.env.APPDATA || join(HOME, 'AppData', 'Roaming');

const INSTALL = join(LOCALAPPDATA, 'Programs', 'Open Design');
const DATA_ROOT = join(APPDATA, 'Open Design');

const report = {
  installed: false,
  version: null,
  cli: null,
  daemon: { running: false, pid: null, url: null, reachable: false },
  designSystems: { total: null, nowopen: null },
  notes: [],
};

/* ── 1. Installed? ─────────────────────────────────────────────────────── */

const configPath = join(INSTALL, 'resources', 'open-design-config.json');
if (existsSync(configPath)) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  report.installed = true;
  report.version = cfg.appVersion ?? null;
  report.namespace = cfg.namespace ?? null;
  /*
   * `od` is not a binary on PATH. The config names the daemon CLI entry, and
   * that script is what sets OD_BIN for everything downstream — so this is
   * the authoritative path to the CLI, not a guess at an install location.
   */
  if (cfg.daemonCliEntryRelative) {
    const cli = join(INSTALL, 'resources', cfg.daemonCliEntryRelative);
    if (existsSync(cli)) report.cli = cli;
  }
} else {
  report.notes.push('Open Design is not installed for this user (no resources/open-design-config.json).');
}

/* ── 2. Daemon, and its ephemeral port ─────────────────────────────────── */

function daemonPid() {
  if (!report.namespace) return null;
  const health = join(DATA_ROOT, 'namespaces', report.namespace, 'data', 'diagnostics', 'daemon-health.json');
  if (!existsSync(health)) return null;
  try {
    const h = JSON.parse(readFileSync(health, 'utf8'));
    return h.state === 'running' ? h.pid ?? null : null;
  } catch {
    return null;
  }
}

/**
 * The listening port for a pid, from the OS rather than from a config file.
 *
 * The daemon does not write its port anywhere readable — `od mcp` rediscovers
 * it at every spawn for exactly this reason. The socket table is the only
 * source that is true at the moment you ask.
 */
function listeningPort(pid) {
  if (!pid) return null;
  try {
    const out = process.platform === 'win32'
      ? execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
      : execFileSync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', String(pid)], { encoding: 'utf8' });
    for (const line of out.split('\n')) {
      if (!line.includes(String(pid))) continue;
      const m = line.match(/127\.0\.0\.1:(\d+)/);
      if (m && new RegExp(`\\b${pid}\\s*$`).test(line.trim())) return Number(m[1]);
    }
  } catch {
    /* netstat/lsof missing or refused — fall through to the default below. */
  }
  return null;
}

const pid = daemonPid();
report.daemon.pid = pid;
report.daemon.running = pid !== null;

const port = listeningPort(pid);
const url = process.env.OD_DAEMON_URL
  || (port ? `http://127.0.0.1:${port}` : 'http://127.0.0.1:7456');
report.daemon.url = url;
if (!port && pid) {
  report.notes.push(`Daemon pid ${pid} is running but its port could not be read from the socket table; falling back to ${url}, which is usually wrong.`);
}

/* ── 3 & 4. Does it answer, and what can it see? ───────────────────────── */

async function probe() {
  if (!report.daemon.running) {
    report.notes.push('Daemon is not running. Start Open Design, or let `od mcp` start it headlessly.');
    return;
  }
  try {
    const res = await fetch(`${url}/api/design-systems`, { signal: AbortSignal.timeout(8000) });
    report.daemon.reachable = res.ok;
    if (!res.ok) {
      report.notes.push(`Daemon answered ${res.status} on /api/design-systems.`);
      return;
    }
    const body = await res.json();
    const list = Array.isArray(body) ? body : (body.designSystems ?? body.items ?? body.data ?? []);
    report.designSystems.total = list.length;
    const mine = list.find((d) => String(d.id ?? '').endsWith('nowopen-africa'));
    report.designSystems.nowopen = mine
      ? { id: mine.id, status: mine.status ?? null, swatches: mine.swatches ?? [] }
      : null;
    if (!mine) {
      report.notes.push('NowOpen\'s design system is not installed. Copy design-systems/nowopen-africa into the Open Design data directory.');
    }
  } catch (err) {
    report.daemon.reachable = false;
    report.notes.push(`Could not reach the daemon at ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await probe();

/* ── Output ────────────────────────────────────────────────────────────── */

/* Everything that must be true for a generation run to be possible at all. */
const usable = report.installed && report.cli !== null
  && report.daemon.running && report.daemon.reachable
  && report.designSystems.nowopen !== null;

if (JSON_OUT) {
  console.log(JSON.stringify({ ...report, usable }, null, 2));
} else {
  const yn = (v) => (v ? '✓' : '✗');
  console.log('');
  console.log(`  ${yn(report.installed)} installed            ${report.version ?? '—'}`);
  console.log(`  ${yn(report.cli !== null)} cli                 ${report.cli ? 'od → ' + report.cli.split(/[\\/]/).slice(-1)[0] : 'not found'}`);
  console.log(`  ${yn(report.daemon.running)} daemon running      ${report.daemon.pid ? 'pid ' + report.daemon.pid : '—'}`);
  console.log(`  ${yn(report.daemon.reachable)} daemon reachable    ${report.daemon.url}`);
  console.log(`  ${yn(report.designSystems.nowopen !== null)} nowopen-africa      ${
    report.designSystems.nowopen
      ? `${report.designSystems.nowopen.id} (${report.designSystems.nowopen.status}) of ${report.designSystems.total} systems`
      : 'not installed'}`);
  for (const n of report.notes) console.log(`\n  ! ${n}`);
  console.log('');
  /*
   * Said every time, because it is the fact most likely to be forgotten
   * between reading this output and designing something on top of it.
   */
  console.log('  The daemon binds to 127.0.0.1 and holds no multi-tenant auth.');
  console.log('  It is an operator workstation, not a backend the website can call.');
  console.log('');
}

if (REQUIRE && !usable) process.exit(1);
