import { Compass, Megaphone, Palette, ShieldCheck, ArrowRight } from 'lucide-react';
import { Editable, PageContentProvider, useEditableSeo } from '../components/editor/PageContent';

// The first page adopted by the Visual Editor. Note what did NOT change: the
// markup, the classes, the layout and the SEO call are all as they were.
// Adoption means wrapping copy in <Editable> — the text stays here in the
// component as the default, so this page renders identically with no database,
// no rows and no editor.

const pillars = [
  { key: 'discover', icon: Compass, title: 'Discover', text: 'A living directory of African businesses — searchable by what they do, where they are, and how they’re rated.' },
  { key: 'advertise', icon: Megaphone, title: 'Advertise', text: 'Book real-world ad placements — billboards, transit, digital screens — and run managed digital campaigns.' },
  { key: 'create', icon: Palette, title: 'Create', text: 'Hire vetted photographers, designers, videographers and studios across the continent.' },
  { key: 'trust', icon: ShieldCheck, title: 'Trust', text: 'Tiered verification and transparent trust scores so customers can transact with confidence.' },
] as const;

const DEFAULT_SEO_TITLE = 'About NowOpen Africa — The Operating System for African Business';
const DEFAULT_SEO_DESCRIPTION =
  'NowOpen Africa helps African businesses get discovered, advertise effectively and hire creative talent — all in one place, built for African markets.';

function AboutContent() {
  // Title and description are editable copy. The canonical path, the robots
  // directive and sitemap membership are not — those are decided by code, and
  // the editor has no way to reach them.
  useEditableSeo({
    titleSlot: 'about.seo.title',
    descriptionSlot: 'about.seo.description',
    title: DEFAULT_SEO_TITLE,
    description: DEFAULT_SEO_DESCRIPTION,
    path: '/about',
    image: '/og-image.png',
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Hero */}
      <section className="text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 45%, #831843 100%)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <Editable slot="about.hero.title" as="h1" className="font-bold">
            The operating system for business growth in Africa
          </Editable>
          <Editable slot="about.hero.lead" as="p" className="mt-4 text-blue-100 max-w-2xl mx-auto">
            NowOpen Africa helps businesses get discovered, advertise effectively, and hire the creative talent they need — all in one place, built for African markets.
          </Editable>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-14">
        <section>
          <Editable slot="about.why.heading" as="h2" className="font-bold text-gray-900 dark:text-white mb-3">
            Why we exist
          </Editable>
          <Editable slot="about.why.body" as="p" className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Millions of African businesses are open for business but hard to find, hard to reach, and hard to trust online. Customers waste time; good businesses lose out. NowOpen Africa closes that gap — a single platform where a business can build a real presence, take bookings and orders, run advertising, go live, and earn verified trust, priced for the realities of the markets it serves.
          </Editable>
        </section>

        <section>
          <Editable slot="about.pillars.heading" as="h2" className="font-bold text-gray-900 dark:text-white mb-6">
            What we do
          </Editable>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pillars.map((p) => (
              <div key={p.key} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <p.icon size={22} className="text-blue-600 dark:text-blue-400" />
                </div>
                <Editable slot={`about.pillar.${p.key}.title`} as="h3" className="mt-3 font-bold text-gray-900 dark:text-white">
                  {p.title}
                </Editable>
                <Editable slot={`about.pillar.${p.key}.body`} as="p" className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {p.text}
                </Editable>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 sm:p-8">
          <Editable slot="about.built.heading" as="h2" className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Built in Africa, for Africa
          </Editable>
          <Editable slot="about.built.body" as="p" className="text-gray-700 dark:text-gray-300 leading-relaxed">
            Local currencies and mobile-money-friendly checkout, per-industry tools instead of one generic template, and a trust layer designed for how business really gets done across the continent. We're just getting started — and we'd love you to build it with us.
          </Editable>
          <div className="mt-5 flex flex-wrap gap-3">
            <Editable
              slot="about.cta.primary"
              to="/waitlist"
              after={<ArrowRight size={16} />}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
            >
              Join the waitlist
            </Editable>
            <Editable
              slot="about.cta.secondary"
              to="/founder"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Meet the founder
            </Editable>
            <Editable
              slot="about.cta.tertiary"
              to="/contact"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Contact us
            </Editable>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function About() {
  return (
    <PageContentProvider page="about">
      <AboutContent />
    </PageContentProvider>
  );
}
