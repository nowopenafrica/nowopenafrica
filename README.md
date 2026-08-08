# NowOpen Africa

**Africa's Business Growth Infrastructure** — discover businesses, connect with them, transact, and grow. An AI-native business operating system: marketplace + advertising + media + creative studio + business intelligence + AI workforce.

## Stack

- **Frontend:** Vite 5, React 18, TypeScript (strict), Tailwind CSS 3, React Router 6, lucide-react
- **Backend:** Supabase (Auth, Postgres, Storage, Edge Functions), Paystack (payments), Resend (email), Meta WhatsApp Cloud (messaging)
- **AI:** server-side edge functions with a provider-agnostic LLM layer (Groq → OpenRouter → Anthropic), image generation (Hugging Face → Replicate), real social publishing (Instagram / Facebook / LinkedIn / X / TikTok)
- **Deploy:** Vercel (SPA + strict CSP). CI on GitHub Actions runs typecheck → lint → test → build.

## Getting started

1. `npm install`
2. Copy `.env.example` → `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (required). `VITE_PAYSTACK_PUBLIC_KEY` is optional; checkout degrades gracefully until set. Stock footage is optional too — the Pexels key is a Supabase Edge Function secret (`PEXELS_API_KEY`), never a `VITE_` var, and reels fall back to designed graphics until it's configured.
3. `npm run dev`

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (port from `PORT`, default 5173) |
| `npm run typecheck` | `tsc --noEmit` against `src` |
| `npm run lint` | ESLint (flat config, typescript-eslint) |
| `npm run test` | Vitest full suite (jsdom) |
| `npm run check:csp` | Fails if `src` references a host missing from the Vercel CSP |
| `npm run build` | check:csp + typecheck + production build |
| `npm run verify` | typecheck + lint + check:csp + test |

## Repository layout

```
src/
  pages/         route-level pages (lazy-loaded)
  components/    layout, auth, dashboard, studio, admin (Admin Creator OS)
  lib/           domain engines + AI integrations (pure, unit-tested)
  data/          taxonomies, pricing, curated/demo sample data
  contexts/      Theme, Currency, Auth providers
  hooks/         shared React hooks
  test/          integration smoke tests
supabase/
  migrations/    SQL schema + RLS + triggers (apply with `supabase db push`)
  functions/     edge functions (chatbot, payments, social, AI, automations)
scripts/         build/CSP checks + SQL tooling
```

## Important conventions

- **Demo data is DEV-only**: `src/data/populateData.ts` gates sample businesses/adverts/media behind `import.meta.env.DEV`, so production builds never show fabricated listings.
- **Honest integrations**: payments capture reservations until `VITE_PAYSTACK_PUBLIC_KEY` is set; social publishing simulates until provider secrets exist; AI video falls back to designed graphics. Never claim a provider call succeeded when it didn't.
- **Keys stay server-side**: real API keys are Supabase Edge Function secrets, never `VITE_` vars.

## Going live

See `LAUNCH.md` (deploy runbook, env setup, social OAuth, EAS mobile builds) and `PRODUCT-AUDIT.md` (principal-level audit and open blockers).
