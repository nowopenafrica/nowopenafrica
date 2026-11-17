-- NowOpen Credits (NOC): behaviour checks for the financial paths.
--
-- Run with: node scripts/check-noc.mjs
--
-- ONE TRANSACTION ENDING IN ROLLBACK. Every throwaway account, order and
-- ledger entry below ("zz-noc-check …") is discarded. It runs against the
-- linked project (production) through `supabase db query --linked`.
--
-- The double-entry checks are DEFERRED to commit, and this script never
-- commits, so it calls `SET CONSTRAINTS ALL IMMEDIATE` at checkpoints to run
-- them for real.
--
-- Covers: idempotency and replay (purchase, charge, reward, refund, reversal),
-- no double spend (classes, totals, reservations), amount/currency/domain
-- matching, the launch gate, closed-loop rules, immutability, the adjustment
-- workflow, reward abuse controls, settlement staying off, and the old
-- payment-intent hole. Concurrency is proven separately with two sessions:
-- scripts/check-noc-concurrency.mjs.

BEGIN;

SELECT set_config('chk.passed', '', false);

CREATE FUNCTION pg_temp.chk_pass(p_name text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  RAISE NOTICE 'ok: %', p_name;
  PERFORM set_config('chk.passed', current_setting('chk.passed', true) || p_name || ',', false);
END $f$;

CREATE FUNCTION pg_temp.chk_user(p_label text, p_admin boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  v_id    uuid := gen_random_uuid();
  v_email text := 'zz-noc-check-' || p_label || '-' || substr(md5(random()::text), 1, 8) || '@example.invalid';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at)
  VALUES (v_id, 'authenticated', 'authenticated', v_email, now(), now() - interval '30 days', now());
  INSERT INTO public.users (id, email, role) VALUES (v_id, v_email, 'business') ON CONFLICT (id) DO NOTHING;
  IF p_admin THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE public.users SET role = 'admin' WHERE id = v_id;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_id;
END $f$;

CREATE FUNCTION pg_temp.claims(p_user uuid) RETURNS text LANGUAGE sql AS $f$
  SELECT json_build_object('role', 'authenticated', 'sub', p_user::text)::text;
$f$;

CREATE FUNCTION pg_temp.bal(p_user uuid, p_class text) RETURNS integer LANGUAGE sql AS $f$
  SELECT coalesce(sum(l.amount), 0)::integer FROM public.noc_ledger_lines l
    JOIN public.noc_accounts a ON a.id = l.account_id
   WHERE a.user_id = p_user AND a.credit_class::text = p_class;
$f$;

CREATE FUNCTION pg_temp.total(p_user uuid) RETURNS integer LANGUAGE sql AS $f$
  SELECT coalesce(balance, 0) FROM public.credit_wallets WHERE user_id = p_user;
$f$;

-- Shared fixtures, kept in a temp table so every DO block can read them.
CREATE TEMP TABLE chk_ids (k text PRIMARY KEY, v uuid);
INSERT INTO chk_ids VALUES
  ('admin',  pg_temp.chk_user('admin', true)),
  ('admin2', pg_temp.chk_user('admin2', true)),
  ('alice',  pg_temp.chk_user('alice')),
  ('bob',    pg_temp.chk_user('bob'));
CREATE FUNCTION pg_temp.id(p text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM chk_ids WHERE k = p $f$;
GRANT SELECT ON chk_ids TO authenticated;

-- ═══ 1. The existing ledger was backfilled and balances ═════════════════
DO $$
DECLARE n integer;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  SELECT count(*) INTO n FROM public.credit_transactions t
   WHERE NOT EXISTS (SELECT 1 FROM public.noc_ledger_lines l WHERE l.transaction_id = t.id);
  ASSERT n = 0, 'backfill: entries without lines';
  SELECT count(*) INTO n FROM (SELECT transaction_id FROM public.noc_ledger_lines GROUP BY 1 HAVING sum(amount) <> 0) x;
  ASSERT n = 0, 'backfill: unbalanced entries';
  PERFORM pg_temp.chk_pass('ledger_balanced');
END $$;

-- ═══ 2. The old payment-intent hole stays shut ══════════════════════════
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    INSERT INTO public.payment_intents (kind,item_id,item_title,currency,amount_local,email,status,provider,reference)
    VALUES ('subscription','business-pro','zz-noc-check','NGN',1,'zz@example.invalid','paid','paystack','zz-noc-paid');
    RAISE EXCEPTION 'FAIL: an anonymous paid intent was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.payment_intents (kind,item_id,item_title,currency,amount_local,email,status,provider,reference)
    VALUES ('credits','pack.business','zz-noc-check','NGN',1,'zz@example.invalid','initiated','paystack','zz-noc-cred');
    RAISE EXCEPTION 'FAIL: a client-created credits intent was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.chk_pass('client_cannot_forge_payment');
END $$;

-- ═══ 3. Purchases are OFF; sandbox is admins-only; amounts are the DB's ═
DO $$
DECLARE v jsonb; v_price bigint;
BEGIN
  ASSERT (SELECT purchase_mode FROM public.noc_markets WHERE code = 'NG') = 'off', 'market NG should be off';
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('alice')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.noc_start_purchase('pack.starter');
    RAISE EXCEPTION 'FAIL: purchase opened while off';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  RESET ROLE;

  -- Admin switches to sandbox.
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.noc_admin_set_purchase_mode('NG', 'sandbox');
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('alice')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.noc_start_purchase('pack.starter');
    RAISE EXCEPTION 'FAIL: a non-admin opened a sandbox purchase';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN
    PERFORM public.noc_admin_set_purchase_mode('NG', 'live');
    RAISE EXCEPTION 'FAIL: a non-admin changed the purchase mode';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  v := public.noc_start_purchase('pack.starter');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT price_minor INTO v_price FROM public.credit_packages WHERE slug = 'pack.starter';
  ASSERT (v ->> 'amount_minor')::bigint = v_price, 'order amount is not the pack price';
  ASSERT (SELECT amount_local FROM public.payment_intents WHERE reference = v ->> 'reference') = v_price / 100.0,
    'intent amount is not the pack price';
  ASSERT (SELECT mode FROM public.noc_purchase_orders WHERE reference = v ->> 'reference') = 'sandbox', 'order mode';
  INSERT INTO chk_ids VALUES ('order1', (SELECT id FROM public.noc_purchase_orders WHERE reference = v ->> 'reference'));
  PERFORM pg_temp.chk_pass('launch_gate_off_sandbox_admin_only');
END $$;

-- ═══ 4. Fulfilment: signed-in users cannot call it ══════════════════════
DO $$
DECLARE v_ref text := (SELECT reference FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1'));
BEGIN
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.noc_fulfil_purchase(v_ref, 500000, 'NGN', 'test', 'client');
    RAISE EXCEPTION 'FAIL: a signed-in user fulfilled an order';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.chk_pass('fulfil_server_only');
END $$;

-- ═══ 5. Underpayment, wrong currency, unknown domain: no credits ════════
DO $$
DECLARE
  v_ref text := (SELECT reference FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1'));
  v_price bigint := (SELECT price_minor FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1'));
  v_before integer := coalesce(pg_temp.total(pg_temp.id('admin')), 0);
  v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v := public.noc_fulfil_purchase(v_ref, v_price - 100, 'NGN', 'test', 'client');
  ASSERT v ->> 'reason' = 'mismatch', 'underpayment was not refused';
  v := public.noc_fulfil_purchase(v_ref, v_price, 'USD', 'test', 'client');
  ASSERT v ->> 'reason' = 'mismatch', 'wrong currency was not refused';
  v := public.noc_fulfil_purchase(v_ref, v_price, 'NGN', 'bogus', 'client');
  ASSERT v ->> 'reason' = 'mismatch', 'unknown domain was not refused';
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT coalesce(pg_temp.total(pg_temp.id('admin')), 0) = v_before, 'a mismatched payment moved the balance';
  ASSERT (SELECT status FROM public.payment_intents WHERE reference = v_ref) = 'initiated', 'a mismatch marked the intent paid';
  PERFORM pg_temp.chk_pass('amount_currency_domain_must_match');
END $$;

-- ═══ 6. Correct test payment → sandbox credits, exactly once ════════════
DO $$
DECLARE
  v_ref text := (SELECT reference FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1'));
  v_price bigint := (SELECT price_minor FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1'));
  v_total integer := (SELECT credits + bonus_credits FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1'));
  v_before integer := coalesce(pg_temp.total(pg_temp.id('admin')), 0);
  v1 jsonb; v2 jsonb; v3 jsonb; n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v1 := public.noc_fulfil_purchase(v_ref, v_price, 'NGN', 'test', 'client');
  v2 := public.noc_fulfil_purchase(v_ref, v_price, 'NGN', 'test', 'webhook');   -- webhook replay
  v3 := public.noc_fulfil_purchase(v_ref, v_price, 'ngn', 'test', 'webhook');   -- and again
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (v1 ->> 'fulfilled')::boolean AND NOT (v1 ->> 'replay')::boolean, 'first fulfilment failed';
  ASSERT (v2 ->> 'replay')::boolean AND (v3 ->> 'replay')::boolean, 'replays were not recognised';
  ASSERT v1 ->> 'credit_class' = 'sandbox', 'test money was not sandboxed';
  ASSERT pg_temp.total(pg_temp.id('admin')) = v_before + v_total, 'balance moved more than once';
  ASSERT pg_temp.bal(pg_temp.id('admin'), 'sandbox') = v_total, 'sandbox class balance';
  ASSERT pg_temp.bal(pg_temp.id('admin'), 'purchased') = 0, 'test money reached the purchased class';
  SELECT count(*) INTO n FROM public.credit_transactions WHERE reference = 'payment:' || v_ref;
  ASSERT n = 1, 'more than one purchase entry';
  ASSERT (SELECT status FROM public.payment_intents WHERE reference = v_ref) = 'paid', 'intent not marked paid';
  ASSERT (SELECT rate_snapshot ->> 'minor_per_noc' FROM public.credit_transactions WHERE reference = 'payment:' || v_ref) IS NOT NULL,
    'no rate snapshot';
  ASSERT (SELECT price_snapshot ->> 'price_minor' FROM public.credit_transactions WHERE reference = 'payment:' || v_ref)::bigint = v_price,
    'no price snapshot';
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('fulfil_once_replay_safe');
END $$;

-- ═══ 7. Live mode needs a recorded approval; test money can't fund it ═══
DO $$
DECLARE v_appr uuid; v jsonb; v_live_ref text;
BEGIN
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.noc_admin_set_purchase_mode('NG', 'live');
    RAISE EXCEPTION 'FAIL: live mode without an approval';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  v_appr := (public.noc_admin_record_approval('live_purchases', 'NG', 'zz-noc-check Counsel', 'Legal counsel',
                                              'zz-noc-check-doc-1')).id;
  PERFORM public.noc_admin_set_purchase_mode('NG', 'live', v_appr);
  v := public.noc_start_purchase('pack.starter');
  v_live_ref := v ->> 'reference';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v := public.noc_fulfil_purchase(v_live_ref, (v ->> 'amount_minor')::bigint, 'NGN', 'test', 'webhook');
  ASSERT v ->> 'reason' = 'mismatch', 'a test payment funded a live order';

  -- Editing a recorded approval is refused; revoking it switches the market off.
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.noc_admin_revoke_approval(v_appr, 'zz-noc-check revoke');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    UPDATE public.noc_compliance_approvals SET document_ref = 'tampered' WHERE id = v_appr;
    RAISE EXCEPTION 'FAIL: a recorded approval was edited';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  ASSERT (SELECT purchase_mode FROM public.noc_markets WHERE code = 'NG') = 'off', 'revocation did not switch the market off';
  PERFORM pg_temp.chk_pass('live_needs_approval_revoke_switches_off');
END $$;

-- ═══ 8. Spend order and class floors ════════════════════════════════════
DO $$
DECLARE v_admin uuid := pg_temp.id('admin'); v_sb_before integer; v_cost integer; t public.credit_transactions;
BEGIN
  v_sb_before := pg_temp.bal(v_admin, 'sandbox');
  v_cost := (SELECT credit_cost FROM public.credit_actions WHERE slug = 'ai.image');
  PERFORM set_config('request.jwt.claims', pg_temp.claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  t := public.credit_charge('ai.image', 'zz-noc-charge-1');
  RESET ROLE;
  ASSERT pg_temp.bal(v_admin, 'sandbox') = v_sb_before - v_cost, 'spend did not draw sandbox first';
  ASSERT t.price_snapshot ->> 'action' = 'ai.image', 'no price snapshot on usage';
  PERFORM set_config('request.jwt.claims', '', true);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO chk_ids VALUES ('usage1', t.id);
  PERFORM pg_temp.chk_pass('spend_order_free_first');
END $$;

-- ═══ 9. No double spend: same reference charges once; overdraw refused ══
DO $$
DECLARE v_admin uuid := pg_temp.id('admin'); v_before integer; t1 public.credit_transactions; t2 public.credit_transactions;
        v_bob uuid := pg_temp.id('bob'); n integer;
BEGIN
  v_before := pg_temp.total(v_admin);
  PERFORM set_config('request.jwt.claims', pg_temp.claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  t1 := public.credit_charge('ai.image', 'zz-noc-charge-2');
  t2 := public.credit_charge('ai.image', 'zz-noc-charge-2');
  RESET ROLE;
  ASSERT t1.id = t2.id, 'a replayed charge wrote a second entry';
  ASSERT pg_temp.total(v_admin) = v_before - (SELECT credit_cost FROM public.credit_actions WHERE slug = 'ai.image'),
    'a replayed charge moved the balance twice';

  -- Bob: give him exactly 20, then try to spend 30 (two video clips of 15).
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM public.credit_grant(v_bob, 20, 'promotional_grant', 'zz-noc-bob-20', 'zz-noc-check');
  -- Wipe whatever else Bob was given at signup so the arithmetic is exact.
  SELECT count(*) INTO n FROM public.credit_transactions WHERE user_id = v_bob AND type = 'subscription_grant';
  IF n > 0 THEN
    PERFORM public.credit_apply(v_bob, 'reversal', -pg_temp.bal(v_bob, 'included'), 'zz', 'zz-noc-bob-wipe', 'zz', null,
                                '{}'::jsonb, 'included', null, null)
      WHERE pg_temp.bal(v_bob, 'included') > 0;
  END IF;
  ASSERT pg_temp.total(v_bob) = 20, format('bob should hold 20, holds %s', pg_temp.total(v_bob));
  PERFORM set_config('request.jwt.claims', pg_temp.claims(v_bob), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.credit_charge('ai.video_clip', 'zz-noc-bob-v1');
  BEGIN
    PERFORM public.credit_charge('ai.video_clip', 'zz-noc-bob-v2');
    RAISE EXCEPTION 'FAIL: overdraw accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- Reservations cannot oversell either: 5 left, a 15-credit hold is refused.
  BEGIN
    PERFORM public.credit_reserve('ai.video_clip', 'zz-noc-bob-r1');
    RAISE EXCEPTION 'FAIL: reservation oversold';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT pg_temp.total(v_bob) = 5, 'bob balance after one clip';

  -- A class floor holds even when the total would allow it.
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN
    PERFORM public.credit_apply(v_bob, 'admin_adjustment', -1, 'zz', 'zz-noc-floor', 'zz', null, '{}'::jsonb,
                                'purchased', null, null);
    RAISE EXCEPTION 'FAIL: a class went negative';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claims', '', true);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('no_double_spend');
END $$;

-- ═══ 10. Usage refund mirrors the classes, once ═════════════════════════
DO $$
DECLARE v_admin uuid := pg_temp.id('admin'); v_before integer; r1 public.credit_transactions; r2 public.credit_transactions;
BEGIN
  v_before := pg_temp.bal(v_admin, 'sandbox');
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r1 := public.noc_refund_usage(pg_temp.id('usage1'), 'zz-noc-check provider failed');
  r2 := public.noc_refund_usage(pg_temp.id('usage1'), 'zz-noc-check provider failed');
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT r1.id = r2.id, 'a refund was applied twice';
  ASSERT pg_temp.bal(v_admin, 'sandbox') = v_before + (SELECT credit_cost FROM public.credit_actions WHERE slug = 'ai.image'),
    'refund did not return to the class it came from';
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('usage_refund_once');
END $$;

-- ═══ 11. Reversing a grant; refusing to reverse spent credits ═══════════
DO $$
DECLARE v_alice uuid := pg_temp.id('alice'); g public.credit_transactions; r1 public.credit_transactions;
        r2 public.credit_transactions;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  g := public.credit_grant(v_alice, 7, 'promotional_grant', 'zz-noc-alice-7', 'zz-noc-check');
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  r1 := public.noc_admin_reverse(g.id, 'zz-noc-check granted in error');
  r2 := public.noc_admin_reverse(g.id, 'zz-noc-check granted in error');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT r1.id = r2.id, 'a reversal was applied twice';
  ASSERT r1.amount = -7 AND r1.type = 'reversal', 'reversal entry shape';
  ASSERT (SELECT count(*) FROM public.credit_transactions WHERE id = g.id) = 1, 'the original entry was touched';
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('reversal_is_new_entry_once');
END $$;

-- ═══ 12. Purchase refund reverses credits once, says cash is manual ═════
DO $$
DECLARE v_ref text := (SELECT reference FROM public.noc_purchase_orders WHERE id = pg_temp.id('order1')); v jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  v := public.noc_admin_refund_purchase(v_ref, 'zz-noc-check refund', 10);
  BEGIN
    PERFORM public.noc_admin_refund_purchase(v_ref, 'zz-noc-check refund again', 10);
    RAISE EXCEPTION 'FAIL: refunded twice';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (v ->> 'reversed_credits')::int = 10, 'refund credits';
  ASSERT v ->> 'cash' ILIKE '%Paystack dashboard%', 'refund must say the cash is moved by a person';
  ASSERT (SELECT status FROM public.noc_purchase_orders WHERE reference = v_ref) = 'refunded', 'order status';
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('purchase_refund_once');
END $$;

-- ═══ 13. Adjustment workflow ════════════════════════════════════════════
DO $$
DECLARE v_req public.noc_adjustment_requests; v_req2 public.noc_adjustment_requests; v_alice uuid := pg_temp.id('alice');
        v_before integer;
BEGIN
  v_before := coalesce(pg_temp.total(v_alice), 0);
  PERFORM set_config('request.jwt.claims', pg_temp.claims(v_alice), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.noc_admin_request_adjustment(v_alice, 'promotional', 1000, 'zz-noc-check self-help');
    RAISE EXCEPTION 'FAIL: a non-admin requested an adjustment';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  v_req := public.noc_admin_request_adjustment(v_alice, 'promotional', 3, 'zz-noc-check goodwill', 'ticket zz');
  RESET ROLE;
  ASSERT pg_temp.total(v_alice) = v_before, 'a request moved the balance before approval';
  SET LOCAL ROLE authenticated;
  v_req := public.noc_admin_decide_adjustment(v_req.id, true, 'zz ok');
  BEGIN
    PERFORM public.noc_admin_decide_adjustment(v_req.id, true, 'zz again');
    RAISE EXCEPTION 'FAIL: decided twice';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  RESET ROLE;
  ASSERT v_req.status = 'applied' AND v_req.transaction_id IS NOT NULL, 'adjustment not applied';
  ASSERT pg_temp.total(v_alice) = v_before + 3, 'adjustment amount';

  -- Four-eyes when switched on.
  UPDATE public.noc_programme SET adjustment_require_distinct_approver = true WHERE id;
  SET LOCAL ROLE authenticated;
  v_req2 := public.noc_admin_request_adjustment(v_alice, 'promotional', 2, 'zz-noc-check second');
  BEGIN
    PERFORM public.noc_admin_decide_adjustment(v_req2.id, true);
    RAISE EXCEPTION 'FAIL: requester approved own adjustment under four-eyes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin2')), true);
  SET LOCAL ROLE authenticated;
  v_req2 := public.noc_admin_decide_adjustment(v_req2.id, false, 'zz rejected');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_req2.status = 'rejected' AND v_req2.decided_by = pg_temp.id('admin2'), 'second admin decision';
  UPDATE public.noc_programme SET adjustment_require_distinct_approver = false WHERE id;
  PERFORM pg_temp.chk_pass('adjustment_request_decide_audit');
END $$;

-- ═══ 14. Rewards: off by default, then every abuse control ══════════════
DO $$
DECLARE v_alice uuid := pg_temp.id('alice'); v_bob uuid := pg_temp.id('bob'); g public.noc_reward_grants; v_before integer;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  g := public.noc_reward_issue('reward.business_claimed', v_alice, 'business:zz-1');
  ASSERT g.status = 'refused' AND g.reason = 'rewards programme is off', 'reward granted while off';

  UPDATE public.noc_programme SET rewards_enabled = true WHERE id;
  g := public.noc_reward_issue('reward.business_claimed', v_alice, 'business:zz-1');
  ASSERT g.reason = 'rule is off', 'reward granted while rule off';
  UPDATE public.noc_reward_rules SET enabled = true WHERE slug = 'reward.business_claimed';
  g := public.noc_reward_issue('reward.business_claimed', v_alice, 'business:zz-1');
  ASSERT g.reason = 'rule has no amount set', 'an unpriced reward was granted';

  UPDATE public.noc_reward_rules SET amount = 4, per_user_limit = 2, global_budget = 8 WHERE slug = 'reward.business_claimed';
  v_before := coalesce(pg_temp.total(v_alice), 0);
  g := public.noc_reward_issue('reward.business_claimed', v_alice, 'business:zz-1');
  ASSERT g.status = 'granted', 'valid reward refused: ' || coalesce(g.reason, '');
  ASSERT pg_temp.total(v_alice) = v_before + 4, 'reward amount';
  ASSERT pg_temp.bal(v_alice, 'reward') >= 4, 'reward class';
  g := public.noc_reward_issue('reward.business_claimed', v_alice, 'business:zz-1');
  ASSERT g.reason = 'already rewarded for this', 'replayed event granted twice';
  g := public.noc_reward_issue('reward.business_claimed', v_bob, 'business:zz-1');
  ASSERT g.reason = 'subject already rewarded to another account', 'same subject rewarded twice';
  g := public.noc_reward_issue('reward.business_claimed', v_bob, 'business:zz-2');
  ASSERT g.status = 'granted', 'bob reward';
  g := public.noc_reward_issue('reward.business_claimed', v_alice, 'business:zz-3');
  ASSERT g.reason = 'rule budget exhausted', 'budget overrun';

  -- New and unconfirmed accounts.
  UPDATE public.noc_reward_rules SET global_budget = NULL WHERE slug = 'reward.business_claimed';
  UPDATE auth.users SET email_confirmed_at = NULL WHERE id = v_bob;
  g := public.noc_reward_issue('reward.business_claimed', v_bob, 'business:zz-4');
  ASSERT g.reason IN ('email not confirmed', 'per-account limit reached'), 'unconfirmed email rewarded';
  UPDATE auth.users SET email_confirmed_at = now(), created_at = now() WHERE id = v_bob;
  g := public.noc_reward_issue('reward.business_claimed', v_bob, 'business:zz-5');
  ASSERT g.reason = 'account too new', 'brand-new account rewarded';

  -- Every attempt is on record; the grants table is append-only.
  ASSERT (SELECT count(*) FROM public.noc_reward_grants WHERE user_id IN (v_alice, v_bob)) >= 9, 'attempts not logged';
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    UPDATE public.noc_reward_grants SET amount = 999 WHERE user_id = v_alice;
    RAISE EXCEPTION 'FAIL: reward log edited';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  UPDATE public.noc_programme SET rewards_enabled = false WHERE id;
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('rewards_abuse_controls');
END $$;

-- ═══ 15. Immutability and the commit-time proof ═════════════════════════
DO $$
DECLARE v_alice uuid := pg_temp.id('alice'); v_w uuid;
BEGIN
  BEGIN
    UPDATE public.noc_ledger_lines SET amount = amount + 1 WHERE id = (SELECT max(id) FROM public.noc_ledger_lines);
    RAISE EXCEPTION 'FAIL: a ledger line was edited';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  BEGIN
    DELETE FROM public.credit_transactions WHERE user_id = v_alice;
    RAISE EXCEPTION 'FAIL: a ledger entry was deleted';
  EXCEPTION WHEN restrict_violation THEN NULL; END;
  -- Writing round credit_apply: an entry with no lines must not commit.
  SELECT id INTO v_w FROM public.credit_wallets WHERE user_id = v_alice;
  BEGIN
    INSERT INTO public.credit_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference)
    VALUES (v_w, v_alice, 'promotional_grant', 1000, 0, 1000, 'zz-noc-forged');
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'FAIL: an entry without double-entry lines passed the commit check';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SET CONSTRAINTS ALL DEFERRED;
  -- Editing the cached balance directly must not commit either.
  BEGIN
    UPDATE public.credit_wallets SET balance = balance + 500 WHERE user_id = v_alice;
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    PERFORM public.credit_grant(v_alice, 1, 'promotional_grant', 'zz-noc-after-tamper', 'zz');
    PERFORM set_config('request.jwt.claims', '', true);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'FAIL: a tampered balance passed the commit check';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.chk_pass('immutable_and_proved_at_commit');
END $$;

-- ═══ 16. Closed loop, settlement off, old paths retired ═════════════════
DO $$
BEGIN
  BEGIN UPDATE public.noc_programme SET transferable = true WHERE id;
    RAISE EXCEPTION 'FAIL: NOC made transferable'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.noc_programme SET withdrawable = true WHERE id;
    RAISE EXCEPTION 'FAIL: NOC made withdrawable'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.noc_programme SET crypto_enabled = true WHERE id;
    RAISE EXCEPTION 'FAIL: crypto enabled'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.noc_programme SET settlement_enabled = true WHERE id;
    RAISE EXCEPTION 'FAIL: settlement on without approval'; EXCEPTION WHEN restrict_violation THEN NULL; END;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  BEGIN PERFORM public.noc_settlement_accrue(pg_temp.id('usage1'), gen_random_uuid());
    RAISE EXCEPTION 'FAIL: settlement accrued while off'; EXCEPTION WHEN feature_not_supported THEN NULL; END;
  BEGIN PERFORM public.credit_fulfil_purchase('anything');
    RAISE EXCEPTION 'FAIL: the old fulfilment still runs'; EXCEPTION WHEN feature_not_supported THEN NULL; END;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.chk_pass('closed_loop_settlement_off_old_paths_retired');
END $$;

-- ═══ 17. The report separates the four figures and finds no faults ══════
DO $$
DECLARE v jsonb;
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('request.jwt.claims', pg_temp.claims(pg_temp.id('admin')), true);
  SET LOCAL ROLE authenticated;
  v := public.noc_admin_report();
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v ? 'cash' AND v ? 'issuance' AND v ? 'redemption' AND v ? 'revenue', 'report sections';
  ASSERT (v #>> '{cash,live_received_minor}')::bigint = 0, 'test money counted as cash';
  ASSERT (v #>> '{cash,test_received_minor}')::bigint > 0, 'test money not shown separately';
  ASSERT (v #>> '{revenue,recognised_minor}')::bigint = 0, 'revenue recognised from test money';
  ASSERT (v #>> '{integrity,unbalanced_entries}')::int = 0, 'unbalanced entries';
  ASSERT (v #>> '{integrity,wallets_off_ledger}')::int = 0, 'wallets off ledger';
  PERFORM pg_temp.chk_pass('report_separates_cash_issuance_redemption_revenue');
END $$;

DO $$
BEGIN
  ASSERT cardinality(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) = 17,
    'summary: expected 17 passing checks, got '
    || cardinality(string_to_array(rtrim(current_setting('chk.passed'), ','), ','));
END $$;

SELECT (SELECT string_agg(name, ', ')
          FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name) AS checks_passed,
       (SELECT count(*) FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name) AS n_passed,
       (SELECT count(*) FROM auth.users WHERE email LIKE 'zz-noc-check-%') AS zz_users_discarded,
       (SELECT count(*) FROM public.noc_purchase_orders) AS zz_orders_discarded;

ROLLBACK;
