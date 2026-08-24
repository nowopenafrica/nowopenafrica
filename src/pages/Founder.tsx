import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight, BookOpen, Mic2, FileDown, Sparkles, Compass, Cpu, Globe2, Rocket,
  Users, Lightbulb, HeartHandshake, Palette, Copy, Check, Quote,
  Newspaper, Building2, Clapperboard, PenLine, Youtube, Linkedin, Mail, MapPin,
} from 'lucide-react';
import { applySeo, SITE_URL } from '../lib/seo';
import { XLogo } from '../components/SocialLinks';

/* ---------------------------------------------------------------- brand ---- */

// The pan-African spectrum used across the site's hero surfaces.
const AFRICA_GRADIENT =
  'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 20%, #831843 40%, #9a3412 60%, #92400e 80%, #166534 100%)';

const WHEEL_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#22c55e'];

const FOUNDER_NAME = 'Adeyemi Odunaike';
const FOUNDER_ROLE = 'Founder & Brand Designer';
// The single canonical sentence — repeated verbatim across the page and in
// JSON-LD so search engines resolve the founder↔company entity relationship.
const CANONICAL_DESCRIPTOR =
  'Adeyemi Odunaike is the Founder & Brand Designer of NowOpen Africa.';

/* ------------------------------------------------------------ page data ---- */

const SUBNAV = [
  { id: 'story', label: 'Story' },
  { id: 'timeline', label: 'Journey' },
  { id: 'philosophy', label: 'Philosophy' },
  { id: 'work', label: 'Work' },
  { id: 'writing', label: 'Writing' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'press', label: 'Press' },
  { id: 'media-kit', label: 'Media Kit' },
  { id: 'connect', label: 'Connect' },
];

const TIMELINE = [
  { year: 'The spark', title: 'Design meets technology', text: 'A childhood fascination with how visuals and systems shape the way people experience the world.' },
  { year: 'Early work', title: 'First design projects', text: 'Building identities for local brands and learning that great design is really about earning trust.' },
  { year: 'Craft', title: 'Brand consulting & motion', text: 'Years of brand systems, creative direction and motion graphics — telling stories that move people to act.' },
  { year: 'Product', title: 'Product design', text: 'Moving from brand to product: designing digital experiences people actually rely on day to day.' },
  { year: 'The insight', title: 'Research into African commerce', text: 'A recurring problem surfaced everywhere: brilliant African businesses that no one could find or trust online.' },
  { year: 'The vision', title: 'Conceptualizing NowOpen Africa', text: 'One idea — a unified place where any African business becomes discoverable, verified and ready to grow.' },
  { year: 'Build', title: 'MVP development', text: 'Turning the vision into a working product: discovery, verification, advertising and creative services in one ecosystem.' },
  { year: 'Beta', title: 'Private beta', text: 'Onboarding the first businesses, learning fast from real owners, and sharpening the product around them.' },
  { year: 'Launch', title: 'Public launch', text: 'Opening the doors — helping businesses across African markets get found, get trusted and get growing.' },
  { year: 'Next', title: 'Continental expansion', text: 'Scaling market by market toward the mission: millions of African businesses, discoverable to the world.' },
];

const PHILOSOPHY = [
  { icon: Palette, title: 'Design', text: 'Design is trust made visible. Clarity and craft are how a small business earns a first click.' },
  { icon: Cpu, title: 'Technology', text: 'Technology should disappear into usefulness — infrastructure that works for people, not the other way round.' },
  { icon: Globe2, title: 'Africa', text: 'Africa is not a market to be served, but a generation of builders to be equipped. Build with, not for.' },
  { icon: Rocket, title: 'Entrepreneurship', text: 'Momentum beats perfection. Ship, listen, and let real users shape what comes next.' },
  { icon: Users, title: 'Leadership', text: 'Leadership is multiplying belief — giving a team the clarity and courage to do their best work.' },
  { icon: Lightbulb, title: 'Innovation', text: 'Innovation is solving an old problem so well it looks obvious in hindsight.' },
  { icon: HeartHandshake, title: 'Community', text: 'A platform is only as strong as the community it lifts. Growth that isn’t shared isn’t growth.' },
];

const PROJECTS = [
  { icon: Compass, name: 'NowOpen Africa', tag: 'Founder & Brand Designer', text: 'The operating system for African business growth — discovery, verification, advertising, creative services and live commerce in one ecosystem.', to: '/', internal: true },
  { icon: Clapperboard, name: 'YemzoArts Studios', tag: 'Creative direction & motion', text: 'A creative studio behind brand systems, motion graphics and visual storytelling for ambitious brands.' },
  { icon: Palette, name: 'Brand systems', tag: 'Identity design', text: 'End-to-end visual identities — logo, type, colour and voice — engineered to build recognition and trust.' },
  { icon: Building2, name: 'Product design', tag: 'Digital products', text: 'Designing intuitive, dependable product experiences from first sketch to shipped interface.' },
];

const WRITING = [
  {
    group: 'Startup',
    items: [
      'How We Built NowOpen Africa From Scratch',
      'The Hardest Decisions Building a Marketplace',
      'What African Startups Get Wrong',
      'Building Products Before Funding',
      'Lessons From Building NowOpen Africa',
    ],
  },
  {
    group: 'Branding',
    items: [
      'How Branding Creates Trust',
      'The Future of African Branding',
      'Why Logos Alone Don’t Build Brands',
      'The Psychology Behind Trust',
    ],
  },
  {
    group: 'Technology & Africa',
    items: [
      'Why African Businesses Need Better Discovery',
      'Building Africa’s Business Infrastructure',
      'AI and African Businesses',
      'The Future of Local Commerce in Africa',
      'The Rise of Digital Africa',
      'Why Verification Matters',
    ],
  },
];

const SPEAKING = [
  'Building African Startups',
  'Brand Design & Identity',
  'Product Design for Emerging Markets',
  'Motion Graphics & Storytelling',
  'Creative Entrepreneurship',
  'The Future of African Commerce',
];

const SHORT_BIO =
  'Adeyemi Odunaike is the Founder & Brand Designer of NowOpen Africa, the operating system for African business growth. A brand designer turned product founder, he is building the digital infrastructure that helps African businesses become discoverable, trusted and ready to grow.';

const LONG_BIO =
  'Adeyemi Odunaike is the Founder & Brand Designer of NowOpen Africa. His work sits at the intersection of design, technology and African enterprise. After years building brand systems, motion graphics and digital products through his creative practice, he became convinced that the biggest barrier facing African businesses was not talent or ambition, but visibility and trust. NowOpen Africa is his answer: a unified platform where any African business can be discovered, verified, advertised and grown from a single ecosystem. Adeyemi writes and speaks on brand design, product, and the future of commerce in Africa, and is building NowOpen Africa toward a mission of making millions of African businesses discoverable to the world.';

const FACTS = [
  ['Full name', 'Adeyemi Odunaike'],
  ['Role', 'Founder & Brand Designer, NowOpen Africa'],
  ['Company', 'NowOpen Africa (AEY Inc.)'],
  ['Based in', 'Lagos, Nigeria'],
  ['Focus', 'Brand design · Product · African commerce'],
  ['Mission', 'Make millions of African businesses discoverable'],
];

/* -------------------------------------------------------- small helpers ---- */

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
      {children}
    </span>
  );
}

function SectionHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="max-w-2xl mb-10">
      <div className="text-sm font-semibold tracking-wide text-blue-600 dark:text-blue-400 uppercase">{eyebrow}</div>
      <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">{title}</h2>
      {sub && <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success(`${label} copied`);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          toast.error('Could not copy — please select and copy manually.');
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
      {copied ? 'Copied' : `Copy ${label.toLowerCase()}`}
    </button>
  );
}

// Downloads the color-wheel founder mark as an SVG — a real, usable asset.
function downloadFounderMark() {
  const circles = [
    [16, 6], [24.7, 11], [24.7, 21], [16, 26], [7.3, 21], [7.3, 11],
  ]
    .map(([cx, cy], i) => `<circle cx="${cx}" cy="${cy}" r="5" fill="${WHEEL_COLORS[i]}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="512" height="512">${circles}</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nowopen-founder-mark.svg';
  a.click();
  URL.revokeObjectURL(url);
  toast.success('Founder mark downloaded');
}

/* --------------------------------------------------------------- portrait -- */

function Portrait() {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="relative mx-auto lg:mx-0 w-64 h-64 sm:w-80 sm:h-80">
      {/* Glow ring */}
      <div
        className="absolute -inset-3 rounded-[2rem] opacity-70 blur-2xl"
        style={{ background: 'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #ec4899, #f97316, #eab308, #22c55e, #3b82f6)' }}
        aria-hidden
      />
      <div className="relative w-full h-full rounded-[2rem] overflow-hidden ring-1 ring-white/20 shadow-2xl bg-gray-900">
        {imgOk ? (
          // Drop a real headshot at public/founder-portrait.jpg to replace the
          // monogram fallback automatically.
          <img
            src="/founder-portrait.jpg"
            alt={`${FOUNDER_NAME}, ${FOUNDER_ROLE} of NowOpen Africa`}
            className="w-full h-full object-cover"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center" style={{ background: AFRICA_GRADIENT }}>
            <span className="font-coolvetica text-7xl sm:text-8xl font-bold text-white/95 tracking-wide">AO</span>
            <div className="mt-3 flex gap-1.5">
              {WHEEL_COLORS.map((c) => (
                <span key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page --- */

export default function Founder() {
  useEffect(() => {
    // The portrait is optional — the page falls back to a monogram when
    // public/founder-portrait.jpg is absent, which it is by default. Metadata
    // has no such fallback: pointing og:image and schema.org at a missing file
    // gave every share of this page a blank card and handed Google a 404 for
    // the organisation logo. These use assets that always exist; swap them for
    // the portrait once a real headshot ships.
    const org = {
      '@type': 'Organization',
      name: 'NowOpen Africa',
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
    };
    const person = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: FOUNDER_NAME,
      jobTitle: FOUNDER_ROLE,
      description: CANONICAL_DESCRIPTOR + ' ' + SHORT_BIO,
      url: `${SITE_URL}/founder`,
      image: `${SITE_URL}/og-image.png`,
      worksFor: org,
      founder: undefined,
      knowsAbout: ['Brand Design', 'Product Design', 'Motion Graphics', 'African Commerce', 'Entrepreneurship', 'Startups'],
      // NOTE: replace/extend with the founder's own verified profile URLs to
      // strengthen the entity graph (LinkedIn, X, YouTube, Medium, etc.).
      sameAs: [
        'https://linkedin.com/company/nowopenafrica',
        'https://x.com/nowopenafrica',
        'https://youtube.com/@nowopenafrica',
        'https://instagram.com/nowopenafrica',
      ],
    };
    const profilePage = {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: { '@type': 'Person', name: FOUNDER_NAME, jobTitle: FOUNDER_ROLE },
      about: { '@type': 'Organization', name: 'NowOpen Africa', founder: { '@type': 'Person', name: FOUNDER_NAME } },
    };
    return applySeo({
      title: `${FOUNDER_NAME} — ${FOUNDER_ROLE} of NowOpen Africa`,
      description: CANONICAL_DESCRIPTOR + ' ' + SHORT_BIO,
      path: '/founder',
      image: '/og-image.png',
      type: 'profile',
      jsonLd: [person, profilePage],
    });
  }, []);

  return (
    <div className="bg-gray-50 dark:bg-gray-900 scroll-smooth">
      {/* ---------------------------------------------------------- HERO ---- */}
      <section className="relative text-white overflow-hidden" style={{ background: AFRICA_GRADIENT }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 text-center lg:text-left order-2 lg:order-1">
            <Pill>
              <Sparkles size={16} className="text-yellow-300" />
              Founder · NowOpen Africa
            </Pill>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">{FOUNDER_NAME}</h1>
            <p className="text-xl font-medium text-white/90">{FOUNDER_ROLE}</p>
            <p className="text-lg text-white/80 max-w-xl mx-auto lg:mx-0">
              Building the digital infrastructure that helps African businesses become discoverable,
              trusted and ready to grow — across Africa and beyond.
            </p>
            <div className="flex flex-wrap gap-3 justify-center lg:justify-start pt-2">
              <a href="#story" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">
                <BookOpen size={18} /> Read my story
              </a>
              <a href="#writing" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
                <PenLine size={18} /> Articles
              </a>
              <a href="#speaking" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
                <Mic2 size={18} /> Speaking
              </a>
              <a href="#media-kit" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
                <FileDown size={18} /> Media kit
              </a>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Portrait />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- SUB-NAV ---- */}
      <nav className="sticky top-16 z-30 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-2 text-sm">
            {SUBNAV.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="whitespace-nowrap px-3 py-1.5 rounded-full font-medium text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-800 hover:text-blue-700 dark:hover:text-blue-400 transition"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* --------------------------------------------------------- STORY ---- */}
      <section id="story" className="scroll-mt-28 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="The Story" title="From design to infrastructure" />
          <div className="grid lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-5 text-lg leading-relaxed text-gray-700 dark:text-gray-300">
              <p>
                It started with a fascination — the way a mark, a motion, a well-made interface can make
                a stranger feel they can trust something. That fascination became a craft: years spent
                building brands, motion graphics and digital products for people with big ambitions and
                small budgets.
              </p>
              <p>
                The deeper Adeyemi worked with African businesses, the clearer one problem became. The
                talent was never the issue. The ambition was never the issue. The problem was
                <span className="font-semibold text-gray-900 dark:text-white"> visibility and trust</span> —
                extraordinary businesses that customers simply couldn’t find, or couldn’t be sure of.
              </p>
              <p>
                Africa had marketplaces and directories, but nothing that unified discovery, verification,
                advertising and creative services into one place a business could actually grow from. That
                gap became a conviction, and the conviction became a company.
              </p>
              <p>
                <span className="font-semibold text-gray-900 dark:text-white">NowOpen Africa</span> is that
                answer — the operating system for African business growth. The mission is simple to say and
                hard to earn: help millions of African businesses become discoverable, trusted, and ready to
                grow, from one ecosystem.
              </p>
            </div>
            <div className="rounded-2xl p-8 text-white self-start" style={{ background: AFRICA_GRADIENT }}>
              <Quote size={28} className="text-white/70" />
              <p className="mt-4 text-xl font-medium leading-relaxed">
                Africa isn’t a market to be served. It’s a generation of builders to be equipped.
              </p>
              <p className="mt-5 text-sm text-white/80">{FOUNDER_NAME}</p>
              <p className="text-sm text-white/60">{FOUNDER_ROLE}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ TIMELINE ---- */}
      <section id="timeline" className="scroll-mt-28 py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="The Journey" title="Milestones so far" sub="A genuine record of the road to NowOpen Africa — and where it’s heading." />
          <ol className="relative border-l-2 border-blue-100 dark:border-gray-700 ml-3 space-y-8">
            {TIMELINE.map((t, i) => (
              <li key={i} className="ml-8">
                <span className="absolute -left-[11px] flex items-center justify-center w-5 h-5 rounded-full ring-4 ring-white dark:ring-gray-800" style={{ background: WHEEL_COLORS[i % WHEEL_COLORS.length] }} />
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">{t.year}</div>
                <h3 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{t.title}</h3>
                <p className="mt-1 text-gray-600 dark:text-gray-400 max-w-2xl">{t.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------- PHILOSOPHY ---- */}
      <section id="philosophy" className="scroll-mt-28 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Philosophy" title="What guides the work" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {PHILOSOPHY.map(({ icon: Icon, title, text }) => (
              <div key={title} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition">
                <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                  <Icon size={22} className="text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-gray-600 dark:text-gray-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- WORK ---- */}
      <section id="work" className="scroll-mt-28 py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Featured Work" title="Projects & ventures" />
          <div className="grid sm:grid-cols-2 gap-5">
            {PROJECTS.map(({ icon: Icon, name, tag, text, to, internal }) => {
              const inner = (
                <>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Icon size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{name}</h3>
                      <div className="text-sm font-medium text-blue-600 dark:text-blue-400">{tag}</div>
                    </div>
                  </div>
                  <p className="mt-4 text-gray-600 dark:text-gray-400">{text}</p>
                  {internal && (
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400">
                      Explore the platform <ArrowRight size={15} />
                    </span>
                  )}
                </>
              );
              const cls = 'block bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700 hover:shadow-md transition';
              return internal && to ? (
                <Link key={name} to={to} className={cls}>{inner}</Link>
              ) : (
                <div key={name} className={cls}>{inner}</div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- WRITING ---- */}
      <section id="writing" className="scroll-mt-28 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Writing" title="Insights & essays" sub="A growing library on design, product and the future of African commerce. New pieces publish regularly." />
          <div className="grid lg:grid-cols-3 gap-6">
            {WRITING.map((col) => (
              <div key={col.group}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-3">{col.group}</h3>
                <ul className="space-y-3">
                  {col.items.map((title) => (
                    <li key={title} className="group bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition">
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-medium text-gray-900 dark:text-white leading-snug">{title}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 whitespace-nowrap mt-0.5">Soon</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/40 p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-bold text-gray-900 dark:text-white">Founder Journal</div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Weekly reflections on building NowOpen Africa — the wins, the mistakes, and what ships next.</p>
            </div>
            <a href="#connect" className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition whitespace-nowrap">
              Follow the journey <ArrowRight size={16} />
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ SPEAKING ---- */}
      <section id="speaking" className="scroll-mt-28 py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <SectionHeading eyebrow="Speaking" title="Talks & topics" sub="Available for keynotes, panels, podcasts and workshops on design, product and African commerce." />
            <a href="mailto:hello@nowopenafrica.com?subject=Speaking%20invitation%20for%20Adeyemi%20Odunaike" className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition">
              <Mic2 size={18} /> Invite to speak
            </a>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {SPEAKING.map((topic) => (
              <div key={topic} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                <Mic2 size={18} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="font-medium text-gray-800 dark:text-gray-200">{topic}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- PRESS ---- */}
      <section id="press" className="scroll-mt-28 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Press" title="In the media" sub="Interviews, features and appearances — updated as coverage grows." />
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
            <Newspaper size={32} className="mx-auto text-gray-400 dark:text-gray-500" />
            <p className="mt-3 text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Building the press room. For interviews, podcasts or media enquiries, get in touch — a full
              media kit and fact sheet are ready below.
            </p>
            <a href="mailto:hello@nowopenafrica.com?subject=Press%20enquiry%20%E2%80%94%20Adeyemi%20Odunaike" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold rounded-lg hover:opacity-90 transition">
              <Mail size={16} /> Media enquiries
            </a>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- MEDIA KIT ---- */}
      <section id="media-kit" className="scroll-mt-28 py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Media Kit" title="Everything press needs" sub="Copy-ready bios, a fact sheet, brand colours and downloadable assets." />
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Bios */}
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 dark:text-white">Short bio</h3>
                  <CopyButton label="Short bio" text={SHORT_BIO} />
                </div>
                <p className="mt-3 text-gray-600 dark:text-gray-400">{SHORT_BIO}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 dark:text-white">Long bio</h3>
                  <CopyButton label="Long bio" text={LONG_BIO} />
                </div>
                <p className="mt-3 text-gray-600 dark:text-gray-400">{LONG_BIO}</p>
              </div>
            </div>

            {/* Facts + assets */}
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4">Fact sheet</h3>
                <dl className="space-y-2.5">
                  {FACTS.map(([k, v]) => (
                    <div key={k} className="flex gap-4 text-sm">
                      <dt className="w-28 flex-shrink-0 text-gray-500 dark:text-gray-400">{k}</dt>
                      <dd className="font-medium text-gray-900 dark:text-white">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-6 border border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white mb-4">Brand colours</h3>
                <div className="flex flex-wrap gap-2 mb-5">
                  {['#2563eb', ...WHEEL_COLORS].map((c) => (
                    <button
                      key={c}
                      onClick={() => { navigator.clipboard?.writeText(c); toast.success(`${c} copied`); }}
                      title={`Copy ${c}`}
                      className="w-10 h-10 rounded-lg ring-1 ring-black/10 dark:ring-white/10 hover:scale-105 transition"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={downloadFounderMark} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition text-sm">
                    <FileDown size={16} /> Founder mark (SVG)
                  </button>
                  <a href="mailto:hello@nowopenafrica.com?subject=Full%20media%20kit%20request" className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition text-sm">
                    <Mail size={16} /> Request full kit
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- CONNECT ---- */}
      <section id="connect" className="scroll-mt-28 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl overflow-hidden text-white" style={{ background: AFRICA_GRADIENT }}>
            <div className="px-8 py-12 sm:px-12 sm:py-16 text-center max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-bold">Follow the build</h2>
              <p className="mt-3 text-lg text-white/85">
                Product updates, founder lessons and the story of building Africa’s business
                infrastructure — in the open.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <a href="https://linkedin.com/company/nowopenafrica" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">
                  <Linkedin size={18} /> LinkedIn
                </a>
                <a href="https://youtube.com/@nowopenafrica" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/25 font-semibold rounded-lg hover:bg-white/20 transition">
                  <Youtube size={18} /> YouTube
                </a>
                <a href="https://x.com/nowopenafrica" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/25 font-semibold rounded-lg hover:bg-white/20 transition">
                  <XLogo size={16} /> X
                </a>
                <a href="mailto:hello@nowopenafrica.com" className="inline-flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/25 font-semibold rounded-lg hover:bg-white/20 transition">
                  <Mail size={18} /> Email
                </a>
              </div>
              <div className="mt-8 flex items-center justify-center gap-2 text-sm text-white/70">
                <MapPin size={15} /> Lagos, Nigeria · Building across Africa
              </div>
              <div className="mt-8 pt-8 border-t border-white/15">
                <Link to="/waitlist" className="inline-flex items-center gap-2 text-white font-semibold hover:underline">
                  Join NowOpen Africa <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
