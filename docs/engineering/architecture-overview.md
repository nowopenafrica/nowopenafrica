# Architecture overview

Written 2026-10-20 from the repository itself. Every count in the
**Measured** sections was produced by a command against this working copy on
that date; everything in **Assumed** is judgement and should be challenged.

---

## Measured: what is here

| | |
|---|---|
| Tracked files | 1,183 |
| TypeScript/TSX under `src` | 1,041 files, 218,344 lines |
| Test files | 374 |
| Tests | 5,863 across 405 files |
| Routes in `src/App.tsx` | 63 |
| Vercel serverless functions (`api/`) | 11 |
| Supabase Edge Functions | 34 + `_shared` |
| SQL migrations | 216 |
| Guard scripts (`scripts/*.mjs`) | 21, of which 10 run as gates |

### Where the code lives

```
src/lib/          469 files   engines, pure logic, the bulk of the product
src/components/   288 files   UI, including admin/, dashboard/, studio/, create/
src/test/         146 files   page smoke tests and cross-cutting tests
src/data/          66 files   static catalogues, category config, seed shapes
src/pages/         49 files   route components
src/hooks/         12 files   shared React hooks
src/contexts/       4 files
```

The weight is in `src/lib`. That is deliberate and it is the thing that makes
the suite fast: business rules are pure functions with unit tests, and the
components mostly arrange them.

### Runtimes

There are four, and they are checked by four different things:

| Runtime | Code | Typechecked by |
|---|---|---|
| Browser | `src/` | `tsconfig.app.json` |
| Vercel serverless | `api/`, `middleware.ts` | `tsconfig.server.json` |
| Supabase Edge (Deno) | `supabase/functions/_shared` | `tsconfig.edge.json` |
| Postgres | `supabase/migrations` | `check:migrations`, `check:placements` |

Both server configs carry a comment recording the bug that caused them to
exist. Neither `api/` nor the edge functions were typechecked at all until a
type error shipped and disabled a live robots.txt check. Edge function
*entrypoints* are still only syntax-checked (`check:edge-syntax`), not
typechecked — `deno check` needs Deno on the machine.

### Product areas, as they appear in the tree

- **Business** — `src/pages/BusinessDetail.tsx` (2,784 lines, the largest file
  in the repo), `src/components/dashboard/`, claim and verification flows.
- **Promote Advert** — `advertisements`, placement pricing SQL guarded by
  `check:placements`.
- **Create Media** — `src/lib/create/`, `src/lib/studio/`, `src/lib/design/`,
  `src/components/studio/`, 66 design layouts guarded by `check:templates`.
- **Business Intelligence** — `radar_candidates`, discovery campaigns,
  Instagram intake, enrichment; the most SQL-heavy area.
- **Admin** — `src/pages/AdminDashboard.tsx` (2,452 lines) plus
  `src/components/admin/`, 20 sections registered in `src/lib/adminCreator.ts`.
- **PWA** — `public/sw.js`, `src/lib/pwa/`, `/install`.

### Data access

415 `.from('…')` call sites in `src`, across roughly 90 tables. The busiest:

```
businesses 53 · radar_candidates 27 · users 18 · media_services 13
os_workforce 12 · business_products 11 · advertisements 11
```

There is no repository layer and no query client. Components query Supabase
directly inside `useEffect` — **121 components** do this. See
`automation-opportunities.md`, item 6; this is the single largest source of
repeated code in the project and of one specific recurring bug, now held
in place by the `query-errors` guard.

---

## Assumed: judgements, not facts

- The absence of a data-access layer is the biggest *structural* debt, but
  introducing one wholesale would touch 121 components and is not worth the
  blast radius in one change. The incremental route is a shared hook adopted
  by new code first.
- `BusinessDetail.tsx` and `AdminDashboard.tsx` are large enough to be hard to
  review, but both are mostly flat composition rather than tangled logic, so
  splitting them is lower value than it looks.
- The four-runtime split is correct for the product and should not be
  collapsed.

## Deliberate decisions worth not re-litigating

Recorded here so they are not rediscovered at cost. Each is explained at
length in the file named.

- **Relative imports only**, no path aliases (`AGENTS.md`).
- **`supabase/functions/_shared` is generated in two places** — the sync guards
  (`check:self-category`, `check:wa-link`) exist because the edge copy drifted
  from the browser copy and classified businesses differently.
- **Editing `_shared` changes nothing until every importer is redeployed.**
- **Sample/demo data is `import.meta.env.DEV` only.** Production never serves
  invented businesses.
- **The deploy is `npx vercel deploy --prod`, not `git push`.** Git state does
  not tell you what is live.
