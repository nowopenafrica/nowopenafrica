/**
 * The wallet client — thin wrappers over the database functions.
 *
 * Every function here is one RPC call. There is no logic, on purpose: the
 * decisions (can this person afford it, is the action priced, is this request
 * a duplicate) are all made inside Postgres, where the browser cannot reach
 * around them. See supabase/migrations/20261012020000_nowopen_credits_service.sql.
 *
 * Note what is missing: there is no `spendFor(userId)`. The spending RPCs take
 * no user id at all — they act on auth.uid(). A user parameter the client sets
 * is a parameter a client can point at somebody else's wallet.
 */

import { supabase } from '../supabase';

export interface Wallet {
  id: string;
  userId: string;
  /** Settled balance. Includes credits an open reservation has claimed. */
  balance: number;
  lifetimePurchased: number;
  lifetimeGranted: number;
  lifetimePromotional: number;
  lifetimeConsumed: number;
  lifetimeRefunded: number;
  lifetimeExpired: number;
}

export type CreditTxnType =
  | 'purchase' | 'subscription_grant' | 'promotional_grant'
  | 'usage' | 'refund' | 'admin_adjustment' | 'expiration' | 'reversal';

export interface CreditTransaction {
  id: string;
  type: CreditTxnType;
  /** Signed: positive added, negative spent. */
  amount: number;
  balanceAfter: number;
  source: string | null;
  description: string | null;
  businessId: string | null;
  createdAt: string;
}

export interface Reservation {
  id: string;
  actionSlug: string;
  amount: number;
  status: 'reserved' | 'consumed' | 'released' | 'expired';
  expiresAt: string;
}

/** Raised when the database refused a credit operation. */
export class CreditError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'CreditError';
  }
}

function fail(error: { message: string; code?: string } | null): never {
  throw new CreditError(error?.message ?? 'The credit service did not respond.', error?.code);
}

/** The signed-in person's wallet, created on first read. */
export async function fetchWallet(): Promise<Wallet> {
  const { data, error } = await supabase.rpc('credit_wallet_mine');
  if (error) fail(error);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, number | string>;
  return {
    id: String(r.id),
    userId: String(r.user_id),
    balance: Number(r.balance),
    lifetimePurchased: Number(r.lifetime_purchased),
    lifetimeGranted: Number(r.lifetime_granted),
    lifetimePromotional: Number(r.lifetime_promotional),
    lifetimeConsumed: Number(r.lifetime_consumed),
    lifetimeRefunded: Number(r.lifetime_refunded),
    lifetimeExpired: Number(r.lifetime_expired),
  };
}

/**
 * Credits spendable right now — balance minus everything held by open
 * reservations.
 *
 * This is the number to show beside a cost and to check before an action.
 * `wallet.balance` still counts credits a running video job has claimed, so
 * showing it would promise money that is already committed.
 */
export async function fetchAvailable(): Promise<number> {
  const { data, error } = await supabase.rpc('credit_available');
  if (error) fail(error);
  return Number(data ?? 0);
}

/** Recent ledger entries, newest first. RLS limits this to your own. */
export async function fetchTransactions(limit = 25): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id,type,amount,balance_after,source,description,business_id,created_at')
    .order('created_at', { ascending: false })
    // `id` breaks ties: entries written in one transaction share created_at to
    // the millisecond, and an unstable order loses rows across pages.
    .order('id', { ascending: false })
    .range(0, Math.max(0, limit - 1));
  if (error) fail(error);
  return ((data ?? []) as Array<Record<string, string | number | null>>).map((r) => ({
    id: String(r.id),
    type: r.type as CreditTxnType,
    amount: Number(r.amount),
    balanceAfter: Number(r.balance_after),
    source: (r.source as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    businessId: (r.business_id as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

/**
 * Charge for an action that cannot fail halfway — a caption, a description.
 *
 * `reference` is the idempotency key: pass a request id and a double-submitted
 * form charges once. Anything calling a paid external API should use
 * reserve/consume instead, so a provider timeout does not cost the customer.
 */
export async function chargeFor(
  action: string,
  opts: { reference?: string; businessId?: string } = {},
): Promise<void> {
  const { error } = await supabase.rpc('credit_charge', {
    p_action: action,
    p_reference: opts.reference ?? null,
    p_business: opts.businessId ?? null,
  });
  if (error) fail(error);
}

/** Hold credits for an operation about to run. Settle with consume/release. */
export async function reserveFor(
  action: string,
  opts: { reference?: string; businessId?: string } = {},
): Promise<Reservation> {
  const { data, error } = await supabase.rpc('credit_reserve', {
    p_action: action,
    p_reference: opts.reference ?? null,
    p_business: opts.businessId ?? null,
  });
  if (error) fail(error);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, string | number>;
  return {
    id: String(r.id),
    actionSlug: String(r.action_slug),
    amount: Number(r.amount),
    status: r.status as Reservation['status'],
    expiresAt: String(r.expires_at),
  };
}

/** The operation succeeded: turn the hold into a charge. Safe to retry. */
export async function consumeReservation(id: string): Promise<void> {
  const { error } = await supabase.rpc('credit_reservation_consume', { p_reservation: id });
  if (error) fail(error);
}

/** The operation failed: give the credits back. Writes no ledger entry. */
export async function releaseReservation(id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('credit_reservation_release', {
    p_reservation: id,
    p_reason: reason ?? null,
  });
  if (error) fail(error);
}

/**
 * Run an operation against a reservation, settling it either way.
 *
 * The shape that makes the failure path impossible to forget. Written by hand,
 * `release` is the line that gets skipped on the exception branch — and the
 * customer is charged for a provider that timed out.
 */
export async function withReservedCredits<T>(
  action: string,
  run: () => Promise<T>,
  opts: { reference?: string; businessId?: string } = {},
): Promise<T> {
  const reservation = await reserveFor(action, opts);
  let result: T;
  try {
    result = await run();
  } catch (err) {
    // Nothing was delivered, so nothing is charged. Release failures are
    // swallowed deliberately: the original error is what the caller needs,
    // and the sweeper (credit_expire_reservations) catches a stuck hold.
    await releaseReservation(reservation.id, err instanceof Error ? err.message : 'failed').catch(() => {});
    throw err;
  }
  await consumeReservation(reservation.id);
  return result;
}
