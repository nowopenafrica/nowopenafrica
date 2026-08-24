import { useState } from 'react';
import toast from 'react-hot-toast';
import { Heart, Plus, Gift, Users, Star, Share2, Send, Trash2, WalletCards, RefreshCw, Receipt, CheckCircle2, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { GrowthPlanModule } from '../../lib/growth';
import {
  LoyaltyProgram, LoyaltyCustomer, LoyaltyTxn,
  PROGRAM_PRESETS, rewardOptions, redeemOptionsFor,
  stampsAvailable, tierFor, addCustomer, recordVisit, redeemReward, redeemStamp,
  loyaltyStats, waMessage, programShareBlurb,
  loadProgram, saveProgram, loadCustomers, saveCustomers, loadTxns, saveTxns,
} from '../../lib/loyalty';

interface Props {
  business: Business;
  onNavigate: (module: GrowthPlanModule) => void;
}

const TIER_STYLES: Record<string, { label: string; chip: string }> = {
  New: { label: 'New', chip: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300' },
  Regular: { label: 'Regular', chip: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' },
  VIP: { label: 'VIP', chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300' },
};

const TXN_STYLES: Record<string, { label: string; chip: string; icon: typeof Star }> = {
  earn: { label: 'Earned', chip: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300', icon: Plus },
  redeem: { label: 'Redeemed', chip: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300', icon: Gift },
  bonus: { label: 'Bonus', chip: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', icon: Sparkles },
};

function waLink(phone: string, text: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '').replace(/^0/, '234');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function naira(n: number): string {
  return `₦${Number(n || 0).toLocaleString()}`;
}

export default function CustomerLoyaltyHub({ business, onNavigate }: Props) {
  const [program, setProgram] = useState<LoyaltyProgram>(() => loadProgram(business.id, business.name));
  const [customers, setCustomers] = useState<LoyaltyCustomer[]>(() => loadCustomers(business.id));
  const [txns, setTxns] = useState<LoyaltyTxn[]>(() => loadTxns(business.id));
  const [tab, setTab] = useState<'members' | 'program' | 'activity'>('members');
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [spend, setSpend] = useState<Record<string, string>>({});
  const [redeem, setRedeem] = useState<Record<string, string>>({});

  const persistCustomers = (next: LoyaltyCustomer[]) => { setCustomers(next); saveCustomers(business.id, next); };
  const persistTxns = (next: LoyaltyTxn[]) => { setTxns(next); saveTxns(business.id, next); };
  const persistProgram = (next: LoyaltyProgram) => { setProgram(next); saveProgram(business.id, next); };

  const stats = loyaltyStats(customers, txns);

  const addMember = () => {
    if (!form.name.trim() || !form.phone.trim()) return toast.error('Add a name and phone number.');
    const { customer, txn } = addCustomer(form.name, form.phone, program, form.note);
    persistCustomers([customer, ...customers]);
    if (txn) persistTxns([txn, ...txns]);
    setForm({ name: '', phone: '', note: '' });
    toast.success(`${customer.name} joined ${program.name}`);
  };

  const logVisit = (c: LoyaltyCustomer) => {
    const spendNum = Number(spend[c.id]) || 0;
    if (program.spendPerPoint > 0 && spendNum <= 0) return toast.error('Enter how much the customer spent.');
    const { customer, txn } = recordVisit(c, spendNum, program);
    persistCustomers(customers.map((x) => x.id === c.id ? customer : x));
    if (txn) persistTxns([txn, ...txns]);
    setSpend((prev) => ({ ...prev, [c.id]: '' }));
    toast.success(txn && txn.points > 0 ? `${txn.points} points earned` : 'Visit recorded');
  };

  const doRedeem = (c: LoyaltyCustomer, optionId: string) => {
    if (!optionId) return;
    const event = optionId === 'stamp-freebie'
      ? redeemStamp(c, program)
      : redeemReward(c, { id: optionId, label: rewardOptions(program).find((o) => o.id === optionId)?.label || 'Reward', cost: rewardOptions(program).find((o) => o.id === optionId)?.cost || 0, savings: 0 });
    if (!event) return toast.error('Not enough points for that reward yet.');
    persistCustomers(customers.map((x) => x.id === c.id ? event.customer : x));
    if (event.txn) persistTxns([event.txn, ...txns]);
    setRedeem((prev) => ({ ...prev, [c.id]: '' }));
    toast.success('Reward redeemed');
  };

  const removeMember = (c: LoyaltyCustomer) => {
    persistCustomers(customers.filter((x) => x.id !== c.id));
    persistTxns(txns.filter((t) => t.customerId !== c.id));
    toast.success(`${c.name} removed`);
  };

  const sendBalance = (c: LoyaltyCustomer) => {
    const text = waMessage(business, c, program);
    if (c.phone) window.open(waLink(c.phone, text), '_blank');
    else toast.success('Copy the message and send it from your phone.');
  };

  const shareProgram = () => {
    const text = programShareBlurb(business, program);
    if (business.phone) window.open(waLink(business.phone, text), '_blank');
    else toast.success('Copy the message and send it from your phone.');
  };

  const applyPreset = (key: string) => {
    const preset = PROGRAM_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    persistProgram({ ...program, ...preset.values });
    toast.success(`${preset.label} applied`);
  };

  const statCards = [
    ['Members', stats.members, 'text-purple-600 dark:text-purple-400'],
    ['Active (30d)', stats.active, 'text-green-600 dark:text-green-400'],
    ['Visits', stats.visits, 'text-blue-600 dark:text-blue-400'],
    ['Points out', stats.pointsOut, 'text-amber-600 dark:text-amber-400'],
    ['Rewards redeemed', stats.redemptions, 'text-red-600 dark:text-red-400'],
  ] as [string, number, string][];

  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name || 'Member';

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(([label, value, color]) => (
          <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Program header */}
      <div className="rounded-2xl bg-gradient-to-br from-rose-500 to-purple-600 p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Heart size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{program.name}</h3>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${program.active ? 'bg-green-400/20 text-green-100' : 'bg-gray-400/20 text-gray-100'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${program.active ? 'bg-green-300' : 'bg-gray-300'}`} />
                {program.active ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="text-sm opacity-90 mt-0.5">
              {program.stampsForReward > 0
                ? `Buy ${program.stampsForReward} times, get 1 item free.`
                : `Spend ${naira(program.spendPerPoint)} → 1 point, each worth ${naira(program.pointValue)} off.${program.welcomePoints > 0 ? ` ${program.welcomePoints} bonus points on signup.` : ''}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={shareProgram} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-white text-rose-600 hover:bg-rose-50 transition min-h-[44px]">
              <Share2 size={13} /> Share programme
            </button>
            <button onClick={() => onNavigate('promotions')} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-white/20 hover:bg-white/30 transition min-h-[44px]">
              <WalletCards size={13} /> Design loyalty card
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('members')}
          className={`inline-flex items-center px-3.5 rounded-lg text-sm font-medium transition ${tab === 'members' ? 'bg-purple-600 text-white' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} min-h-[44px]`}>
          Members ({customers.length})
        </button>
        <button onClick={() => setTab('program')}
          className={`inline-flex items-center px-3.5 rounded-lg text-sm font-medium transition ${tab === 'program' ? 'bg-purple-600 text-white' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} min-h-[44px]`}>
          Programme
        </button>
        <button onClick={() => setTab('activity')}
          className={`inline-flex items-center px-3.5 rounded-lg text-sm font-medium transition ${tab === 'activity' ? 'bg-purple-600 text-white' : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'} min-h-[44px]`}>
          Activity ({txns.length})
        </button>
      </div>

      {tab === 'members' && (
        <div className="space-y-4">
          {/* Add member */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Users size={16} className="text-purple-600 dark:text-purple-400" /> Add a member
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone / WhatsApp"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Note (optional)"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
            </div>
            <button onClick={addMember} className="mt-3 inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
              <Plus size={15} /> Add member
            </button>
            {program.welcomePoints > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">New members start with {program.welcomePoints} bonus points.</p>
            )}
          </div>

          {/* Member list */}
          {customers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
              <Heart size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No members yet. Add your first customer to start rewarding loyalty.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {customers.map((c) => {
                const tier = TIER_STYLES[tierFor(c)];
                const stamps = stampsAvailable(c, program);
                const options = redeemOptionsFor(program, c);
                const stampTotal = program.stampsForReward > 0 ? Math.min(c.visits, program.stampsForReward * (c.stampsUsed + 1)) : 0;
                return (
                  <div key={c.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-sm font-bold text-purple-600 dark:text-purple-300 shrink-0">
                          {c.name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.name}</h3>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${tier.chip}`}>
                              <Star size={9} /> {tier.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {c.phone} · {c.visits} visit{c.visits === 1 ? '' : 's'} · {c.lastVisit ? `last ${new Date(c.lastVisit).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'no visits yet'}
                            {c.note && <span> · {c.note}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-amber-600 dark:text-amber-400">{c.points}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">points</p>
                      </div>
                    </div>

                    {program.stampsForReward > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
                          <span>{stamps} stamp{stamps === 1 ? '' : 's'} available</span>
                          <span>next free item in {program.stampsForReward - (c.visits % program.stampsForReward)} visit{program.stampsForReward - (c.visits % program.stampsForReward) === 1 ? '' : 's'}</span>
                        </div>
                        <div className="flex gap-1">
                          {Array.from({ length: program.stampsForReward }).map((_, i) => (
                            <div key={i} className={`flex-1 h-2 rounded-full ${i < (stampTotal % program.stampsForReward) ? 'bg-rose-500' : 'bg-gray-100 dark:bg-gray-700'}`} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <input type="number" min="0" value={spend[c.id] || ''} onChange={(e) => setSpend({ ...spend, [c.id]: e.target.value })}
                          placeholder={program.spendPerPoint > 0 ? 'Amount spent (₦)' : 'Add a visit'}
                          className="inline-flex items-center w-36 px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
                        <button onClick={() => logVisit(c)} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition min-h-[44px]">
                          <CheckCircle2 size={13} /> Add visit
                        </button>
                      </div>
                      {options.length > 0 ? (
                        <select value={redeem[c.id] || ''} onChange={(e) => { setRedeem({ ...redeem, [c.id]: e.target.value }); doRedeem(c, e.target.value); }}
                          className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
                          <option value="">Redeem reward…</option>
                          {options.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}{o.cost > 0 ? ` (${o.cost} pts)` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-gray-400">Earn more to unlock rewards</span>
                      )}
                      <button onClick={() => sendBalance(c)} className="inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition min-h-[44px]">
                        <Send size={13} /> Balance
                      </button>
                      <button onClick={() => removeMember(c)} className="inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 transition min-h-[44px]">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'program' && (
        <div className="space-y-4">
          {/* Presets */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <RefreshCw size={16} className="text-purple-600 dark:text-purple-400" /> Start from a preset
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              {PROGRAM_PRESETS.map((p) => (
                <button key={p.key} onClick={() => applyPreset(p.key)}
                  className={`rounded-xl border p-4 text-left transition ${program.stampsForReward === p.values.stampsForReward && program.spendPerPoint === p.values.spendPerPoint ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'}`}>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{p.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{p.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Heart size={16} className="text-purple-600 dark:text-purple-400" /> Programme settings
              </h3>
              <button onClick={() => persistProgram({ ...program, active: !program.active })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${program.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${program.active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Programme name</label>
                <input value={program.name} onChange={(e) => persistProgram({ ...program, name: e.target.value })} placeholder="e.g. Meat Club Rewards"
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Spend per point (₦)</label>
                <input type="number" min="0" value={program.spendPerPoint} onChange={(e) => persistProgram({ ...program, spendPerPoint: Number(e.target.value) || 0 })}
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Point value (₦ off)</label>
                <input type="number" min="0" value={program.pointValue} onChange={(e) => persistProgram({ ...program, pointValue: Number(e.target.value) || 0 })}
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Welcome bonus</label>
                <input type="number" min="0" value={program.welcomePoints} onChange={(e) => persistProgram({ ...program, welcomePoints: Number(e.target.value) || 0 })}
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Stamp card: freebie after…</label>
                <input type="number" min="0" value={program.stampsForReward} onChange={(e) => persistProgram({ ...program, stampsForReward: Number(e.target.value) || 0 })}
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
            </div>
            <p className="text-[11px] text-gray-400">Set stamps to 5 for a classic “buy 5, get 1 free” card. Set it to 0 to run a pure points programme.</p>
          </div>

          {/* Rewards preview */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Gift size={16} className="text-purple-600 dark:text-purple-400" /> Members can redeem
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
              {rewardOptions(program).map((o) => (
                <div key={o.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{o.label}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{o.cost > 0 ? `${o.cost} points` : 'stamp reward'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        txns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
            <Receipt size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No activity yet. Add members and log visits to see points move.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
            {txns.map((t) => {
              const style = TXN_STYLES[t.type];
              const Icon = style.icon;
              return (
                <div key={t.id} className="flex items-center gap-3 p-4">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${t.type === 'earn' ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : t.type === 'redeem' ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'}`}>
                    <Icon size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{t.label}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {nameOf(t.customerId)} · {new Date(t.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} {new Date(t.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${style.chip}`}>{style.label}</span>
                  {t.points > 0 && <p className={`text-sm font-black ${t.type === 'redeem' ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{t.type === 'redeem' ? '-' : '+'}{t.points}</p>}
                </div>
              );
            })}
          </div>
        )
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Heart size={12} /> Members, points and activity are saved on this device for {business.name}.
      </p>
    </div>
  );
}
