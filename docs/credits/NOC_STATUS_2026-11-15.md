# NowOpen Credits (NOC): build status, 15 November 2026

Audit first: `docs/credits/NOC_AUDIT_2026-11-15.md`. This file says what was built on top of the existing ledger, what is proven, what is switched off, and what needs a person.

## Live database (applied by hand: dry run, ledger row, `npm run check:drift` clean, 243/243)

| Migration | What it does |
|---|---|
| `20261116010000_payment_intent_lockdown` | Closes F1. A browser can only insert `lead` / `initiated` intents with no `verified_via`, for its own account, never `credits`. Only service_role or an admin can change status, amount, kind, item, account or reference. `amount_usd` is nullable. The credit triggers no longer set a service_role claim (HANDOVER 4a). |
| `20261116020000_noc_ledger_v2` | Adds credit classes (purchased / included / promotional / reward / sandbox). Double-entry lines against system accounts. A deferred commit check that every entry balances to zero, that no class goes negative, and that the cached wallet balance equals the ledger. Markets and an append-only rate history (NG, ₦50 per NOC, purchases **off**). Programme switches, with closed-loop rules as CHECK constraints. Compliance approvals, which can be revoked but never edited, and the live-mode gate. Config audit on every price and switch. Backfill of the 18 existing entries. |
| `20261116030000_noc_purchases` | `noc_start_purchase` prices the order from the pack row and snapshots price and rate. `noc_fulfil_purchase` checks the paid amount, currency and Paystack domain against the snapshot and credits exactly once. Test money goes into `sandbox`. `noc_quote` returns the NOC + NGN figures and the shortfall for the checkout. The old `credit_fulfil_purchase` is retired (it raises). |
| `20261116040000_noc_rewards_ops_settlement` | Reward rules, all off and unpriced, with caps, a per-day limit, once per subject, a budget, minimum account age and email confirmation. Every attempt is logged, and business claims are wired as an event. Usage refunds, grant reversals and purchase refunds are all new entries. Adjustments go through request → decide (optional four-eyes). Admin RPCs and `noc_admin_report`. Media-owner settlement tables and functions exist but are **off**. |

## Code (not committed, not deployed)

- `supabase/functions/_shared/paystackCharge.ts`: the amount / currency / domain check.
- `supabase/functions/_shared/nocFulfil.ts`: calls `noc_fulfil_purchase` with Paystack's figures.
- `verify-payment` and `paystack-webhook`: NOC orders go to the database. The webhook now checks amount and currency for **every** kind before marking a payment paid (closes F3).
- `src/lib/credits/noc.ts`, `src/components/credits/NocCheckout.tsx` (unified checkout: NOC beside NGN, balance, shortfall, top-up pack).
- `src/pages/Wallet.tsx` (`/wallet`) and `src/pages/AdminCredits.tsx` (`/admin/credits`: Report, Launch & compliance, Packs & prices, Rewards, Wallets & adjustments, Settlement).
- `src/pages/Pricing.tsx`: allowances read from `credit_plan_allowances`, not constants. Dropped two false claims: "top up any time" and "unused credits refresh monthly".
- `middleware.ts`: `/wallet` is reserved.

## Proof

| Check | Result |
|---|---|
| `npm run check:noc` (17 rolled-back checks on live) | 17/17. Covers: forged paid intent refused; purchases off and sandbox admin-only; fulfilment server-only; under- and over-payment, wrong currency and unknown domain refused; fulfil once with two replays; live mode needs an approval and revoking it switches off; free credits spent first; same-reference charge applied once; overdraw and reservation oversell refused; class floor; usage refund once; reversal is a new entry, once; purchase refund once and cash flagged as manual; adjustment request / decide / four-eyes; reward abuse controls; ledger immutable, unbalanced or tampered entries cannot commit; closed loop; settlement off; report separates the figures. |
| `npm run check:noc:concurrency` (two real sessions) | Passed. While A held a charge on a wallet, B's charge on the same wallet was refused with 55P03 (lock timeout), so spends serialise. Both rolled back. |
| Vitest | `noc.test.ts` 10, `paystackCharge.test.ts` 7, `nocPaymentWiring.test.ts` 9. |
| Browser (dev server, read-only) | `/wallet`, `/admin/credits` Report and Launch, and `/pricing` render from live data. Fixed in passing: an admin's wallet listed every user's entries. |

## Implemented and live in the database

The ledger, classes, double entry, snapshots, launch gate, approvals, admin RPCs, report, refunds, reversals and adjustments. Nothing user-visible changed on production: the frontend and the edge functions are not deployed.

## Sandbox-tested

Only inside rolled-back transactions. No real Paystack test charge has been made against a NOC order: that needs the edge functions deployed and the market set to `sandbox`.

## Configured but inactive

- **Purchases:** NG `purchase_mode = 'off'`.
- **Rewards:** programme off; 3 rules off, with no amount.
- **Settlement:** off, and it cannot be switched on without a recorded settlement approval.
- **Paystack:** test keys. The webhook is still not registered in the Paystack dashboard.

## Needs a person

1. **Deploy** `verify-payment` and `paystack-webhook` (both import the new `_shared` files), and deploy the site. Until then, the deployed functions call the retired `credit_fulfil_purchase`, which is harmless because no credits order can be created.
2. **Founder:**
   - ~~Confirm ₦50 per NOC~~: confirmed 15 Nov, recorded in noc_markets and shown on /pricing.
   - Price any reward rules.
   - Register the Paystack webhook URL.
3. **Legal / compliance** before `live`:
   - Stored-value / e-money treatment of prepaid closed-loop credits in Nigeria (CBN).
   - Consumer terms: no refunds for cash, expiry (none is built), breakage.
   - VAT on credit sales versus redemption.
   - Record the approval in Admin → Credits → Launch.
4. **Provider:** Paystack live keys (founder's job) and the webhook registration.
5. **Settlement:** a partner agreement template, the revenue share, payout process and tax, plus its own approval.

## Not built (deliberately or out of scope)

- NOC is spent by `generate-profile` only. The other 5 priced actions are not wired to a charge yet, so they cannot take credits.
- Promote products are not purchasable with NOC. Settlement is ready for when they are.
- Promotional-credit expiry (it needs lot tracking).
- Multi-market beyond NG: the table supports it, but there is no second market row.
- **Plans:** subscriptions still trust the client's amount (F2 for plans). The webhook fix covers the webhook path. `verify-payment` compares Paystack with a client-written `amount_local` for plans, so plan prices should move server-side like NOC packs.
