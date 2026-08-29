import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { X, Plus, Trash2, Loader2, Save, Sparkles } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import {
  stringList, faqList, teamList, credentialList, profileCompleteness,
  type Faq, type TeamMember, type Credential,
} from '../../lib/businessProfile';
import type { Business } from '../../types';

/**
 * Where an owner writes the parts of their page that sell it.
 *
 * Separate from BusinessForm, which is already 794 lines and covers identity —
 * name, category, contact, hours. Twenty-two more fields inline would make
 * that form something nobody finishes. This is its own screen, opened per
 * business, and it saves in one update.
 *
 * Not to be confused with TeamManager: that manages `business_members`, the
 * people who can sign in and act on the business. The team here is the public
 * "meet the team" — names and faces a customer sees, with no account and no
 * permissions attached.
 *
 * Nothing is required. A half-filled story still renders, because every
 * section on the public page hides itself when empty; the completeness meter
 * is what asks for more, and asking is better than blocking.
 */
interface Props {
  business: Business;
  onClose: () => void;
  onSaved?: () => void;
}

const POLICY_KEYS: { key: string; label: string; hint: string }[] = [
  { key: 'refund', label: 'Refunds', hint: 'When and how you refund' },
  { key: 'cancellation', label: 'Cancellations', hint: 'Notice needed, any fee' },
  { key: 'delivery', label: 'Delivery', hint: 'Areas, timing, cost' },
  { key: 'booking', label: 'Bookings', hint: 'Deposits, no-shows' },
  { key: 'warranty', label: 'Warranty', hint: 'What is covered, for how long' },
  { key: 'returns', label: 'Returns', hint: 'Condition and window' },
];

const PAYMENT_SUGGESTIONS = ['Cash', 'Card', 'Bank transfer', 'POS', 'Mobile money', 'Crypto', 'Cheque'];

/** Chips you add with Enter — faster than a row of inputs for short claims. */
function ChipList({
  label, hint, values, onChange, placeholder, suggestions = [],
}: {
  label: string; hint?: string; values: string[];
  onChange: (next: string[]) => void; placeholder: string; suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const add = (v: string) => {
    const t = v.trim();
    // Silently ignoring a duplicate is kinder than an error for a mis-tap.
    if (!t || values.includes(t)) { setDraft(''); return; }
    onChange([...values, t]);
    setDraft('');
  };

  return (
    <div>
      <label className="block text-sm font-semibold text-gray-900 dark:text-white">{label}</label>
      {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">{hint}</p>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder={placeholder}
          aria-label={label}
          className="flex-1 px-3 min-h-[40px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
        />
        <button type="button" onClick={() => add(draft)}
          className="px-3 min-h-[40px] rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200">
          Add
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {suggestions.filter((s) => !values.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="px-2 py-0.5 rounded-full text-[11px] border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

export default function BusinessStoryEditor({ business, onClose, onSaved }: Props) {
  const b = business as unknown as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? b[k] as string : '');

  const [tagline, setTagline] = useState(str('tagline'));
  const [about, setAbout] = useState(str('about') || str('description'));
  const [story, setStory] = useState(str('story'));
  const [vision, setVision] = useState(str('vision'));
  const [mission, setMission] = useState(str('mission'));
  const [values, setValues] = useState<string[]>(stringList(b.core_values));
  const [whyUs, setWhyUs] = useState<string[]>(stringList(b.why_us));
  const [faqs, setFaqs] = useState<Faq[]>(faqList(b.faqs));
  const [team, setTeam] = useState<TeamMember[]>(teamList(b.team));
  const [creds, setCreds] = useState<Credential[]>(credentialList(b.credentials));
  const [policies, setPolicies] = useState<Record<string, string>>(() => {
    const p = b.policies;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    return Object.fromEntries(Object.entries(p as Record<string, unknown>)
      .map(([k, v]) => [k, typeof v === 'string' ? v : '']));
  });
  const [foundedYear, setFoundedYear] = useState(
    typeof b.founded_year === 'number' ? String(b.founded_year) : '');
  const [employees, setEmployees] = useState(str('employees'));
  const [businessType, setBusinessType] = useState(str('business_type'));
  const [serviceArea, setServiceArea] = useState(str('service_area'));
  const [languages, setLanguages] = useState<string[]>(stringList(b.languages));
  const [payments, setPayments] = useState<string[]>(stringList(b.payment_methods));
  const [saving, setSaving] = useState(false);

  // Live score as they type, so the effort has visible payoff before saving.
  const live = useMemo(() => profileCompleteness({
    ...(b as Record<string, unknown>),
    tagline, about, story, vision, mission,
    core_values: values, why_us: whyUs, faqs, team,
    languages, payment_methods: payments,
    founded_year: foundedYear ? Number(foundedYear) : null,
  } as never), [b, tagline, about, story, vision, mission, values, whyUs, faqs, team, languages, payments, foundedYear]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const save = async () => {
    const year = foundedYear.trim() ? Number(foundedYear) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1800 || year > 2200)) {
      toast.error('Year founded looks wrong — use a full year, like 2018.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('businesses')
      .update({
        tagline: tagline.trim() || null,
        about: about.trim() || null,
        story: story.trim() || null,
        vision: vision.trim() || null,
        mission: mission.trim() || null,
        core_values: values,
        why_us: whyUs,
        // Drop half-written entries rather than storing a question with no
        // answer, which the page would refuse to render anyway.
        faqs: faqs.filter((f) => f.q.trim() && f.a.trim()),
        team: team.filter((m) => m.name.trim()),
        credentials: creds.filter((c) => c.label.trim()),
        policies: Object.fromEntries(Object.entries(policies).filter(([, v]) => v.trim())),
        founded_year: year,
        employees: employees.trim() || null,
        business_type: businessType.trim() || null,
        service_area: serviceArea.trim() || null,
        languages,
        payment_methods: payments,
      })
      .eq('id', business.id);
    setSaving(false);

    if (error) {
      toast.error(/column .* does not exist/i.test(error.message)
        ? 'Saving needs the business_profile migration applied first.'
        : error.message);
      return;
    }
    toast.success('Your page has been updated');
    onSaved?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Edit your business story">
      <div className="w-full max-w-3xl my-8 rounded-2xl bg-white dark:bg-gray-800 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-t-2xl">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Sparkles size={17} className="text-blue-600 dark:text-blue-400" /> Your business story
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {business.name} · page {live.percent}% complete
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Why us first, mirroring the public page: it is the section a
              visitor reads first and the one owners most often skip. */}
          <ChipList
            label="Why choose us"
            hint="Short reasons a customer should pick you. Three or more works best."
            values={whyUs} onChange={setWhyUs}
            placeholder="Same-day delivery"
          />

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label htmlFor="tagline" className="block text-sm font-semibold text-gray-900 dark:text-white">Tagline</label>
              <input id="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120}
                placeholder="Premium fresh meat, delivered to your door" className={`${field} mt-1`} />
            </div>
            <div>
              <label htmlFor="about" className="block text-sm font-semibold text-gray-900 dark:text-white">About</label>
              <textarea id="about" value={about} onChange={(e) => setAbout(e.target.value)} rows={4}
                placeholder="What you do, who you serve, and where." className={`${field} mt-1`} />
            </div>
            <div>
              <label htmlFor="story" className="block text-sm font-semibold text-gray-900 dark:text-white">Our story</label>
              <textarea id="story" value={story} onChange={(e) => setStory(e.target.value)} rows={3}
                placeholder="How the business started." className={`${field} mt-1`} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="vision" className="block text-sm font-semibold text-gray-900 dark:text-white">Vision</label>
                <textarea id="vision" value={vision} onChange={(e) => setVision(e.target.value)} rows={2} className={`${field} mt-1`} />
              </div>
              <div>
                <label htmlFor="mission" className="block text-sm font-semibold text-gray-900 dark:text-white">Mission</label>
                <textarea id="mission" value={mission} onChange={(e) => setMission(e.target.value)} rows={2} className={`${field} mt-1`} />
              </div>
            </div>
          </div>

          <ChipList label="What we stand for" hint="A few values." values={values} onChange={setValues} placeholder="Quality" />

          {/* FAQs */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white">Frequently asked questions</label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              The questions you answer on the phone every day. These also feed the AI assistant.
            </p>
            <div className="space-y-2">
              {faqs.map((f, i) => (
                <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <input value={f.q} aria-label={`Question ${i + 1}`}
                      onChange={(e) => setFaqs(faqs.map((x, j) => j === i ? { ...x, q: e.target.value } : x))}
                      placeholder="Do you deliver?" className={field} />
                    <button type="button" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`}
                      className="px-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                  <textarea value={f.a} rows={2} aria-label={`Answer ${i + 1}`}
                    onChange={(e) => setFaqs(faqs.map((x, j) => j === i ? { ...x, a: e.target.value } : x))}
                    placeholder="Yes, across Lagos, same day before 4pm." className={field} />
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setFaqs([...faqs, { q: '', a: '' }])}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400">
              <Plus size={14} /> Add a question
            </button>
          </div>

          {/* Team */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white">Meet the team</label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Shown on your page. This is not staff access — that is under Team in the dashboard.
            </p>
            <div className="space-y-2">
              {team.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <input value={m.name} placeholder="Name" aria-label={`Team member ${i + 1} name`}
                    onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={field} />
                  <input value={m.role ?? ''} placeholder="Role" aria-label={`Team member ${i + 1} role`}
                    onChange={(e) => setTeam(team.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} className={field} />
                  <button type="button" onClick={() => setTeam(team.filter((_, j) => j !== i))} aria-label={`Remove team member ${i + 1}`}
                    className="px-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setTeam([...team, { name: '' }])}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400">
              <Plus size={14} /> Add someone
            </button>
          </div>

          {/* Credentials */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white">Awards, licences and memberships</label>
            <div className="space-y-2 mt-2">
              {creds.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input value={c.label} placeholder="Best Local Food Brand" aria-label={`Credential ${i + 1}`}
                    onChange={(e) => setCreds(creds.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className={field} />
                  <input value={c.year ? String(c.year) : ''} placeholder="Year" inputMode="numeric" aria-label={`Credential ${i + 1} year`}
                    onChange={(e) => setCreds(creds.map((x, j) => j === i ? { ...x, year: Number(e.target.value) || undefined } : x))}
                    className={`${field} w-24 shrink-0`} />
                  <button type="button" onClick={() => setCreds(creds.filter((_, j) => j !== i))} aria-label={`Remove credential ${i + 1}`}
                    className="px-2 text-gray-400 hover:text-red-500"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setCreds([...creds, { label: '' }])}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400">
              <Plus size={14} /> Add one
            </button>
          </div>

          {/* Business information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="founded" className="block text-sm font-semibold text-gray-900 dark:text-white">Year founded</label>
              <input id="founded" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} inputMode="numeric"
                placeholder="2018" className={`${field} mt-1`} />
            </div>
            <div>
              <label htmlFor="employees" className="block text-sm font-semibold text-gray-900 dark:text-white">Team size</label>
              <input id="employees" value={employees} onChange={(e) => setEmployees(e.target.value)}
                placeholder="1–10" className={`${field} mt-1`} />
            </div>
            <div>
              <label htmlFor="btype" className="block text-sm font-semibold text-gray-900 dark:text-white">Business type</label>
              <input id="btype" value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                placeholder="Retail" className={`${field} mt-1`} />
            </div>
            <div>
              <label htmlFor="sarea" className="block text-sm font-semibold text-gray-900 dark:text-white">Service area</label>
              <input id="sarea" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)}
                placeholder="Lagos mainland" className={`${field} mt-1`} />
            </div>
          </div>

          <ChipList label="Languages" values={languages} onChange={setLanguages} placeholder="English"
            suggestions={['English', 'Yoruba', 'Igbo', 'Hausa', 'Pidgin', 'French', 'Swahili', 'Arabic']} />
          <ChipList label="Payment methods" values={payments} onChange={setPayments} placeholder="Bank transfer"
            suggestions={PAYMENT_SUGGESTIONS} />

          {/* Policies — only the ones written are ever shown publicly. */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-white">Policies</label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Leave blank whatever does not apply. Only what you write appears on your page.
            </p>
            <div className="space-y-2">
              {POLICY_KEYS.map((p) => (
                <div key={p.key}>
                  <label htmlFor={`pol-${p.key}`} className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {p.label} <span className="text-gray-400">— {p.hint}</span>
                  </label>
                  <textarea id={`pol-${p.key}`} rows={2} value={policies[p.key] ?? ''}
                    onChange={(e) => setPolicies({ ...policies, [p.key]: e.target.value })}
                    className={`${field} mt-1`} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {live.percent}% complete{live.next.length > 0 ? ` · next: ${live.next[0].label}` : ''}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 min-h-[44px] rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
