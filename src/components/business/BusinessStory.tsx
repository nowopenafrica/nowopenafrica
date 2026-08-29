import { Check, HelpCircle, Users, Award, Building2, ShieldCheck } from 'lucide-react';

import {
  stringList, faqList, teamList, credentialList, policyEntries, yearsInBusiness,
  type ProfileStory,
} from '../../lib/businessProfile';

/**
 * The parts of a business page that answer "why you?" rather than "what are you?".
 *
 * Every block renders only if it has content. That is the whole discipline
 * here: a page of empty headings tells a visitor the business could not be
 * bothered, which is the opposite of what a profile is for. Nothing is gated
 * on category — a category cannot know whether THIS business wrote an FAQ,
 * and the content already knows.
 */
interface Props {
  business: ProfileStory & { description?: string | null; category?: string | null };
  now?: Date;
}

function Section({
  title, icon: Icon, children,
}: { title: string; icon: typeof Check; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
        <Icon size={17} className="text-blue-600 dark:text-blue-400" /> {title}
      </h3>
      {children}
    </section>
  );
}

const POLICY_LABEL: Record<string, string> = {
  refund: 'Refunds',
  cancellation: 'Cancellations',
  delivery: 'Delivery',
  booking: 'Bookings',
  warranty: 'Warranty',
  returns: 'Returns',
};

export default function BusinessStory({ business: b, now = new Date() }: Props) {
  const about = (b.about ?? b.description ?? '').trim();
  const values = stringList(b.core_values);
  const whyUs = stringList(b.why_us);
  const faqs = faqList(b.faqs);
  const team = teamList(b.team);
  const creds = credentialList(b.credentials);
  const policies = policyEntries(b.policies);
  const languages = stringList(b.languages);
  const payments = stringList(b.payment_methods);
  const years = yearsInBusiness(b.founded_year, now);

  const hasStory = about || b.story?.trim() || b.vision?.trim() || b.mission?.trim() || values.length > 0;
  const hasInfo = years !== null || b.business_type || b.service_area || b.employees
    || languages.length > 0 || payments.length > 0;

  if (!hasStory && !whyUs.length && !faqs.length && !team.length && !creds.length
      && !policies.length && !hasInfo) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* Why us comes first. Somebody comparing two businesses scans for a
          reason to pick one; making them read a paragraph to find it is how
          they end up picking the other. */}
      {whyUs.length > 0 && (
        <Section title="Why choose us" icon={ShieldCheck}>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {whyUs.map((claim) => (
              <li key={claim} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                <Check size={15} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{claim}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {hasStory && (
        <Section title="About" icon={Building2}>
          <div className="space-y-4">
            {about && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{about}</p>}
            {b.story?.trim() && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Our story</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{b.story}</p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {b.vision?.trim() && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Vision</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{b.vision}</p>
                </div>
              )}
              {b.mission?.trim() && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Mission</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{b.mission}</p>
                </div>
              )}
            </div>
            {values.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">What we stand for</h4>
                <div className="flex flex-wrap gap-1.5">
                  {values.map((v) => (
                    <span key={v} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {creds.length > 0 && (
        <Section title="Credentials" icon={Award}>
          <ul className="space-y-2">
            {creds.map((c) => (
              <li key={`${c.label}-${c.year ?? ''}`} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
                <Award size={15} className="mt-0.5 shrink-0 text-amber-500" />
                <span>
                  {c.label}
                  {(c.issuer || c.year) && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {' — '}{[c.issuer, c.year].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {team.length > 0 && (
        <Section title="Meet the team" icon={Users}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {team.map((m) => (
              <div key={m.name} className="text-center">
                {m.photo_url ? (
                  <img src={m.photo_url} alt="" loading="lazy" decoding="async"
                       className="w-16 h-16 rounded-full object-cover mx-auto mb-2" />
                ) : (
                  <span className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center justify-center mx-auto mb-2 font-bold">
                    {m.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{m.name}</p>
                {m.role && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{m.role}</p>}
                {m.bio && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-3">{m.bio}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* FAQs are plain <details>: no state, keyboard accessible for free, and
          — the part that matters — the answers are in the HTML a crawler and
          an AI assistant read, not hidden behind a click handler. */}
      {faqs.length > 0 && (
        <Section title="Frequently asked questions" icon={HelpCircle}>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {faqs.map((f) => (
              <details key={f.q} className="py-2.5 group">
                <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white marker:content-['']">
                  {f.q}
                </summary>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      )}

      {hasInfo && (
        <Section title="Business information" icon={Building2}>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            {years !== null && (
              <div>
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">In business</dt>
                <dd className="text-gray-900 dark:text-white">{years} {years === 1 ? 'year' : 'years'}</dd>
              </div>
            )}
            {b.business_type && (
              <div>
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">Type</dt>
                <dd className="text-gray-900 dark:text-white">{b.business_type}</dd>
              </div>
            )}
            {b.employees && (
              <div>
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">Team size</dt>
                <dd className="text-gray-900 dark:text-white">{b.employees}</dd>
              </div>
            )}
            {b.service_area && (
              <div>
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">Service area</dt>
                <dd className="text-gray-900 dark:text-white">{b.service_area}</dd>
              </div>
            )}
            {languages.length > 0 && (
              <div>
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">Languages</dt>
                <dd className="text-gray-900 dark:text-white">{languages.join(', ')}</dd>
              </div>
            )}
            {payments.length > 0 && (
              <div>
                <dt className="text-[11px] text-gray-500 dark:text-gray-400">Payment</dt>
                <dd className="text-gray-900 dark:text-white">{payments.join(' · ')}</dd>
              </div>
            )}
          </dl>
        </Section>
      )}

      {policies.length > 0 && (
        <Section title="Policies" icon={ShieldCheck}>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {policies.map((p) => (
              <details key={p.key} className="py-2.5">
                <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white marker:content-['']">
                  {POLICY_LABEL[p.key] ?? p.key}
                </summary>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{p.text}</p>
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
