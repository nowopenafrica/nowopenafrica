# Development workflow

Two commands. One is for while you work, the other is for before you deploy.
They are not interchangeable.

```bash
npm run verify:quick    # the fast read — seconds
npm run verify          # the gate — must pass before a deploy
```

---

## The fast read

```bash
npm run verify:quick                    # whatever has changed against HEAD
npm run verify:quick -- src/lib/x.ts    # specific files
```

It runs the same *kinds* of check, scoped to what changed:

| | |
|---|---|
| guards | all ten (0.3s — scoping them would save nothing) |
| typecheck | incremental, whole project |
| lint | the changed files, cached |
| tests | the test files that reach the changed modules |

**Measured 2026-10-20**, one changed leaf module (`src/lib/create/money.ts`):
**5.3s**, against 132s for the full gate.

It scales with the blast radius of the change, which is the point — a hub
module pulls in more tests than a leaf one. `vitest related src/lib/create/money.ts`
is 2 files and 24 tests; `vitest related src/lib/designTemplates.ts` is 30
files and 559 tests, because that is genuinely how far that module reaches.

Above 60 changed TypeScript files it refuses and tells you to run the gate,
because at that point "what changed" has stopped carrying information.

### What it cannot see

It follows the import graph. A test that breaks through a path the import
graph does not describe — a fixture, a snapshot of rendered output, a route
table read at runtime, a generated file — will not be selected. **This is why
it is not the gate.**

---

## The gate

```bash
npm run verify    # typecheck → lint → 10 guards → 5,863 tests
```

Everything, over the whole repository. Required before `npx vercel deploy --prod`,
and the same command CI runs, so the two cannot drift.

`npm run build` additionally runs the guards and a production Vite build.
`verify` does **not** include the build, so run it too before a release.

---

## Why it got faster

**Measured 2026-10-20, cold, one `npm run` per step:**

| step | before | after | how |
|---|---:|---:|---|
| typecheck | 31.9s | **4.4s** warm | `incremental` + a build info file |
| lint | 15.0s–21.8s | **2.6s** warm | `--cache` |
| 9 guards | 6.9s | **0.3s** | one process, run concurrently |
| tests | 77.9s | 64.3s | unchanged (run-to-run variance) |
| **total** | **132s** | **74.5s** warm, measured end-to-end | |

The guard number is the one worth understanding: those nine scripts do their
real work in 54–190ms each. The other ~600ms apiece was the `npm run` wrapper,
paid nine times, in series. `scripts/check-all.mjs` spawns them concurrently
in one process. A tenth guard has since been added and all ten together still
cost 0.3s — adding a guard is now effectively free, which is the point.

### Are the caches safe?

Both invalidate on file **content**, not on a timestamp.

ESLint's cache was not taken on trust — it was tested. With a warm cache, a
rule added to `eslint.config.js` was picked up immediately and reported 3,987
new errors. The cache does not survive a config change.

TypeScript's build info is keyed on file versions; deleting
`node_modules/.cache/` costs one slow run and nothing else. It is a cache, not
state, and it is inside `node_modules`, which is already ignored by git.

---

## Before you deploy

```bash
npm run verify
npm run build
npx vercel deploy --prod
```

**The deploy is `npx vercel deploy --prod`, not `git push`.** Pushing to `main`
runs CI; it does not ship anything. Git state never tells you what is live —
check the live site.

---

## Database changes

- Write a migration in `supabase/migrations`. `check:migrations` requires
  every file to be safe to re-run.
- Live SQL: `npx supabase db query --linked --file <path>`.
- A hand-applied migration **must** be recorded in
  `supabase_migrations.schema_migrations`, or the ledger drifts.
- `npm run check:drift` measures drift against the live schema. Measure before
  assuming drift is the cause of anything.
- Dev and production share one Supabase project. **Every `npm run dev` writes
  to production.**
