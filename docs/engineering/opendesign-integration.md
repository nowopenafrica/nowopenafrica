# OpenDesign — what it is, and the only architecture that works

Phase 1 feasibility record. Established **2026-10-20** by driving the
installation on this machine, not by reading documentation.

Re-check any of it at any time:

```bash
npm run opendesign:probe
```

---

## What is actually installed

| | |
|---|---|
| Product | Open Design (nexu-io), Apache-2.0 |
| Version | **0.25.0**, Electron 41.3.0 / Node 24.15.0 |
| Install | `%LOCALAPPDATA%\Programs\Open Design` |
| Data | `%APPDATA%\Open Design\namespaces\release-stable-win\data` |
| CLI | `node <install>/resources/app/prebundled/daemon/daemon-cli.mjs` — this is `od` |
| Model CLI | `resources/open-design/bin/vela.exe`, signed in as `nowopen2018@gmail.com` |
| Bundled | 152 design systems, ~100 skills, plugin registry |

### The CLI surface that genuinely exists

Taken from `od --help` on 0.25.0:

```
od [--port <n>] [--host <addr>] [--no-open]   start daemon + web UI
od artifacts create --name --input [--project]
od tools live-artifacts | deliverable-syntax | directions | connectors | design-systems
od mcp live-artifacts                          stdio MCP server
od plugin list|info|install|uninstall|apply|doctor|replay|trust
od automation list|get|create|update|run|runs|pause|resume|delete
od research | memory | message-center | amr | ui | share
```

### Commands that are written about but are NOT in this build

Checked because an integration built on them would fail on its first call:

- `od skill run --stdin`
- `od daemon serve --headless`
- `od project list` · `od files list` · `od files read` · `od skills list`
- `od mcp install claude`

Some appear in the upstream README, some in third-party blog posts. **None of
them is in 0.25.0's help output.** Verify against `od --help` before using any
command found in prose.

---

## The three facts that decide the architecture

### 1. The daemon is localhost-only, on an ephemeral port

Measured: pid 55180 listening on **127.0.0.1:53181**. Not 7456 — that is only
the CLI's fallback, and it was wrong in every observed run. `od mcp`
rediscovers the port at every spawn for this reason, and so does the probe
(health file → pid → OS socket table).

There is no multi-tenant auth, no per-customer isolation, no hosted API.

### 2. OpenDesign does not generate anything by itself

From the upstream README: *"It doesn't ship its own agent. It uses the CLIs
already on your PATH."* Generation is a **coding agent** — Claude Code, Codex,
Cursor — driving OpenDesign through its MCP surface, writing HTML/CSS
artifacts into a project which OpenDesign then previews and exports.

`od automation` looked like a job API and is not one. Its six built-in
templates are all context and memory management:

```
ingest-source-memory-tree · extract-design-system · crystallize-run-into-skill
connector-digest-design-context · compress-project-context · promote-artifact-style
```

None of them is "produce a flyer from this brief".

### 3. The daemon cannot be run under plain Node

```
Error: better_sqlite3.node was compiled against NODE_MODULE_VERSION 145.
This version of Node.js requires NODE_MODULE_VERSION 137.
```

It must run inside the signed Electron binary. A server container cannot
simply `node daemon-cli.mjs`.

---

## Therefore

**nowopenafrica.com's servers cannot call OpenDesign.** Not as a limitation to
work around — the product is not built to be called that way, and exposing a
privileged localhost daemon with no tenancy model to the internet would be a
serious mistake.

The supported shape is an **operator production workstation**:

```
  customer brief  →  NowOpen (create_orders)        [the web app, as today]
                         │
                         │  approved job, pulled over an authenticated API
                         ▼
             operator workstation            [Windows/macOS, signed in]
             OpenDesign daemon + coding agent CLI
                         │
                         │  artifacts uploaded back to private storage
                         ▼
                  NowOpen review → customer
```

NowOpen stays the product, the queue and the record. OpenDesign is a tool an
operator runs. Nothing about the customer-facing flow needs to pretend
otherwise.

### What that costs, honestly

- **It is one machine.** Throughput is one operator, serially. This is a
  concierge capability, not self-serve generation, until that changes.
- **Model spend is real and unmeasured.** `vela billing summary` returns
  **403** on this account, so the credit position could not be read. Only one
  model is listed: `deepseek-v4.1-flash` via Open Design AMR. No per-job cost
  figure appears anywhere in this document because none could be measured.
- **The workstation must stay signed in** and is a single point of failure.

---

## What is built, and what is not

### Built and verified

**`design-systems/nowopen-africa/`** — NowOpen's brand as an OpenDesign design
system: `manifest.json`, `DESIGN.md`, `tokens.css`, all 56 schema tokens.

Verified two ways rather than asserted:

1. `manifest.json` parsed by OpenDesign's **own** `parseDesignSystemProjectManifest`
   from `_schema/manifest.schema.ts` → **VALID** for `od-design-system-project/v1`.
   This caught two values invented in the first draft: `source.type` must be
   one of `bundled|local|github|shadcn`, and `importMode` one of
   `normalized|hybrid|verbatim`.
2. Installed into the data directory and listed by the running daemon as
   `user:nowopen-africa` among 153 systems, with the swatches it parsed out of
   `tokens.css` — `#ffffff #e5e7eb #111827 #2563eb` — matching bg / border /
   fg / accent exactly.

Every value in it is read from `tailwind.config.js`, `index.html` and
`src/index.css`. None was chosen for the package.

**`scripts/opendesign-probe.mjs`** — read-only capability probe. Starts
nothing, generates nothing, spends no credit.

### Not built, and why

- **The workstation worker.** It is the next phase and it needs a decision
  first: a customer-facing funnel into a single serial operator machine is an
  operating-model commitment, not a technical one.
- **No new job table.** `create_orders` already holds sku, options,
  `design_route` (`template|upload|ai|creator`), spec, estimate vs quoted
  totals, contact and a seven-state lifecycle. Production runs belong as a
  child of that record, not as a parallel system.

---

## Installing the design system on an operator machine

```bash
# from the repo root, on a machine with Open Design installed
mkdir -p "$APPDATA/Open Design/namespaces/release-stable-win/data/design-systems/nowopen-africa"
cp design-systems/nowopen-africa/* "$_"
npm run opendesign:probe   # should report nowopen-africa among the systems
```

It arrives with status `draft`, which is how the daemon marks user-installed
systems.
