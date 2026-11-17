/**
 * /admin/credits — NowOpen Credits operations.
 *
 *   Report      cash, issuance, redemption and revenue kept apart, plus the
 *               ledger integrity counters.
 *   Launch      market rate and purchase mode; compliance approvals. Live
 *               mode is refused by the database without a recorded approval.
 *   Pricing     packs, action costs and plan allowances (rows, not code).
 *   Rewards     reward rules (off and unpriced until someone decides).
 *   Wallets     look up a customer; adjustments are requested, then decided;
 *               reversals and refunds are new entries.
 *   Settlement  media-owner settlement: built, switched off.
 *
 * Every write goes through a noc_admin_* function or an admin-RLS table
 * update, and each is recorded (ledger, adjustment requests or config
 * audit). Destructive actions confirm with ConfirmDialog.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { formatMinor } from '../lib/create/money';
import { formatLocalDate } from '../lib/dates';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatNoc, NOC_CLASS_LABELS, NOC_CLASS_ORDER, NOC_TYPE_LABELS, nocAdmin, type NocClass, type PurchaseMode } from '../lib/credits/noc';

type Tab = 'report' | 'launch' | 'pricing' | 'rewards' | 'wallets' | 'settlement';
const TABS: Array<[Tab, string]> = [
  ['report', 'Report'], ['launch', 'Launch & compliance'], ['pricing', 'Packs & prices'],
  ['rewards', 'Rewards'], ['wallets', 'Wallets & adjustments'], ['settlement', 'Settlement'],
];

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const n = (v: unknown) => { const x = typeof v === 'string' ? Number(v) : (v as number); return Number.isFinite(x) ? x : 0; };

interface Pending { title: string; message: string; tone?: 'primary' | 'danger'; run: () => Promise<unknown> }

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1 dark:border-gray-800">
          <dt className="text-gray-500">{k}</dt><dd className="font-medium text-gray-900 dark:text-gray-100">{v}</dd>
        </div>
      ))}
    </dl>
  );
}


/** A table read that reports failure instead of rendering an empty list. */
function useRead() {
  const [err, setErr] = useState<string | null>(null);
  // `never` parameter: any setter (Row[] => void, Row | null => void) fits.
  const take = useCallback((set: (v: never) => void, fallback: unknown) =>
    ({ data, error }: { data: unknown; error: { message: string } | null }) => {
      if (error) setErr(error.message); else set((data ?? fallback) as never);
    }, []);
  const Err = () => (err ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">{err}</p> : null);
  return { take, Err };
}

const input = 'rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800';
const btn = 'rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900';
const btnGhost = 'rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium dark:border-gray-600';

export default function AdminCredits() {
  const [tab, setTab] = useState<Tab>('report');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  const confirm = (p: Pending) => setPending(p);
  const run = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
      setFlash({ ok: true, text: `${pending.title}: done.` });
      setNonce((x) => x + 1);
    } catch (e) {
      setFlash({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">NowOpen Credits (NOC)</h1>
      <p className="mt-1 text-sm text-gray-500">Closed-loop credits: not transferable, not withdrawable, no crypto. Payments stay in Paystack test mode until the founder switches keys.</p>

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Credits sections">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === k ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
            {label}
          </button>
        ))}
      </nav>

      {flash && (
        <p role="status" className={`mt-4 rounded-md p-3 text-sm ${flash.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>{flash.text}</p>
      )}

      <div className="mt-5 space-y-5">
        {tab === 'report' && <ReportTab key={nonce} />}
        {tab === 'launch' && <LaunchTab key={nonce} confirm={confirm} />}
        {tab === 'pricing' && <PricingTab key={nonce} confirm={confirm} />}
        {tab === 'rewards' && <RewardsTab key={nonce} confirm={confirm} />}
        {tab === 'wallets' && <WalletsTab nonce={nonce} confirm={confirm} />}
        {tab === 'settlement' && <SettlementTab key={nonce} />}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        tone={pending?.tone ?? 'primary'}
        busy={busy}
        onConfirm={run}
        onCancel={() => setPending(null)}
      />
    </main>
  );
}

// ── Report ──────────────────────────────────────────────────────────────

function ReportTab() {
  const [r, setR] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { nocAdmin.report().then(setR, (e) => setErr(String(e?.message ?? e))); }, []);
  if (err) return <p className="text-red-700">{err}</p>;
  if (!r) return <p className="text-gray-500">Loading…</p>;
  const cash = (r.cash ?? {}) as Row;
  const issuance = (r.issuance ?? {}) as Row;
  const red = (r.redemption ?? {}) as Row;
  const rev = (r.revenue ?? {}) as Row;
  const out = (r.outstanding ?? {}) as Row;
  const integ = (r.integrity ?? {}) as Row;
  const ngn = (v: unknown) => formatMinor(n(v), 'NGN');
  const map = (o: unknown) => Object.entries((o ?? {}) as Row).map(([k, v]) => [k, formatNoc(n(v))] as [string, React.ReactNode]);
  return (
    <>
      <Card title="Cash (money received for NOC)">
        <KV rows={[
          ['Live received', ngn(cash.live_received_minor)], ['Live orders', s(cash.live_orders)],
          ['Live refunded (cash moved in Paystack)', `${s(cash.live_refunded_orders)} · ${ngn(cash.live_refunded_minor)}`],
          ['Test payments (not cash)', `${s(cash.test_orders)} · ${ngn(cash.test_received_minor)}`],
          ['Mismatched payments', s(cash.mismatched_orders)], ['Unfinished orders', s(cash.open_orders)],
        ]} />
      </Card>
      <Card title="Issuance (NOC created)"><KV rows={map(issuance).length ? map(issuance) : [['Nothing issued', '—']]} /></Card>
      <Card title="Redemption (NOC spent)">
        <KV rows={[...map(red.by_class).map(([k, v]) => [`class: ${k}`, v] as [string, React.ReactNode]),
                   ...map(red.by_pillar).map(([k, v]) => [`pillar: ${k}`, v] as [string, React.ReactNode])]} />
        {map(red.by_class).length === 0 && <p className="text-sm text-gray-500">No NOC spent yet.</p>}
      </Card>
      <Card title="Revenue">
        <KV rows={[['Recognised', ngn(rev.recognised_minor)], ['Average live price per bought NOC', rev.avg_minor_per_purchased_noc == null ? '—' : ngn(rev.avg_minor_per_purchased_noc)]]} />
        <p className="mt-2 text-xs text-gray-500">{s(rev.basis)}</p>
      </Card>
      <Card title="Outstanding">
        <KV rows={[...map(out.by_class), ['Bought-NOC liability', ngn(out.purchased_liability_minor)]]} />
      </Card>
      <Card title="Ledger integrity">
        <KV rows={[['Unbalanced entries', s(integ.unbalanced_entries)], ['Wallets off ledger', s(integ.wallets_off_ledger)], ['Paid but not credited', s(integ.paid_not_fulfilled)]]} />
      </Card>
    </>
  );
}

// ── Launch & compliance ─────────────────────────────────────────────────

function LaunchTab({ confirm }: { confirm: (p: Pending) => void }) {
  const { take, Err } = useRead();
  const [markets, setMarkets] = useState<Row[]>([]);
  const [approvals, setApprovals] = useState<Row[]>([]);
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [a, setA] = useState({ scope: 'live_purchases', market: 'NG', approverName: '', approverRole: '', documentRef: '', notes: '' });
  const [liveWith, setLiveWith] = useState('');

  useEffect(() => {
    supabase.from('noc_markets').select('*').order('code').then(take((rows: Row[]) => {
      setMarkets(rows);
      if (rows[0]) setRate(String(n(rows[0].minor_per_noc) / 100));
    }, []));
    supabase.from('noc_compliance_approvals').select('*').order('recorded_at', { ascending: false }).then(take(setApprovals, []));
  }, [take]);

  const m = markets[0];
  if (!m) return <><Err /><p className="text-gray-500">Loading…</p></>;
  const activeLive = approvals.filter((x) => x.scope === 'live_purchases' && x.market === m.code && !x.revoked_at);
  const setMode = (mode: PurchaseMode, approval?: string) => confirm({
    title: `Set ${s(m.name)} purchases to ${mode}`,
    message: mode === 'live'
      ? 'Real customers will be able to buy NOC. Paystack must be on LIVE keys for real money; with test keys, test cards will create sandbox credits only.'
      : mode === 'sandbox' ? 'Only administrators can buy, using Paystack test payments. Test credits are kept in the Test top-ups class.'
      : 'Nobody can start a top-up. Orders already paid are still credited.',
    tone: mode === 'live' ? 'danger' : 'primary',
    run: () => nocAdmin.setPurchaseMode(s(m.code), mode, approval ?? null),
  });

  return (
    <>
      <Err />
      <Card title={`Market: ${s(m.name)} (${s(m.currency)})`}>
        <KV rows={[
          ['Purchase mode', <strong key="m">{s(m.purchase_mode)}</strong>], ['Enabled', m.enabled ? 'yes' : 'no'],
          ['Face value per NOC', formatMinor(n(m.minor_per_noc), s(m.currency))], ['Launched', m.launched_at ? formatLocalDate(s(m.launched_at)) : '—'],
          ['Rate note', s(m.rate_note) || '—'],
        ]} />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={btnGhost} type="button" onClick={() => setMode('off')}>Off</button>
          <button className={btnGhost} type="button" onClick={() => setMode('sandbox')}>Sandbox (admins, test payments)</button>
          <select className={input} value={liveWith} onChange={(e) => setLiveWith(e.target.value)} aria-label="Approval for live mode">
            <option value="">Live needs an approval…</option>
            {activeLive.map((x) => <option key={s(x.id)} value={s(x.id)}>{s(x.approver_name)} · {s(x.document_ref)}</option>)}
          </select>
          <button className={btn} type="button" disabled={!liveWith} onClick={() => setMode('live', liveWith)}>Go live</button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="text-sm">Naira per NOC<br /><input className={input} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" /></label>
          <label className="flex-1 text-sm">Why<br /><input className={`${input} w-full`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className={btn} type="button" disabled={!(Number(rate) > 0) || !note.trim()}
            onClick={() => confirm({ title: 'Change the NOC rate', message: `New face value ₦${rate} per NOC. Existing entries keep the rate they were written at.`,
              run: () => nocAdmin.updateMarket(s(m.code), { minorPerNoc: Math.round(Number(rate) * 100), rateNote: note }) })}>
            Save rate
          </button>
        </div>
      </Card>

      <Card title="Compliance approvals">
        {approvals.length === 0 && <p className="text-sm text-gray-500">None recorded. Live purchases and settlement stay locked until one is.</p>}
        <ul className="space-y-2 text-sm">
          {approvals.map((x) => (
            <li key={s(x.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-100 p-2 dark:border-gray-800">
              <span><strong>{s(x.scope)}</strong> {s(x.market)} · {s(x.approver_name)} ({s(x.approver_role)}) · {s(x.document_ref)} · {formatLocalDate(s(x.recorded_at))}
                {x.revoked_at ? <em className="ml-2 text-red-700">revoked: {s(x.revoke_reason)}</em> : null}</span>
              {!x.revoked_at && (
                <button className={btnGhost} type="button" onClick={() => confirm({
                  title: 'Revoke approval', tone: 'danger', message: 'Anything relying on it switches off at once (a live market goes to off).',
                  run: () => nocAdmin.revokeApproval(s(x.id), 'Revoked from the admin screen'),
                })}>Revoke</button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <select className={input} value={a.scope} onChange={(e) => setA({ ...a, scope: e.target.value })}>
            <option value="live_purchases">Live purchases</option><option value="settlement">Media-owner settlement</option>
          </select>
          <input className={input} placeholder="Approver's name" value={a.approverName} onChange={(e) => setA({ ...a, approverName: e.target.value })} />
          <input className={input} placeholder="Role (e.g. Legal counsel)" value={a.approverRole} onChange={(e) => setA({ ...a, approverRole: e.target.value })} />
          <input className={input} placeholder="Document reference" value={a.documentRef} onChange={(e) => setA({ ...a, documentRef: e.target.value })} />
          <input className={`${input} sm:col-span-2`} placeholder="Notes" value={a.notes} onChange={(e) => setA({ ...a, notes: e.target.value })} />
        </div>
        <button className={`${btn} mt-2`} type="button" disabled={!a.approverName.trim() || !a.approverRole.trim() || !a.documentRef.trim()}
          onClick={() => confirm({ title: 'Record approval', message: 'Approvals cannot be edited once recorded, only revoked.',
            run: () => nocAdmin.recordApproval({ scope: a.scope as 'live_purchases' | 'settlement', market: a.scope === 'live_purchases' ? a.market : null,
              approverName: a.approverName, approverRole: a.approverRole, documentRef: a.documentRef, notes: a.notes }) })}>
          Record approval
        </button>
      </Card>
    </>
  );
}

// ── Packs & prices ──────────────────────────────────────────────────────

function EditableTable({ table, keyCol, cols, rows, confirm }: {
  table: string; keyCol: string; rows: Row[]; confirm: (p: Pending) => void;
  cols: Array<{ k: string; label: string; type: 'int' | 'money' | 'bool' }>;
}) {
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const val = (r: Row, k: string) => (edits[s(r[keyCol])]?.[k] ?? r[k]);
  const set = (r: Row, k: string, v: unknown) => setEdits((e) => ({ ...e, [s(r[keyCol])]: { ...(e[s(r[keyCol])] ?? {}), [k]: v } }));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">{keyCol}</th>{cols.map((c) => <th key={c.k} className="py-1 pr-3">{c.label}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const key = s(r[keyCol]);
            const dirty = !!edits[key];
            return (
              <tr key={key} className="border-t border-gray-100 dark:border-gray-800">
                <td className="py-1.5 pr-3 font-mono text-xs">{key}</td>
                {cols.map((c) => (
                  <td key={c.k} className="py-1.5 pr-3">
                    {c.type === 'bool' ? (
                      <input type="checkbox" checked={!!val(r, c.k)} onChange={(e) => set(r, c.k, e.target.checked)} />
                    ) : (
                      <input className={`${input} w-28`} inputMode="decimal"
                        value={val(r, c.k) === null || val(r, c.k) === undefined ? '' : c.type === 'money' ? String(n(val(r, c.k)) / 100) : s(val(r, c.k))}
                        placeholder="unpriced"
                        onChange={(e) => set(r, c.k, e.target.value === '' ? null : c.type === 'money' ? Math.round(Number(e.target.value) * 100) : Math.round(Number(e.target.value)))} />
                    )}
                  </td>
                ))}
                <td className="py-1.5">
                  {dirty && (
                    <button className={btn} type="button" onClick={() => confirm({
                      title: `Save ${key}`, message: 'Takes effect at once for new purchases and charges. Entries already written keep their snapshot. The change is recorded in the config audit.',
                      run: async () => {
                        const { error } = await supabase.from(table).update(edits[key]).eq(keyCol, key);
                        if (error) throw new Error(error.message);
                      },
                    })}>Save</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PricingTab({ confirm }: { confirm: (p: Pending) => void }) {
  const { take, Err } = useRead();
  const [packs, setPacks] = useState<Row[]>([]);
  const [actions, setActions] = useState<Row[]>([]);
  const [allow, setAllow] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from('credit_packages').select('slug,name,credits,bonus_credits,price_minor,currency,active').order('sort_order').then(take(setPacks, []));
    supabase.from('credit_actions').select('slug,name,pillar,credit_cost,enabled').order('slug').then(take(setActions, []));
    supabase.from('credit_plan_allowances').select('plan,monthly_credits,enabled').order('plan').then(take(setAllow, []));
  }, [take]);
  return (
    <>
      <Err />
      <Card title="Packs (price in naira; empty = not for sale)">
        <EditableTable table="credit_packages" keyCol="slug" rows={packs} confirm={confirm}
          cols={[{ k: 'credits', label: 'NOC', type: 'int' }, { k: 'bonus_credits', label: 'Bonus', type: 'int' }, { k: 'price_minor', label: 'Price ₦', type: 'money' }, { k: 'active', label: 'On sale', type: 'bool' }]} />
      </Card>
      <Card title="What NOC buys (cost in NOC; empty = refused, never free)">
        <EditableTable table="credit_actions" keyCol="slug" rows={actions} confirm={confirm}
          cols={[{ k: 'credit_cost', label: 'NOC', type: 'int' }, { k: 'enabled', label: 'Enabled', type: 'bool' }]} />
      </Card>
      <Card title="Monthly plan allowances (Included class)">
        <EditableTable table="credit_plan_allowances" keyCol="plan" rows={allow} confirm={confirm}
          cols={[{ k: 'monthly_credits', label: 'NOC / month', type: 'int' }, { k: 'enabled', label: 'Enabled', type: 'bool' }]} />
      </Card>
    </>
  );
}

// ── Rewards ─────────────────────────────────────────────────────────────

function RewardsTab({ confirm }: { confirm: (p: Pending) => void }) {
  const { take, Err } = useRead();
  const [rules, setRules] = useState<Row[]>([]);
  const [prog, setProg] = useState<Row | null>(null);
  const [recent, setRecent] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from('noc_reward_rules').select('*').order('slug').then(take(setRules, []));
    supabase.from('noc_programme').select('*').maybeSingle().then(take(setProg, null));
    supabase.from('noc_reward_grants').select('rule_slug,status,reason,amount,created_at').order('created_at', { ascending: false }).limit(20).then(take(setRecent, []));
  }, [take]);
  return (
    <>
      <Err />
      <Card title="Rewards programme">
        <p className="text-sm">Rewards are <strong>{prog?.rewards_enabled ? 'on' : 'off'}</strong>. A rule pays out only when the programme and the rule are both on and the rule has an amount.</p>
        <button className={`${btnGhost} mt-2`} type="button" onClick={() => confirm({
          title: prog?.rewards_enabled ? 'Switch rewards off' : 'Switch rewards on',
          message: 'Applies to events from now on. Every attempt, granted or refused, is logged.',
          run: () => nocAdmin.updateProgramme({ rewardsEnabled: !prog?.rewards_enabled }),
        })}>{prog?.rewards_enabled ? 'Switch off' : 'Switch on'}</button>
      </Card>
      <Card title="Rules">
        <EditableTable table="noc_reward_rules" keyCol="slug" rows={rules} confirm={confirm}
          cols={[{ k: 'amount', label: 'NOC', type: 'int' }, { k: 'enabled', label: 'On', type: 'bool' },
                 { k: 'per_user_limit', label: 'Per account', type: 'int' }, { k: 'per_user_daily_limit', label: 'Per day', type: 'int' },
                 { k: 'global_budget', label: 'Budget NOC', type: 'int' }, { k: 'min_account_age_hours', label: 'Min age h', type: 'int' },
                 { k: 'require_email_confirmed', label: 'Email confirmed', type: 'bool' }, { k: 'once_per_subject', label: 'Once per subject', type: 'bool' }]} />
      </Card>
      <Card title="Recent reward attempts">
        {recent.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
          <ul className="text-sm">{recent.map((g, i) => <li key={i}>{formatLocalDate(s(g.created_at))} · {s(g.rule_slug)} · {s(g.status)}{g.reason ? ` (${s(g.reason)})` : ''}{g.amount ? ` · ${formatNoc(n(g.amount))}` : ''}</li>)}</ul>
        )}
      </Card>
    </>
  );
}

// ── Wallets & adjustments ───────────────────────────────────────────────

function WalletsTab({ nonce, confirm }: { nonce: number; confirm: (p: Pending) => void }) {
  const { take, Err } = useRead();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Array<{ id: string; email: string; name: string | null; plan: string; balance: number }>>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [w, setW] = useState<Row | null>(null);
  const [pendingReqs, setPendingReqs] = useState<Row[]>([]);
  const [adj, setAdj] = useState({ cls: 'promotional' as NocClass, amount: '', reason: '', evidence: '' });
  const [reason, setReason] = useState('');

  const loadWallet = useCallback(async (id: string) => { setW(await nocAdmin.wallet(id)); }, []);
  useEffect(() => { if (userId) void loadWallet(userId); }, [userId, nonce, loadWallet]);
  useEffect(() => {
    supabase.from('noc_adjustment_requests').select('*').eq('status', 'pending').order('requested_at').then(take(setPendingReqs, []));
  }, [nonce, take]);

  const classes = useMemo(() => (w?.classes ?? {}) as Row, [w]);
  const txns = (w?.transactions ?? []) as Row[];
  const orders = (w?.orders ?? []) as Row[];
  const needReason = !reason.trim();

  return (
    <>
      <Err />
      <Card title={`Pending adjustments (${pendingReqs.length})`}>
        {pendingReqs.length === 0 ? <p className="text-sm text-gray-500">None waiting.</p> : (
          <ul className="space-y-2 text-sm">
            {pendingReqs.map((r) => (
              <li key={s(r.id)} className="flex flex-wrap items-center justify-between gap-2">
                <span>{n(r.amount) > 0 ? '+' : ''}{formatNoc(n(r.amount))} {s(r.credit_class)} · {s(r.reason)} · requested {formatLocalDate(s(r.requested_at))}</span>
                <span className="flex gap-2">
                  <button className={btn} type="button" onClick={() => confirm({ title: 'Approve adjustment', message: `${formatNoc(n(r.amount))} (${s(r.credit_class)}) for: ${s(r.reason)}`, run: () => nocAdmin.decideAdjustment(s(r.id), true) })}>Approve</button>
                  <button className={btnGhost} type="button" onClick={() => confirm({ title: 'Reject adjustment', message: s(r.reason), run: () => nocAdmin.decideAdjustment(s(r.id), false) })}>Reject</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Find a wallet">
        <div className="flex gap-2">
          <input className={`${input} flex-1`} placeholder="Email or name" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={btn} type="button" disabled={q.trim().length < 2} onClick={() => nocAdmin.findUsers(q).then(setFound)}>Search</button>
        </div>
        <ul className="mt-2 text-sm">
          {found.map((u) => (
            <li key={u.id}><button type="button" className="underline" onClick={() => setUserId(u.id)}>{u.email}</button> · {u.plan} · {formatNoc(n(u.balance))}</li>
          ))}
        </ul>
      </Card>

      {w && userId && (
        <>
          <Card title={`Wallet: ${s((w.user as Row)?.email)}`}>
            <KV rows={[['Balance', formatNoc(n(w.balance))], ['Available', formatNoc(n(w.available))],
              ...NOC_CLASS_ORDER.map((c) => [NOC_CLASS_LABELS[c], formatNoc(n(classes[c]))] as [string, React.ReactNode])]} />
          </Card>

          <Card title="Request an adjustment (applied only once decided)">
            <div className="grid gap-2 sm:grid-cols-4">
              <select className={input} value={adj.cls} onChange={(e) => setAdj({ ...adj, cls: e.target.value as NocClass })}>
                {NOC_CLASS_ORDER.filter((c) => c !== 'sandbox').map((c) => <option key={c} value={c}>{NOC_CLASS_LABELS[c]}</option>)}
              </select>
              <input className={input} placeholder="NOC (+ adds, − removes)" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
              <input className={`${input} sm:col-span-2`} placeholder="Reason (required)" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
              <input className={`${input} sm:col-span-4`} placeholder="Evidence (ticket, screenshot link)" value={adj.evidence} onChange={(e) => setAdj({ ...adj, evidence: e.target.value })} />
            </div>
            <button className={`${btn} mt-2`} type="button" disabled={!Number.isInteger(Number(adj.amount)) || Number(adj.amount) === 0 || !adj.reason.trim()}
              onClick={() => confirm({ title: 'Request adjustment', message: `${adj.amount} NOC (${adj.cls}): ${adj.reason}`,
                run: () => nocAdmin.requestAdjustment(userId, adj.cls, Number(adj.amount), adj.reason, adj.evidence) })}>Request</button>
          </Card>

          <Card title="Entries">
            <input className={`${input} mb-2 w-full`} placeholder="Reason for a reversal or refund (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <ul className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
              {txns.map((t) => (
                <li key={s(t.id)} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span>{formatLocalDate(s(t.created_at))} · {NOC_TYPE_LABELS[s(t.type)] ?? s(t.type)} · {n(t.amount) > 0 ? '+' : ''}{formatNoc(n(t.amount))} · {s(t.description)}</span>
                  {['subscription_grant', 'promotional_grant', 'admin_adjustment'].includes(s(t.type)) && (
                    <button className={btnGhost} type="button" disabled={needReason} onClick={() => confirm({ title: 'Reverse entry', tone: 'danger', message: `A new reversing entry for ${formatNoc(Math.abs(n(t.amount)))}. The original stays on record.`, run: () => nocAdmin.reverse(s(t.id), reason) })}>Reverse</button>
                  )}
                  {s(t.type) === 'usage' && (
                    <button className={btnGhost} type="button" disabled={needReason} onClick={() => confirm({ title: 'Refund usage', message: `Return ${formatNoc(Math.abs(n(t.amount)))} to the classes it came from.`, run: () => nocAdmin.refundUsage(s(t.id), reason) })}>Refund</button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Top-up orders">
            {orders.length === 0 ? <p className="text-sm text-gray-500">None.</p> : (
              <ul className="text-sm">
                {orders.map((o) => (
                  <li key={s(o.id)} className="flex flex-wrap items-center justify-between gap-2 py-1">
                    <span>{formatLocalDate(s(o.created_at))} · {s(o.pack_slug)} · {formatMinor(n(o.price_minor), s(o.currency))} · {s(o.status)} · {s(o.provider_domain) || '—'}{o.note ? ` · ${s(o.note)}` : ''}</span>
                    {s(o.status) === 'fulfilled' && (
                      <button className={btnGhost} type="button" disabled={needReason} onClick={() => confirm({ title: 'Refund purchase', tone: 'danger',
                        message: 'Takes the NOC back from the wallet. The cash itself must be refunded in the Paystack dashboard; NowOpen does not move money.',
                        run: () => nocAdmin.refundPurchase(s(o.reference), reason) })}>Refund</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}

// ── Settlement ──────────────────────────────────────────────────────────

function SettlementTab() {
  const { take, Err } = useRead();
  const [prog, setProg] = useState<Row | null>(null);
  const [agreements, setAgreements] = useState<number | null>(null);
  useEffect(() => {
    supabase.from('noc_programme').select('settlement_enabled').maybeSingle().then(take(setProg, null));
    supabase.from('noc_settlement_agreements').select('id', { count: 'exact', head: true }).then(({ count, error }) => { if (error) take(setProg, null)({ data: null, error }); else setAgreements(count ?? 0); });
  }, [take]);
  return (
    <Card title="Media-owner settlement">
      <Err />
      <p className="text-sm">Settlement is <strong>{prog?.settlement_enabled ? 'on' : 'off'}</strong>. {agreements ?? 0} agreement(s) on file.</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        When a business spends NOC on a third-party billboard, the owner's agreed share accrues per spend and is batched for payout. It is built and switched off:
        turning it on needs a recorded settlement approval (Launch &amp; compliance), and this screen has no switch for it. NowOpen never pays a partner automatically; a person pays and records the reference.
      </p>
    </Card>
  );
}
