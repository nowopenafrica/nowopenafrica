# NowOpen Africa — Security Audit

**Date:** 2026-09-14 · Scope: secrets, RLS, authorisation, SSRF, uploads,
automation, rights compliance.

**Verdict: sound, with one compliance gate that was broken and is now fixed.**
No credential exposure, no privilege escalation path, no IDOR found.

---

## 1. Secrets

| Check | Result |
|---|---|
| Service-role key in client code | **None.** The only two mentions are tests asserting it is absent |
| Env vars reaching the browser | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` (a *public* key), `VITE_AI_ENGINE`, plus Vite's `DEV/PROD/MODE` |
| Secrets in reports/logs | None written by this audit |

---

## 2. RLS

Row-level security is **enabled on every table in `public`**.

Five tables have RLS on with **zero policies**, which denies everything except
the service role: `private_config`, `social_connections`, `social_auth_pending`,
`onboarding_messages`, `onboarding_manual_sends`. I checked whether any client
code reads them — **none does**. That is correct design, not a lockout.

`businesses` policies:

- `SELECT` — `is_listable OR (auth.uid() = user_id) OR is_admin()`
- `UPDATE` / `DELETE` — owner only; `ALL` — admin
- Editors have **no** write path to businesses

`radar_candidates` — anyone may INSERT (the public "suggest a business" form),
staff read and update. Publishing is a `SECURITY DEFINER` function that checks
`is_admin()` first.

---

## 3. Authorisation

**The claim boundary is enforced twice**, and I verified all four cases against
the live database inside a rolled-back transaction:

| Actor | Action | Result |
|---|---|---|
| Admin | edit a **claimed** business's tagline | **refused**, 42501, "Only they can change its details" |
| Admin | suspend + verify that same business | allowed (moderation is untouched) |
| Owner | edit their own tagline | allowed |
| Admin | edit an **unclaimed** business | allowed |

`guard_claimed_profile_edits` protects content columns only; lifecycle,
verification, trust, plan and claim status stay with admins. It raises rather
than silently reverting — deliberately different from the verification guards
beside it, because the actor here is an admin doing what they believe is their
job.

Two earlier findings remain fixed: `claimreach_is_suppressed` and
`claimreach_suppressed_contacts` are `SECURITY DEFINER` and **fail closed** —
a signed-in non-staff caller and an anon caller both get 42501, while
service-role and SQL-editor sessions answer. (Reminder for future functions:
inside `SECURITY DEFINER`, `current_user` is the **owner**, so guards must read
`auth.role()`.)

---

## 4. SSRF — verified by probe

`checkFetchUrl()` in `supabase/functions/_shared/discovery/safeUrl.ts`:

| Target | Verdict |
|---|---|
| `http://127.0.0.1/` | refused — loopback |
| `http://0.0.0.0/` | refused — loopback |
| `http://169.254.169.254/latest/meta-data/` | refused — **metadata** |
| `http://10.0.0.1/`, `172.16.0.1`, `192.168.1.1` | refused — private_ip |
| `http://[::1]/` | refused — loopback |
| `http://metadata.google.internal/` | refused — internal_name |
| `http://localhost/` | refused — internal_name |
| `https://example.com/` | **allowed** |

Also refused: non-http(s) schemes, embedded credentials, non-standard ports,
dot-less hosts, IPv4-mapped IPv6 (dotted and hex), decimal and hex IP
shorthand.

**Fixed this session (NOA-009):** the literal denylist ran *before* the address
classifiers and shadowed them, so the cloud-metadata endpoint reported the
vague `blocked_host` instead of `metadata`. The URL was refused either way —
this was diagnostics, not a hole. Reordered so the classifier answers first.

---

## 5. Rights compliance — the one real defect

**`robotsAllowUrl()` allowed every URL, including disallowed ones** (NOA-003).
`pathOf()` collapsed every absolute URL to `/`, so no `Disallow` rule could
match. Six of its own tests said so and were invisible behind a lint error.

A compliance gate that fails open is worse than none: it reports that a fetch
was checked and permitted. **No production crawl used this path** — the 2,810
discovered listings came from the Wikidata SPARQL endpoint, not from website
crawling — so no site was fetched against its wishes. Fixed and tested 10/10.

Source rights are otherwise enforced properly: `radar_sources` carries the four
rights columns, `sourcePermits()` treats **unknown as refusal** and a blank
`authorised_by` as refusal, and the gate is applied twice (ingestion and
publish). `businesslist_ng` remains `active: false` with everything prohibited.
OpenStreetMap is registered and **inactive** pending an ODbL share-alike
decision.

---

## 6. Untrusted content

- Live SQL results arrive wrapped in an explicit "untrusted data" boundary and
  are treated as data.
- Wikidata labels, website text and CSV cells are never executed; the SPARQL
  query is built by a validated builder — the only variables are two QIDs and
  two integers, each pattern-checked, with injection probes (`Q8673 } INSERT
  DATA {`, `"; DROP TABLE`, `Q1 . ?x ?y ?z`) covered by tests.
- `checkWebsite()` / `checkImageUrl()` refuse `javascript:`, `data:`,
  `vbscript:`, `file:`, `blob:` by allowlist.
- CSP is checked in CI (`npm run check:csp`).

---

## 7. Remaining risks

| Risk | Severity | Note |
|---|---|---|
| `supabase db push` replays 99 migrations, 3 of which write rows | High | Documented; `check:drift` warns on every run. Do not run it |
| Dev and prod share one Supabase project | High | Every `npm run dev` writes live |
| Evidence tier mislabel for placeholders (NOA-010) | Low today | No consumer yet; will inflate confidence when one appears |
| 395 lint warnings incl. `no-explicit-any` | Low | Type-safety erosion, not a vulnerability |

## 8. Not found

No IDOR, no role escalation, no unsafe HTML rendering, no open redirect, no
unsafe upload path, no webhook without a secret, no error message leaking
internals, no privileged database access from the client.
