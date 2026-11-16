import { useState, type FormEvent } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

import { directionsToExplore, type BriefQuestion, type CreativeBrief, type Field } from '../../lib/create/brief';
import { SUBCATEGORIES } from '../../lib/create/catalogueTaxonomy';
import { industryOf, movementOf, requestFamilyOf } from '../../lib/create/intel';
import { formatOf } from '../../lib/design/formats';

/**
 * The brief, shown back to the person who typed it.
 *
 * ── WHY IT IS SHOWN ───────────────────────────────────────────────────────
 *
 * A request used to vanish into a gallery filter: the visitor could not see
 * what had been understood, so a misreading ("a fashion label" opened jar
 * labels) looked like the product being wrong. This says what was read, marks
 * every assumption as an assumption, and asks at most three things.
 *
 * Coolvetica is NowOpen's own face and is used for this panel's headings. It
 * is the interface speaking; customer designs never inherit it.
 */

const OBJECTIVE: Record<string, string> = {
  launch: 'Launch something new', opening: 'Announce an opening', sale: 'Promote an offer', event: 'Promote an event',
  identity: 'Build a brand identity', awareness: 'Get the business noticed', inform: 'Give people the facts', recruit: 'Bring people in',
};
const TIER: Record<string, string> = { luxury: 'Luxury', premium: 'Premium', mid: 'Mid-market', value: 'Value' };
const SCOPE: Record<string, string> = { single: 'One design', series: 'A series', system: 'A full set of matching pieces' };

function sourceNote(f: Field<unknown>): string {
  if (f.source === 'typed') return 'your words';
  if (f.source === 'inferred') return f.from ? `read from “${f.from}”` : 'read from your request';
  return f.from ? `assumed: ${f.from}` : 'assumed';
}

function Row({ label, value, field }: { label: string; value: string; field: Field<unknown> }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <dt className="text-[13px] font-semibold text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 text-[15px] text-gray-900 dark:text-white">
        {value}
        <span
          data-source={field.source}
          className={`ml-2 whitespace-nowrap text-[12px] ${field.source === 'default' ? 'text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`}
        >
          {sourceNote(field)}
        </span>
      </dd>
    </div>
  );
}

function Question({ q, onAnswer }: { q: BriefQuestion; onAnswer: (field: BriefQuestion['field'], value: string) => void }) {
  const [value, setValue] = useState('');
  const id = `brief-q-${q.field}`;
  const submit = (e: FormEvent) => { e.preventDefault(); if (value.trim()) onAnswer(q.field, value); };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-gray-200 p-3 dark:border-gray-700" data-testid={`brief-question-${q.field}`}>
      <label htmlFor={id} className="block text-[15px] font-semibold text-gray-900 dark:text-white">{q.ask}</label>
      <p className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-400">{q.why}</p>
      <div className="mt-2 flex min-w-0 gap-2">
        {q.options ? (
          <select
            id={id} value={value} onChange={(e) => setValue(e.target.value)}
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 text-[15px] text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
            <option value="">Choose…</option>
            {q.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            id={id} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off"
            className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-3 text-[15px] text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          />
        )}
        <button
          type="submit" disabled={!value.trim()}
          className="min-h-[44px] shrink-0 rounded-xl bg-green-700 px-4 text-sm font-bold text-white hover:bg-green-800 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  );
}

export default function BriefPanel({
  brief, businessName, onAnswer,
}: {
  brief: CreativeBrief;
  businessName?: string;
  onAnswer: (field: BriefQuestion['field'], value: string) => void;
}) {
  const sub = brief.deliverable ? SUBCATEGORIES.find((s) => s.key === brief.deliverable!.value) : null;
  const fmt = brief.format ? formatOf(brief.format.value) : null;
  const profile = brief.industry ? industryOf(brief.industry.value) : null;
  const family = brief.family ? requestFamilyOf(brief.family.value) : null;
  const explore = directionsToExplore(brief).map((k) => movementOf(k)!.name);
  const understoodNothing = !brief.deliverable && !brief.industry && brief.scope.value !== 'system';

  return (
    <section
      data-testid="brief-panel"
      aria-labelledby="brief-heading"
      className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/60 sm:p-5"
    >
      <h2 id="brief-heading" aria-live="polite" className="font-coolvetica text-[1.35rem] leading-tight text-gray-900 dark:text-white">
        {understoodNothing ? 'Tell us a little more' : 'Here is the brief we read'}
      </h2>
      <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-400">
        Anything marked <span className="text-amber-700 dark:text-amber-400">assumed</span> is our guess from the trade, not something you said.
      </p>

      <dl className="mt-3 divide-y divide-gray-200 dark:divide-gray-700">
        {businessName && <Row label="For" value={businessName} field={{ value: businessName, source: 'typed' }} />}
        {sub && brief.deliverable && (
          <Row label="Making" value={fmt ? `${sub.name} (${fmt.label})` : sub.name} field={brief.deliverable} />
        )}
        {!sub && family && brief.family && <Row label="Making" value={family.name} field={brief.family} />}
        {brief.scope.value !== 'single' && <Row label="How much" value={SCOPE[brief.scope.value]} field={brief.scope} />}
        {profile && brief.industry && <Row label="Business" value={profile.name} field={brief.industry} />}
        {brief.objective && <Row label="Goal" value={OBJECTIVE[brief.objective.value]} field={brief.objective} />}
        {brief.tier && <Row label="Level" value={TIER[brief.tier.value]} field={brief.tier} />}
        {brief.place && <Row label="Where" value={brief.place.value} field={brief.place} />}
        {brief.audience && <Row label="Who it is for" value={brief.audience.value} field={brief.audience} />}
        {brief.headline && <Row label="Your words" value={`“${brief.headline.value}”`} field={brief.headline} />}
        {profile && explore.length > 0 && (
          <Row label="Styles to explore" value={explore.join(' · ')} field={brief.movements} />
        )}
      </dl>

      {brief.limits.length > 0 && (
        <ul data-testid="brief-limits" className="mt-3 space-y-1.5 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {brief.limits.map((l) => (
            <li key={l} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{l}</li>
          ))}
        </ul>
      )}

      {brief.questions.length > 0 && (
        <div className="mt-4 space-y-2.5">
          <h3 className="font-coolvetica text-[1.05rem] text-gray-900 dark:text-white">
            {brief.questions.length === 1 ? 'One question' : `${brief.questions.length} questions`}
          </h3>
          {brief.questions.map((q) => <Question key={q.field} q={q} onAnswer={onAnswer} />)}
        </div>
      )}

      {brief.mustCarry.length > 0 && (
        <div className="mt-4">
          <h3 className="font-coolvetica text-[1.05rem] text-gray-900 dark:text-white">A finished piece will need</h3>
          <ul className="mt-1.5 grid gap-x-6 gap-y-1 text-[13px] text-gray-700 dark:text-gray-300 sm:grid-cols-2">
            {brief.mustCarry.map((m) => (
              <li key={m} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-green-700 dark:text-green-400" aria-hidden="true" />{m}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[12px] text-gray-500 dark:text-gray-400">You supply these. Nothing is made up for you.</p>
        </div>
      )}

      {brief.cautions.length > 0 && (
        <details className="mt-3 text-[13px] text-gray-700 dark:text-gray-300">
          <summary className="cursor-pointer font-semibold">Check before you publish</summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            {brief.cautions.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
