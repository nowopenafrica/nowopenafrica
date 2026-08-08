# AGENTS.md

Guidance for AI coding agents working in this repository. Read this before making changes.

## Working copy

The parent directory `Latest Web UI Updates/` contains **many sibling copies** of this project. The only real working copy is the `- Claude - edit` directory — always scope reads, greps, searches and writes to this directory. Never copy, merge, or "fix" sibling copies.

## Commands (always run before finishing)

- `npm run typecheck` — must pass
- `npm run lint` — must pass
- `npm run test` — full Vitest suite; add/update tests for new lib logic
- `npm run check:csp` — run when touching network calls (new hosts must be added to the Vercel CSP)
- `npm run verify` — all of the above
- Full command set lives in `package.json`; never guess a linter/test command that isn't there.

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

## Quality gates in CI

`.github/workflows/ci.yml` runs typecheck → lint → test → build on every PR to `main`. Passing locally (`npm run verify`) is required before committing.
