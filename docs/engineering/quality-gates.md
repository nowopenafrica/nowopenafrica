# Quality gates

What runs, what each gate is actually protecting against, and what nothing is
protecting against yet.

---

## The gates

`npm run verify` = typecheck → lint → `check:all` → tests.
CI runs the same command, then `npm run build`.

### Typecheck — three runtimes, three configs

| config | covers |
|---|---|
| `tsconfig.app.json` | `src` |
| `tsconfig.server.json` | `api/`, `middleware.ts` |
| `tsconfig.edge.json` | `supabase/functions/_shared` |

The second and third exist because code they cover shipped with plain type
errors. Vercel and Supabase both bundle with esbuild, which strips types
rather than checking them, so a type error in a serverless function or an edge
helper reached production in silence. One of them disabled robots.txt
enforcement on a live tool.

### The ten guards

Each encodes a mistake that reached production at least once. Run together by
`scripts/check-all.mjs` in 0.3s.

| guard | stops |
|---|---|
| `csp` | a host fetched from `src` that the production CSP does not allow. Works in dev, fails live. |
| `events` | the analytics event union drifting from the DB constraint that enforces it. |
| `api-imports` | a relative import in `api/` without `.js` — resolves locally, fails on Vercel. |
| `self-category` | the edge copy of the category reader drifting from the browser copy, so the sweep classifies businesses differently from the intake. |
| `wa-link` | the same, for the click-to-chat builder. |
| `edge-syntax` | an edge entrypoint that does not parse. All 34 checked. |
| `migrations` | a migration that is not safe to re-run. All 216 checked. |
| `placements` | pricing SQL that inserts a placement row it cannot then update. |
| `templates` | a design layout with no demonstration copy or no deliverable category. |
| `query-errors` | a NEW Supabase call that discards `error`. 45 existing sites are recorded as a baseline; the count may fall, never rise. |

### Tests

5,863 tests across 405 files, 78s. Vitest + jsdom + Testing Library.
Convention: `src/lib` engines get unit tests, pages get smoke tests in
`src/test/`. Edge `_shared` modules are included — they are plain TypeScript
with no Deno globals, so they run in Node rather than going untested until
deploy.

---

## What is NOT gated

Stated plainly, because a gap you know about is manageable and one you assume
away is not.

| gap | consequence |
|---|---|
| **Edge function entrypoints are syntax-checked, not typechecked.** | A type error in any of the 34 entrypoints ships. `deno check` needs Deno installed. |
| **No RLS or authorization test suite.** | Policy changes are verified by reading SQL. Two separate paths once let any user become admin. |
| **No accessibility gate.** | Contrast in generated designs is asserted by construction, never measured. |
| **No performance budget in CI.** | Bundle size regressions are noticed by hand. |
| **No dependency or secret scanning in CI.** | `npm audit` is run manually. |
| **No error monitoring.** | A production exception is noticed when somebody reports it. |
| **121 components query Supabase directly, almost none track error state.** | A failed query renders as an empty list. The 45 known sites are frozen by the `query-errors` guard, not fixed. See `automation-opportunities.md` item 7. |

Ranked by how much damage the gap can do: RLS/authorization first, then error
monitoring, then edge entrypoint typechecking.

---

## Rules the gates assume

- Never weaken RLS, authentication or validation to make a check pass.
- Never delete or skip a test to make a build green.
- A guard that cannot start is a **failure**, not a pass — `check-all.mjs`
  treats a missing or broken guard script as a failed guard. Tested, not
  assumed: a guard pointed at a file that does not exist, and a guard whose
  own source will not parse, both failed the run and printed what they said.
- `check:all` is read-only. Four of its ten scripts can generate files, and
  every one is invoked in a mode that returns before writing. If you add a
  guard, check it is read-only in the mode you invoke it.
