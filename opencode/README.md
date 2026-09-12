# opencode — AI Command Center server package

Deployable package for the OpenCode engine that powers the Admin Creator's AI
Command Center. The engine lives on a managed host (Railway / Render / Fly); the
browser talks to it through the ai-command Edge Function proxy, never directly.

## What it runs — and what it does NOT

- Runs **NowOpen business tools only**: planning, reporting, and the NowOpen
  business operations the AI Command Center exposes. Tool executions go back
  through the same `ai-command` gateway, so Postgres RLS + `is_staff()` scope
  every run to the staff member who asked.
- It is **not** a general coding agent reachable from the public internet: the
  custom bridge tool is the only tool exposed, and the server is protected by
  `OPENCODE_SERVER_PASSWORD`.

## Architecture

```
Browser (Admin Creator)
   │  POST /sb-fn/ai-command  (same-origin proxy: Vite dev / Vercel rewrite)
   ▼
ai-command Edge Function  ──── audit + ai_* ledger (service role)
   │  opencode.create / opencode.run / opencode.proxy (staff JWT checked here)
   ▼
opencode serve (this package, on Railway/Render/Fly)
   │  SDK sessions bound one-to-one with ai_sessions rows
   ▼
.opencode/tools/nowopen.ts  ──▶  POST <SUPABASE_URL>/functions/v1/ai-command
        (custom bridge tool: staff JWT in tool args, RLS-scoped runs)
```

## Files

| Path | Purpose |
| --- | --- |
| `opencode/Dockerfile` | `node:22-slim` + `opencode-ai` + `@opencode-ai/plugin`, runs `opencode serve` on `${PORT:-4096}` |
| `opencode/docker-compose.yml` | Local run (build context = repo root) |
| `opencode/.env.example` | All environment variables the server needs |
| `opencode/README.md` | This file |
| `opencode.json` | Provider + model config (canonical, repo root so local opencode uses it too) |
| `.opencode/tools/nowopen.ts` | Custom bridge tool (auto-discovered by opencode in this project) |

## Quickstart (local)

```bash
# from the repo root
docker compose -f opencode/docker-compose.yml up --build
# health check
curl -u opencode:change-me http://localhost:4096/global/health
```

The OpenAPI spec is served at `http://localhost:4096/doc`.

## Deploy

The build context is the **repo root** (so `opencode.json` + `.opencode/` are
available). Point your host at `opencode/Dockerfile`:

- **Railway** — Root Directory: repo root (blank), Dockerfile Path:
  `opencode/Dockerfile`. Railway injects `PORT`.
- **Render** — Build context: repo root; Dockerfile path: `opencode/Dockerfile`.
- **Fly.io** — `fly launch` / `docker build -f opencode/Dockerfile .`

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `OPENCODE_SERVER_PASSWORD` | yes | HTTP Basic for the REST API; Bearer for SSE. Never expose publicly. |
| `OPENCODE_SERVER_USERNAME` | no | defaults to `opencode` |
| `ANTHROPIC_API_KEY` | no | Anthropic provider |
| `GROQ_API_KEY` | no | Groq provider |
| `OPENROUTER_API_KEY` | no | OpenRouter provider |
| `OPENCODE_API_KEY` | no | OpenCode Zen key — unlocks the free + curated models below |
| `SUPABASE_URL` | yes | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | yes | anon key used by the bridge tool |
| `PORT` | yes | platform-injected; defaults to `4096` |

## Models

The `opencode` provider (OpenCode Zen) is configured with the built-in model
directory plus the curated/free list. Model ids in OpenCode use the
`opencode/<id>` format.

Free on Zen (limited-time): `opencode/big-pickle` (default),
`opencode/mimo-v2.5-free`, `opencode/ling-3.0-flash-fin-free`,
`opencode/nemotron-3-ultra-free`, `opencode/nemotron-3.5-lightning-free`,
`opencode/muse-spark-1.3-contributor-free`.

Curated/paid on Zen: `opencode/deepseek-v4-pro`, `opencode/deepseek-v4-flash`,
`opencode/deepseek-v4-flash-vision-exp`.

Anthropic / Groq / OpenRouter providers load their full model directories, so no
hardcoded model ids are needed there. `small_model` (session titles) is pinned to
`opencode/deepseek-v4-flash` so helper calls stay on Zen.

## Security model

- Staff JWT is checked by the **Edge Function**, never trusted from the server.
- Every tool call carries the requesting staff member's JWT; the bridge tool
  sends it back to `ai-command`, so RLS scopes results per user.
- The server holds no database credentials — only the public URL + anon key.
- Session sharing is disabled in `opencode.json`.

## Status

- [x] Server package + provider/model config (this directory)
- [x] `.opencode/tools/nowopen.ts` bridge tool
- [x] ai-command `opencode.create` / `opencode.run` / `opencode.stream` actions + migration
      (`supabase/migrations/20260910000000_ai_command_opencode.sql`); frontend client
      (`src/lib/aiCommand/client.ts`) + UI wiring behind `VITE_AI_ENGINE=opencode`
- [ ] Deploy the OpenCode server to Railway/Render/Fly
- [ ] Set `OPENCODE_SERVER_URL` / `OPENCODE_SERVER_PASSWORD` (+ provider keys) as
      ai-command Edge Function secrets, apply the migration, deploy the edge function,
      and build the frontend with `VITE_AI_ENGINE=opencode`
- [ ] Live checks: opencode.\* actions answer from prod