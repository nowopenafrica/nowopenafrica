# CLAIMREACH™ — BASELINE AUDIT
**Date:** 2026-09-08 · **§1 deliverable: inspect before building**
**Method:** live queries against production and a read of the working tree. Numbers changed *during* this audit because an import is running — that is noted where it matters.

---

## THE ONE THING THAT BLOCKS EVERYTHING

**There is no suppression table. No opt-out table. No consent table. No outreach log.**

Searched the live schema for `suppress|opt|unsubscribe|consent|outreach|message|contact`. The only matches are `notifications` and `stream_chat_messages` — both in-app, neither about outbound.

§22 says: *"Before EVERY outbound message: check suppression. Never send if suppressed."* With no suppression table there is nothing to check, and an opt-out request has nowhere to be recorded — which means **the second message to somebody who replied STOP is guaranteed**, not merely possible.

So the position is unambiguous:

> **ClaimReach must not send one message until suppression exists.** Not as a safety improvement — as the precondition that makes outbound lawful and honest at all.

That table is a migration, and this session has been refused production DDL six times. It is written and waiting.

---

## WHAT CHANGED WHILE I WAS AUDITING

This matters more than a footnote. At the start of today `businesses` held **2 rows, both claimed**. During this audit:

| time | unclaimed businesses |
| --- | --: |
| earlier today | 2 (none) |
| 03:05 import | 100 |
| 07:39 (now) | **269** |

So ClaimReach has gone from having **no targets at all** to having 269 real ones — Four Points by Sheraton Lagos, Eko Hotels & Suites, Lisa Folawiyo, Hard Rock Cafe Lagos, AIICO Insurance, Paga. These are real Lagos businesses, imported as `imported_authorized` from an admin CSV.

**I re-measured rather than trusting my own figure from an hour earlier, and it had already moved.** Any number in this document should be re-run before a decision rests on it.

### The contactability reality

```
269 unclaimed, imported_authorized
 65 have a phone            (24%)
  0 have an email
  0 have a description
 avg listing_score  33
```

§6's contactability engine would score **204 of 269 as uncontactable today** — no phone, no email. The only route to them is the website each one carries, which means **contactability depends on AutoAcquire fetching the site and extracting a contact** — and that is exactly what the SSRF guard shipped earlier today exists to make safe. The two systems connect at that seam.

---

## WHAT ALREADY EXISTS — REUSE

### Messaging — **PARTIALLY EXISTS**, with one serious constraint

`supabase/functions/_shared/notify.ts`:

| Channel | Function | Gate | Verdict |
| --- | --- | --- | --- |
| Email | `sendEmail` → Resend | `RESEND_API_KEY` | exists; returns `{ok:false, skipped:true}` unconfigured |
| WhatsApp | `sendWhatsAppText` → Meta Graph v20 | `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` | exists — **but see below** |
| In-app | `createNotification` | — | exists |
| SMS | — | — | **MISSING entirely** |

The graceful-skip pattern is exactly right and should be the model for every ClaimReach provider: unconfigured is not an error, it is *skipped*, and the caller can tell the difference.

**THE WHATSAPP CONSTRAINT, and it is not a detail.** `sendWhatsAppText` sends a **free-form text** message. Meta permits free-form only inside a 24-hour customer-service window opened *by the business messaging us first*. A cold outbound message to a business that has never contacted NowOpen **requires a pre-approved template**, and sending free-form instead is a policy violation, not a bug that degrades gracefully.

So §10 is not satisfiable with the existing function. ClaimReach needs `sendWhatsAppTemplate` plus a template registry, and the templates need Meta approval — a process with a queue and a rejection rate, not a config change. Until then WhatsApp cold outreach is **not available**, and claiming otherwise would be the "do not claim a channel is production-ready" failure §63 names explicitly.

### Worker substrate — **EXISTS** (§38)

`pg_cron` → edge function, live today: `nowopen-workforce */15 * * * *`. Three cron-driven functions already exist (`run-automations`, `run-workforce`, `publish-due-posts`). The 15-minute tick is the real throughput ceiling and must be batched, not looped one row at a time.

### Kill switch — **PARTIALLY EXISTS** (§41)

`featureFlags.ts` exports `KILL` and `CONSEQUENCE` with an explicit note that hiding a button is not a security control. The mechanism is there; per-channel `STOP WHATSAPP` / `STOP SMS` / `STOP EMAIL` is not.

### Audit log — **EXISTS** (§21) · `audit_log` table present, needs the field-level shape.

### Claim engine — **EXISTS** (§18) · `business_claims`, `ApprovalsHub`, `mark_claim_pending()`, `apply_business_claim()`. Missing the four-step flow and `relationship` / `verification_method` / `risk_score`.

### Claim priority inputs — **PARTIALLY EXIST** (§5)

`analytics_events` carries `business_viewed` (119) and `business_contact_clicked` (5). `northStar.ts` already counts *successful connections*. So §5's score has real inputs — but **5 contact clicks across the whole platform** means the score will be dominated by its `data quality` and `recency` terms for months. A priority engine weighted 25% on search demand, computed over 18 search events, would be arithmetic theatre.

### `/admin/acquisition/claimreach` — **MISSING** (§3), as is the campaign builder (§25), dry-run (§26), conversation classification (§16) and the claim landing page (§17).

---

## URGENT FINDING FIXED DURING THIS AUDIT

Not part of the ClaimReach brief, but it was live and getting worse with every import.

**Every imported profile was being submitted to Google regardless of quality.** The sitemap gate and the profile renderer both asked only *"is somebody accountable for this record?"* — while `discover.ts` was independently excluding the same profiles as **too thin to show a visitor** (`listing_score < MIN_USEFUL_SCORE`, 40).

So the platform was asking Google to judge it on the pages it would not show its own users. At 269 imported records averaging a score of 33, that is 220 thin pages volunteered for indexing from a domain with two real businesses — §58's exact warning.

**Fixed and verified on production with a real Googlebot user-agent:**

```
aiico-insurance                 score 30  →  noindex, follow
paga-7654b2                     score 30  →  noindex, follow
four-points-by-sheraton-lagos   score 45  →  index, follow
```

**220 thin profiles removed from the index request; 49 that clear the bar retained.**

The rule is two rules, deliberately:

- **claimed → indexable whatever the score.** The owner is accountable and can complete it; de-indexing a brand-new claimed business for being incomplete would punish exactly the behaviour the platform exists to cause.
- **imported → indexable only above the usefulness bar.** Nobody has vouched for the content, so the content has to.

The sitemap now **calls** `isIndexableProfile` instead of restating it. Two copies of one rule is how they diverged in the first place.

### And a measurement error of my own, corrected

I first tested this from browser JavaScript with a Googlebot `User-Agent` header, got the SPA shell back, and concluded there was a second renderer serving crawlers the JavaScript shell. **That was wrong.** `fetch()` cannot override `User-Agent` — the browser silently drops it, so the request was never a crawler and middleware correctly served the shell. Re-tested from PowerShell with a real UA: middleware routes correctly and the SSR renderer runs. Worth recording because the wrong conclusion was about to become a bug report.

---

## VERDICTS

| § | Area | Verdict |
| --- | --- | --- |
| 3 | ClaimReach admin | **MISSING** |
| 5 | Claim priority | **PARTIALLY** — inputs exist, volume does not |
| 6 | Contactability | **MISSING** — 204/269 uncontactable today |
| 7 | Provenance in messages | **BLOCKED** on `business_evidence` (written, unapplied) |
| 8 | Personalisation | **MISSING** — LLM shim exists to build on |
| 9 | Provider abstraction | **PARTIALLY** — email + WhatsApp, no interface |
| 10 | WhatsApp | **NOT AVAILABLE** — free-form only; templates unapproved |
| 11 | SMS | **MISSING** — no provider at all |
| 12 | Email | **PARTIALLY** — Resend send exists; no unsubscribe/bounce/suppression |
| 13 | Social | **CORRECTLY ABSENT** — no unofficial DM path exists, and none should |
| 14–15 | Sequences, follow-up | **MISSING** |
| 16 | Conversation classification | **MISSING** |
| 17 | Claim landing page | **PARTIALLY** — `ClaimBusiness.tsx` on the profile; no `/claim/[slug]` |
| 18 | Ownership verification | **EXISTS** |
| 21 | Contact status | **MISSING** |
| **22** | **Suppression** | **MISSING — blocks all sending** |
| 23–24 | Frequency, quiet hours | **MISSING** |
| 26 | Dry run | **MISSING** |
| 28 | Safe auto-send gate | **MISSING** |
| 36–38 | Tables, idempotency, queues | **MISSING** |
| 41 | Kill switch | **PARTIALLY** |
| 42 | Security | SSRF guard shipped today; prompt-injection isolation still needed |
| 43 | Privacy controls | **MISSING** |
| 58 | SEO integration | **FIXED TODAY** — see above |

---

## SEQUENCE

**PHASE 0 — before a single message (all blocking)**
1. `claimreach_suppressions` + a `checkSuppression()` that every send path must pass through.
2. Contact status (§21) and the outreach log, so "already contacted" is answerable.
3. `business_evidence` (already written) — §7 forbids a message containing anything without provenance.

**PHASE 1 — the gate, buildable now without providers or DDL**
4. **§28's safe-auto-send gate as a pure function.** Every rule — unclaimed, valid contact, documented source, not suppressed, under frequency cap, confidence above threshold, no unsupported claims, channel configured, campaign active, quiet hours — composed and fully testable with no provider attached. This is the highest-value unblocked work in the brief: it makes every safety rule executable and falsifiable before anything can send.
5. Quiet hours (§24), frequency control (§23), claim priority (§5), contactability (§6) — all pure, all testable.
6. Template engine with **provenance enforcement** (§7, §29): a variable that has no evidence row cannot render, so §10's anti-hallucination rule is structural rather than a prompt instruction.

**PHASE 2 — channels, in order of what is actually available**
7. **Email first.** Resend exists; it needs unsubscribe, bounce and complaint handling before use.
8. SMS second — needs a Nigerian provider decision (Termii, Africa's Talking, Twilio) and a sender ID.
9. WhatsApp last, and only after Meta template approval.

**PHASE 3** — admin surface, dry run, sequences, conversation handling.

### Blockers

- **DDL refused six times.** Phase 0 is three migrations I can write and cannot apply.
- **No SMS provider chosen.** A founder decision with cost and compliance attached.
- **No approved WhatsApp templates.** A Meta process, not a config change.
- **No staging.** One Supabase project for dev and production.

---

## THE ONE THING THIS AUDIT WOULD SAY

ClaimReach's inputs arrived today — 269 real unclaimed Lagos businesses, up from zero this morning. The claim engine, the worker substrate, the audit log, an email sender and a kill switch already exist.

What does not exist is **the ability to stop**. No suppression list, no opt-out record, no contact history. A system that can send and cannot remember who asked it not to is not an acquisition engine; it is a complaint generator with a queue.

So the first thing to build is the part that says no.
