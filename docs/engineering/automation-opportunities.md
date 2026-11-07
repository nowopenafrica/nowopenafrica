# The ten highest-value inefficiencies

Audit date **2026-10-20**. Ranked by expected benefit against effort, risk and
how confident the evidence is. Items 1–4 and 9–10 are **done** — this file is
the record of why. Items 5–8 are **not done**, deliberately, and each says
what the decision needs.

> Confidence is stated honestly. "Measured" means a command produced the
> number on this working copy. "Counted" means a grep found the call sites but
> the consequence is inferred. "Judged" means neither.

---

## Done

### 1. Static analysis had no cache — **measured**

Every typecheck re-read 1,041 files; every lint re-parsed all of them.

| | before | after |
|---|---:|---:|
| typecheck | 31.9s | **4.4s** |
| lint | 21.8s | **2.6s** |

Effort: three config keys and one CLI flag. Risk: near zero — both caches
invalidate on content, the ESLint one was tested against a real config change
(it re-reported 3,987 errors immediately), and both live in `node_modules`,
which git already ignores.

### 2. CI was weaker than the local gate — **measured**

CI ran typecheck → lint → test → build. `npm run verify` ran twelve steps.
**Seven of the nine repository guards never ran in CI at all** — and each of
those guards exists because the mistake it catches had already reached
production once. CI also ran `typecheck` twice, once directly and once inside
`build`.

CI now runs `npm run verify`, the same command a developer runs, so the two
cannot drift apart again.

### 3. No change-aware fast path — **measured**

Every change, however small, paid the full 132s. Measured on one changed leaf
module, `npm run verify:quick` is **5.3s**. It is explicitly not the gate; see
`development-workflow.md` for what it cannot see.

### 4. Nine guards, nine `npm run` wrappers — **measured**

The guards do their real work in 70–270ms each. Launching each through its own
`npm run`, in series, cost **6,876ms**; the same nine spawned concurrently in
one process cost **399ms**. 97% of the cost was wrapper, not work.

The failure paths were tested, not assumed: a guard that exits non-zero and a
guard whose file does not exist both fail the run and print everything the
guard said.

### 9. `npm run build` ran only two of the nine guards — **measured**

Now runs all nine, which costs it 0.4s.

### 10. No engineering documentation — **judged**

`AGENTS.md` covers conventions well. Nothing covered architecture, the
workflow, the gates or the known gaps, so every new session re-derived them
from the source — the most expensive possible way to learn a fact that does
not change. These four files are the fix.

---

## Not done — these need a decision

### 5. Five weeks and 518 files of uncommitted work — **measured**, needs the founder

```
last commit   2026-09-14      today   2026-10-20
209 modified · 306 untracked · 3 deleted
```

This is the highest-risk item in the audit and it is the one I have not
touched, because committing is the founder's call.

What it costs right now:

- **No checkpoint.** Five weeks of work has no restore point short of the
  filesystem.
- **No review.** 518 files cannot be read as a diff.
- **The fast path is blind by default.** `verify:quick` works from "what
  changed against HEAD"; with 518 files changed, that is everything, so it
  falls back to demanding the full gate. It only earns its 25× while the tree
  is reasonably clean.

The work is sound — `npm run verify` passes, 5,863 tests, exit 0. It simply
is not recorded anywhere.

### 6. Money is formatted six incompatible ways, two of them in different units — **counted, consequence confirmed by reading**

| function | input | ₦7,500 renders as |
|---|---|---|
| `catalogue.formatCataloguePrice` | major | `₦7,500.00` |
| `proposals.formatMoney` | major | `₦7,500.00` |
| `invoices.formatNaira` | major | `₦7,500` |
| `receipts.formatMoney` | major | `₦7,500` |
| `create/money.formatMinor` | **minor** | `₦7,500` |
| `revenue/products.formatPrice` | **minor** | `₦7,500` |

Two consequences, one cosmetic and one not:

- A proposal says `₦7,500.00` and the receipt for it says `₦7,500`.
- Four take naira and two take kobo, with interchangeable-sounding names.
  Passing a minor-unit value to `formatNaira` prints **₦750,000** — a
  hundredfold error, on a commercial document, with no type to stop it.

Not fixed here because consolidating changes the rendered output of invoices,
proposals and receipts, which are documents customers have already received.
**The decision needed:** may invoice and proposal output change to match the
receipt (no trailing `.00`), or must each document keep its current
appearance? The unit hazard can be closed either way, with branded types, and
that part is safe.

### 7. 121 components query Supabase inside `useEffect`; almost none track an error — **counted** · *guard now in place*

- 121 components call Supabase directly from an effect.
- 1 holds both a `loading` and an `error` state.
- 45 sites destructure `const { data } = await supabase…` (or
  `const { data: rows } = …`), discarding `error` outright, against 105 that
  keep it.

supabase-js resolves with `{ data, error }` rather than rejecting, so a
discarded `error` is not an unhandled promise — it is an **empty list rendered
as though the query succeeded**. A permissions failure, a renamed column and
"this business genuinely has no products" are indistinguishable on screen.

Two increments. **The first is done.**

1. **Done** — `scripts/check-query-errors.mjs` records the 45 existing sites
   and fails on a new one. It counts per file rather than per line, so a site
   that merely shifts down when a file is edited above it is not reported as
   new. Proven by adding a discarding call to a clean component: caught,
   exit 1, named the file and the line.
2. **Not done** — a shared hook for query + loading + error, adopted by new
   code first. Rewriting 121 components in one change is not worth the blast
   radius, and each one needs a decision about what the UI should say when the
   query fails, which is design work rather than find-and-replace.

### 8. 38 `alert()` and 12 `confirm()` call sites — **counted**

`ConfirmDialog` was introduced to replace `window.confirm` and twelve call
sites still use the browser's. Browser dialogs block the page, cannot be
styled, and on mobile render as a system sheet that looks like it came from
somewhere other than the app. Low risk, low urgency, genuinely visible.

---

## Operational automation — assessed, nothing built

The brief asked about automating Business Intelligence, Create Media, Promote
Advert and admin operations. The honest finding is that **most of it already
exists**: discovery campaigns, the enrichment pipeline, the review queue with
per-field evidence, the recategorisation sweep that proposes rather than
overwrites, 24 workforce agents on `pg_cron`, suppression and rights gates in
ClaimReach. Building more of it was not the highest-value thing this audit
found.

What is missing is not more automation but **visibility into the automation
that exists** — several of those jobs have gone silent for days without
anyone noticing, and the reason was knowable each time. That belongs with item
7's "no error monitoring" gap rather than in a new subsystem.

---

## Not claimed

No figure for money saved or hours saved appears in this document. Build and
test durations were measured and are reported above. AI token and billing data
is not available from inside this repository, so any cost figure would be
invented, and an invented saving is worse than none.
