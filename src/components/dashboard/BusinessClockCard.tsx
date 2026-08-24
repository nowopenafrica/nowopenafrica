import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Power, Clock, Users, Radio, Truck, CalendarDays, Flame, ShieldCheck, Activity, Sparkles, ChevronDown, Copy, Megaphone, Instagram, MessageCircle, Mail, Store } from 'lucide-react';
import { Business } from '../../types';
import BusinessStatusBadge from '../BusinessStatusBadge';
import {
  BusinessClockConfig, WeekdayHours,
  loadClockConfig, saveClockConfig, resolveBusinessStatus,
  toggleBusinessStatus, getSmartReminder, applyReminderOption, pendingScheduledOpen,
  getCoachReminder, getOpenStreak, getOpeningReliability, getBusinessHealth, healthLabel,
  getStaffState, getAIOpeningAssistant, getOpeningCampaign, getNotificationCopy,
  formatMinutes, parseMinutes, currentMinutes, WEEKDAY_LABELS,
} from '../../lib/businessStatus';
import { syncOpenStatus } from '../../lib/openStatusSync';

interface BusinessClockCardProps {
  business: Business;
  /**
   * Every business the owner can switch the clock between. When this holds more
   * than one, a switcher appears in the header. Omit it (or pass one) and the
   * card behaves exactly as before — single-business owners get no extra chrome.
   */
  businesses?: Business[];
  /** Called with the chosen business id. Required for the switcher to appear. */
  onSelectBusiness?: (id: string) => void;
}

export default function BusinessClockCard({ business, businesses, onSelectBusiness }: BusinessClockCardProps) {
  const [config, setConfigState] = useState<BusinessClockConfig>(() => loadClockConfig(business));
  const [now, setNow] = useState(() => new Date());
  const [showHours, setShowHours] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  // Clock config is per-business and the useState initialiser above only runs on
  // first mount — without this, switching business would keep showing (and
  // saving over) the previous one's hours and flags.
  const loadedFor = useRef(business.id);
  useEffect(() => {
    if (loadedFor.current === business.id) return;
    loadedFor.current = business.id;
    setConfigState(loadClockConfig(business));
    setShowHours(false);
    setShowAssistant(false);
  }, [business]);

  // Switcher only earns its space when there's somewhere to switch to.
  const switchable = onSelectBusiness && businesses && businesses.length > 1 ? businesses : null;

  // A live status dot per business, so the switcher answers "which of my places
  // are open right now?" rather than just being navigation.
  const statuses = useMemo(() => {
    if (!switchable) return {};
    return Object.fromEntries(
      switchable.map((b) => [b.id, resolveBusinessStatus(b, loadClockConfig(b), now)])
    ) as Record<string, ReturnType<typeof resolveBusinessStatus>>;
  }, [switchable, now]);

  const status = useMemo(() => resolveBusinessStatus(business, config, now), [business, config, now]);
  const isOpen = status !== 'closed';
  const reminder = getSmartReminder(business, config, now);
  const coach = getCoachReminder(business, config, now);
  const pending = pendingScheduledOpen(config, now);
  const streak = getOpenStreak(business, config);
  const reliability = getOpeningReliability(business, config);
  const health = getBusinessHealth(business, config);
  const staff = getStaffState(business, config);
  const pack = useMemo(() => getAIOpeningAssistant(business, now), [business, now]);
  const campaign = useMemo(() => getOpeningCampaign(business), [business]);

  const todaySlot = config.autoHours[now.getDay()] || { open: '', close: '', closed: true };
  const todayLabel = todaySlot.closed
    ? 'Closed today'
    : `${formatMinutes(parseMinutes(todaySlot.open) || 0)} – ${formatMinutes(parseMinutes(todaySlot.close) || 0)}`;

  const save = (next: BusinessClockConfig) => {
    setConfigState(next);
    saveClockConfig(business.id, next);
  };

  const handleToggle = () => {
    const next = toggleBusinessStatus(business, now);
    setConfigState(next);
    // Push the owner's choice to the row so the public badge reflects it.
    syncOpenStatus(business.id, next.manualOverride ?? null);
    if (next.manualOverride === 'open') {
      toast.success(getNotificationCopy('open', business));
    } else {
      toast.success(`${business.name} is now CLOSED`);
    }
  };

  const handleReminder = (value: 'open' | 'later' | 'closed') => {
    const next = applyReminderOption(business, config, value, now);
    setConfigState(next);
    // "Later" keeps the scheduled opening — no DB override until it fires.
    syncOpenStatus(business.id, value === 'open' ? 'open' : value === 'closed' ? 'closed' : null);
    if (value === 'open') toast.success(getNotificationCopy('open', business));
    else if (value === 'later') toast.success('Opening scheduled in 30 minutes');
    else toast.success('Marked as closed today');
  };

  const handleFlag = (patch: Partial<BusinessClockConfig>) => save({ ...config, ...patch });

  const handleClockIn = (delta: number) => {
    if (!staff) return;
    const next = Math.max(0, Math.min(staff.total, (config.staffClockedIn ?? staff.available) + delta));
    save({ ...config, staffClockedIn: next });
  };

  const handleHours = (day: number, patch: Partial<WeekdayHours>) => {
    const autoHours = config.autoHours.map((s, i) => (i === day ? { ...s, ...patch } : s));
    save({ ...config, autoHours });
  };

  const handleDayClosed = (day: number, closed: boolean) => {
    handleHours(day, closed ? { closed: true, open: '', close: '' } : { closed: false, open: '08:00', close: '18:00' });
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast(`Could not copy ${label}`);
    }
  };

  const timeInputClass = 'w-20 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 min-h-[44px] text-xs text-gray-900 dark:text-white disabled:opacity-40';

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Bell size={24} className="text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-gray-900 dark:text-white">Business Clock</h2>
              <BusinessStatusBadge status={status} category={business.category} showSub />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {business.name} · {formatMinutes(currentMinutes(now))} · {todayLabel}
            </p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          aria-pressed={isOpen}
          aria-label={isOpen ? 'Business is open — tap to close' : 'Business is closed — tap to open'}
          className={`inline-flex items-center gap-2 px-6 min-h-[48px] rounded-xl font-bold text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-green-500 ${
            isOpen
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700'
              : 'bg-gray-500 dark:bg-gray-700 hover:bg-gray-600'
          }`}
        >
          <Power size={18} />
          {isOpen ? 'OPEN' : 'CLOSED'}
        </button>
      </div>

      {switchable && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Store size={13} className="text-gray-400 dark:text-gray-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Your businesses
            </p>
          </div>
          <div
            role="group"
            aria-label="Choose which business this clock controls"
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
          >
            {switchable.map((b) => {
              const active = b.id === business.id;
              const bStatus = statuses[b.id];
              // Tap target uses min-h in px, not rem: index.css scales the root
              // font-size down to 14px on phones as a global zoom lever, so a
              // rem-based minimum lands at ~38px and misses the 44px target.
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSelectBusiness!(String(b.id))}
                  aria-pressed={active}
                  title={`${b.name} — ${bStatus === 'closed' ? 'closed' : 'open'}`}
                  className={`inline-flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-xs font-semibold whitespace-nowrap border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-800 ${
                    active
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      bStatus === 'closed'
                        ? active ? 'bg-purple-300' : 'bg-gray-300 dark:bg-gray-600'
                        : 'bg-green-500'
                    }`}
                  />
                  <span className="max-w-[10rem] truncate">{b.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pending && !reminder && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 font-medium">
          <Clock size={14} /> Auto-opening in {pending.minsFromNow} min ({formatMinutes(currentMinutes(pending.at))})
        </p>
      )}

      {reminder && (
        <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-amber-600 dark:text-amber-400" />
            <p className="font-semibold text-sm text-amber-800 dark:text-amber-200">{reminder.prompt}</p>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">{reminder.note}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {reminder.options.map((o) => (
              <button
                key={o.value}
                onClick={() => handleReminder(o.value)}
                className={`inline-flex items-center justify-center px-3 min-h-[44px] rounded-lg text-xs font-semibold border transition ${
                  o.value === 'open'
                    ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {coach && (
        <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-purple-800 dark:text-purple-200 max-w-md">{coach.message}</p>
          </div>
          <button
            onClick={handleToggle}
            className="inline-flex items-center justify-center px-3 min-h-[44px] rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition"
          >
            {coach.cta}
          </button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Live signals</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleFlag({ liveNow: !config.liveNow })}
              className={`inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium transition ${
                config.liveNow ? 'bg-red-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Radio size={13} className={config.liveNow ? 'animate-pulse' : ''} /> Live
            </button>
            <button
              onClick={() => handleFlag({ deliveryActive: !config.deliveryActive })}
              className={`inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium transition ${
                config.deliveryActive ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <Truck size={13} /> Delivery
            </button>
            <button
              onClick={() => handleFlag({ appointmentOnly: !config.appointmentOnly })}
              className={`inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium transition ${
                config.appointmentOnly ? 'bg-orange-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <CalendarDays size={13} /> Appointments
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Staff clock-in</p>
          {/* Without a roster there is no denominator. This used to invent one
              (2–14 staff), so a sole trader could be told 7 of their 12 were on
              duty. Now it asks for the number once, then counts properly. */}
          {staff ? (
            <div className="flex items-center gap-2">
              <Users size={16} className="text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                {staff.available} of {staff.total} on duty
              </span>
              <button aria-label="One fewer on duty" onClick={() => handleClockIn(-1)} className="ml-auto w-[44px] h-[44px] rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">−</button>
              <button aria-label="One more on duty" onClick={() => handleClockIn(1)} className="w-[44px] h-[44px] rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-100 dark:hover:bg-gray-700">+</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">No team set up</span>
              <button
                type="button"
                onClick={() => {
                  const entered = window.prompt('How many people are on your team?');
                  const n = Number(entered);
                  if (Number.isFinite(n) && n > 0) save({ ...config, staffTotal: Math.floor(n), staffClockedIn: 0 });
                }}
                className="ml-auto inline-flex items-center min-h-[44px] px-3 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Set team size
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <div className="flex items-center gap-1.5">
            <Flame size={14} className="text-orange-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Open streak</p>
          </div>
          <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
            {streak === null ? <span className="text-gray-400 dark:text-gray-500">Not tracked yet</span> : `${streak} days`}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {streak === null ? 'Starts counting once you open from here' : streak > 0 ? 'Keep it going 🔥' : 'Open today to start'}
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-green-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Reliability</p>
          </div>
          <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
            {reliability === null ? <span className="text-gray-400 dark:text-gray-500">Not tracked yet</span> : `${reliability}%`}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Scheduled vs actual opening</p>
        </div>
        <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <div className="flex items-center gap-1.5">
            <Activity size={14} className="text-purple-500" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Business health</p>
          </div>
          <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">
            {health.score === null
              ? <span className="text-gray-400 dark:text-gray-500">Not enough data</span>
              : `${health.score}% · ${healthLabel(health.score)}`}
          </p>
          {health.score !== null && (
            <div className="mt-2 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${health.score >= 70 ? 'bg-green-500' : health.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${health.score}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <button
        onClick={() => setShowHours((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 min-h-[44px] pr-2 rounded-lg text-xs font-semibold text-purple-600 dark:text-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        <Clock size={14} /> Automatic opening hours
        <ChevronDown size={14} className={`transition-transform ${showHours ? 'rotate-180' : ''}`} />
      </button>
      {showHours && (
        <div className="mt-2 space-y-2">
          {config.autoHours.map((slot, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-10 font-medium text-gray-700 dark:text-gray-300">{WEEKDAY_LABELS[i]}</span>
              <label className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={!slot.closed}
                  onChange={(e) => handleDayClosed(i, !e.target.checked)}
                  className="accent-purple-600"
                />
                Open
              </label>
              <input
                type="time"
                value={slot.open || '08:00'}
                disabled={slot.closed}
                onChange={(e) => handleHours(i, { open: e.target.value })}
                className={timeInputClass}
              />
              <span className="text-gray-400">to</span>
              <input
                type="time"
                value={slot.close || '18:00'}
                disabled={slot.closed}
                onChange={(e) => handleHours(i, { close: e.target.value })}
                className={timeInputClass}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-600 dark:text-purple-400" />
            <h3 className="font-bold text-sm text-gray-900 dark:text-white">AI Opening Assistant</h3>
          </div>
          <button
            onClick={() => setShowAssistant((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-700 to-fuchsia-700 text-white hover:from-purple-800 hover:to-fuchsia-800 transition"
          >
            <Megaphone size={13} /> Generate today&apos;s opening campaign
          </button>
        </div>
        {showAssistant && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">{pack.greeting}</p>
            <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">Today&apos;s offer: {pack.offer}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => copy(pack.instagramCaption, 'Instagram caption')} className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 hover:bg-pink-100 dark:hover:bg-pink-900/40">
                <Instagram size={13} /> Instagram caption
              </button>
              <button onClick={() => copy(pack.whatsappStatus, 'WhatsApp status')} className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40">
                <MessageCircle size={13} /> WhatsApp status
              </button>
              <button onClick={() => copy(pack.xPost, 'X post')} className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600">
                <MessageCircle size={13} /> X post
              </button>
              <button onClick={() => copy(pack.sms, 'SMS')} className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                <Mail size={13} /> SMS
              </button>
              <button onClick={() => copy(pack.email, 'Email')} className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40">
                <Mail size={13} /> Email
              </button>
              <button
                onClick={() => copy(`${campaign.title}\n${campaign.flyerHeadline}\n${campaign.posterHeadline}\n${campaign.storyIdea}\n${campaign.reelIdea}\n${campaign.caption}\n${campaign.hashtags.join(' ')}`, 'Opening campaign')}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-[44px] rounded-lg text-xs font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/40"
              >
                <Copy size={13} /> Full campaign
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
