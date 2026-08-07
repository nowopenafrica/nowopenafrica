# The NowOpen AI assistant — how to switch it on

The assistant is **one edge function** (`chatbot`) called by three clients:

| Client | File |
| --- | --- |
| Web chat widget | `src/components/ChatBot.tsx` |
| Web live-stream assistant | `src/components/live/LiveAIAssistant.tsx` |
| Mobile app | `nowopen-mobile/src/lib/ai.ts` |

All three send `{ query, messages, business }` and read back `{ message }`. That
means **the model is chosen server-side only** — switching providers needs no web
deploy and no App Store release. `supabase/functions/_shared/llm.ts` is the one
place it's decided, and `translate-caption` uses it too.

## Pick a provider

Providers are tried **in order until one answers**. A key that is present but
dead no longer takes the assistant down — it costs one failed request and the
next provider handles the turn. (This is not hypothetical: a revoked Groq key
once sat in front of a configured Anthropic key and disabled the whole feature.)

The first key that is set is preferred:

| Secret | Provider | Default model |
| --- | --- | --- |
| `GROQ_API_KEY` | Groq | `llama-3.3-70b-versatile` |
| `OPENROUTER_API_KEY` | OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` |
| `ANTHROPIC_API_KEY` | Anthropic | `claude-opus-4-8` |

**Recommended: Groq.** Llama 3.3 70B is genuinely open-weight (Meta community
licence), Groq's free tier is generous, its latency is the lowest of the three —
which matters for a chat widget and for live caption translation — and its tool
calling is reliable, which this function depends on for `search_platform`.

OpenRouter is the drop-in alternative: same open model, no card required on the
`:free` variants, but slower and more aggressively rate-limited.

Set `ASSISTANT_MODEL` to override the model without touching code — e.g.
`llama-3.1-8b-instant` for lower latency, or a different open model on OpenRouter.

## Set the key

Get a free key from <https://console.groq.com> (or
<https://openrouter.ai/keys>), then:

```bash
npx supabase secrets set GROQ_API_KEY=your_key_here --project-ref wvayqqfqqocwjripugnb
```

Then deploy — the provider layer is a code change, so the secret alone isn't
enough until the new function is live:

```bash
npx supabase functions deploy chatbot translate-caption --project-ref wvayqqfqqocwjripugnb
```

> **Never** put this key in a `VITE_*` or `EXPO_PUBLIC_*` variable. Those are
> compiled into the shipped bundle and are readable by anyone who opens
> devtools. It belongs only in Supabase secrets, which is why the provider layer
> lives in an edge function rather than in the client.

## Check it's actually live

`GET` the function and it reports the provider without revealing the key. Edge
functions verify the JWT by default, so pass the **anon** key — the same one the
web and mobile clients already send:

```bash
curl -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/chatbot
```

```json
{ "ok": true, "provider": "groq", "model": "llama-3.3-70b-versatile", "mode": "model" }
```

`"provider": "none"` with `"mode": "search-only fallback"` means no key is set.

That endpoint only reports which key is *present*. A key can be present but dead,
and a host can retire a model id — both silently downgrade the assistant to
search-only and look identical from outside. Add `?probe=1` to make a real
1-token call and see the upstream status:

```bash
curl -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  "https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/chatbot?probe=1"
```

`401 invalid_api_key` means the secret is wrong or revoked. A `model` error means
the id is retired — the probe then lists the ids the provider currently offers,
so you can set `ASSISTANT_MODEL` to a live one without a code change.

## Known quirks of open models

Llama-family models sometimes emit a function call as raw text
(`<function=search_platform={...}>`) instead of structured `tool_calls`. Groq
rejects that with `400 tool_use_failed`, which would otherwise lose the whole
turn. The provider layer treats it as a formatting slip and retries with the
tools withheld, so the model answers in prose from what it already knows.

They also need firmer prompting about tool scope than a frontier model does. The
system prompt says explicitly that `search_platform` covers listings only and
that subscription pricing must be answered directly — without that, the model
invented `domain: "pricing"` (not in the enum) and the request failed.

A turn may take up to `MAX_TOOL_ROUNDS` searches before answering, because these
models routinely search, find little, and refine the query. If the rounds run
out, the final call withholds the tools to force a written answer.

## What happens with no key

The chat box still works. `chatbot` runs the directory search itself and returns
real, linked listings grouped by businesses / ad placements / creative services,
with `degraded: true` on the response. Captions fall back to the untranslated
original. Both are worse than a model, and both are much better than an error —
the assistant is never a dead box.

## An honest note on "free"

The *models* are open-weight; the *hosting* still needs a free account and an API
key. There is no dependable keyless endpoint. This repo already learned that the
hard way: the Studio's AI art integration was built against `gen.pollinations.ai`
because it needed no key, and it now returns 401 and does nothing.

The provider layer is the hedge against a repeat — if a host changes its terms,
swapping to another is one secret and one redeploy, with no client changes and
no app release.

## Tests

`_shared/llm.test.ts` runs under the web app's Vitest suite (it's pure
TypeScript with no `jsr:` imports, unlike the rest of the functions). It covers
provider precedence, a full tool round-trip on *both* wire formats — Anthropic's
`input_schema`/`tool_use` and OpenAI's `parameters`/`tool_calls` — malformed tool
arguments, and the failure paths that trigger the fallback.

```bash
npx vitest run supabase/functions/_shared/llm.test.ts
```
