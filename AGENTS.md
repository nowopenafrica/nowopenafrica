# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before making changes.

## Working copy

The parent directory `Latest Web UI Updates/` contains **many sibling copies** of this project. The only real working copy is the `- Claude - edit` directory — always scope reads, greps, searches and writes to this directory. Never copy, merge, or "fix" sibling copies.

## Commands

Two that matter. They are not interchangeable.

- `npm run verify:quick` — **while you work.** Typecheck (incremental), lint
  and tests scoped to what changed, plus all ten guards. ~5s for one changed
  leaf module, against 132s for the old full run. Pass paths explicitly with
  `-- src/lib/x.ts`, or let it read the working tree. It follows the import
  graph, so it cannot see a test that breaks through a fixture or a snapshot —
  it is the fast read, not the gate.
- `npm run verify` — **before finishing, always.** typecheck → lint → ten
  guards → the full 5,863-test suite. The same command CI runs.

Also:

- `npm run build` — production build, with the guards. `verify` does not
  include it; run both before a deploy.
- `npm run check:all` — the ten guards alone, 0.3s.
- `npm run test` — full Vitest suite; add/update tests for new lib logic.
- Full command set lives in `package.json`; never guess a linter/test command
  that isn't there.

Background on all of it, including what is deliberately NOT gated, is in
`docs/engineering/` — read `quality-gates.md` before assuming something is
checked.

## Code style

- TypeScript strict, no `any` unless forced by Supabase payloads (warn-level).
- Relative imports only — no path aliases.
- Tailwind utility classes, lucide-react icons, `react-router-dom` `Link`.
- Do **not** add comments unless they explain non-obvious intent (a few explanatory comments are welcome in tricky engine code, matching the existing style).
- No `console.log` in `src` (one straggler was removed; keep it that way).

## Conventions

- **Demo data is DEV-only**: `src/data/populateData.ts` gates sample generators behind `import.meta.env.DEV`. Never present fabricated data as real in production flows.
- **Honest integrations**: if a provider (Paystack, social, AI video/image) is not configured or a call fails, the UI must fall back to a designed/local result and say so. Never fake a successful external call.
- **Keys stay server-side**: real API keys are Supabase Edge Function secrets. `VITE_` env vars in `.env.example` must be typed in `src/vite-env.d.ts`.
- **Persistence**: prefer Supabase tables for user-facing data; `localStorage` keys prefixed `nowopen_` are used by Studio modules and admin tools. When adding a key, keep the prefix and document it.
- **Admin Creator OS**: the 20 `ADMIN_SECTIONS` in `src/lib/adminCreator.ts` must all stay `live`. New admin modules embed `LIVE_MODULES`; embedded Studio tools route through the `open(id)` callback.
- Tests: Vitest + jsdom + Testing Library; lib engines get unit tests, pages get smoke tests in `src/test/`. Keep the full suite green after every change.

## Creative Intelligence Library (NowOpen Create)

Read `docs/creative-intelligence/README.md` before changing anything in Create
that affects how a design looks or is chosen: templates, looks, the brief and
concept engines, the quality rubric.

- The typed registry is `src/lib/create/intel/` (movements, industries,
  archetypes, pairings, photography, request taxonomy, trends).
- Six of the documents are generated from it. After editing the registry run
  `npm run intel:docs`; `intel.test.ts` fails when they differ.
- Principles only: never describe, trace or imitate a specific existing design,
  and never lift assets from a brand, studio, Canva or Freepik.
- Trends are `proposed` until the founder approves them, and each has a
  review-by date that fails the tests once it passes.
- Coolvetica belongs to NowOpen's own interface. Customer designs do not use it.
- A score from the builder or a model is not a review. Only a person's score,
  from rendered screenshots, is recorded in the quality ledger.

## Quality gates in CI

`.github/workflows/ci.yml` runs `npm run verify` then `npm run build` on every
push to `main` and every PR — deliberately the same command you run locally,
so CI and the local gate cannot drift apart. It used to run four steps while
`verify` ran twelve, and seven guards never ran in CI at all.

Passing `npm run verify` locally is required before committing. **The deploy
is `npx vercel deploy --prod`, not `git push`** — CI green does not mean
anything shipped.
