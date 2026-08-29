import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UsersRound, Kanban, ClipboardCheck, BookOpen, Rocket, Building2,
  Newspaper, Megaphone, ArrowRight, Cpu, ShieldCheck, GitCommitHorizontal,
  Database,
} from 'lucide-react';
import { applySeo } from '../lib/seo';

// The public, honest story of how NowOpen Africa runs itself. These are the
// eight internal ledgers the company operates on — no fabricated numbers, no
// seeded dashboards presented as real. The ledgers themselves are admin-only;
// this page describes the operating system, not its live contents.

const LEDGERS = [
  { icon: UsersRound, name: 'Workforce', table: 'os_workforce', blurb: 'Every human and AI agent on the team — with honest status, workload and role.' },
  { icon: Kanban, name: 'Work', table: 'os_work_items', blurb: 'Projects, tasks and goals assigned across the company — open, in progress, blocked, done.' },
  { icon: ClipboardCheck, name: 'Approvals', table: 'os_approvals', blurb: 'Agent-finished work queued for a human sign-off. Approving closes it; rejecting sends it back.' },
  { icon: BookOpen, name: 'Knowledge', table: 'os_knowledge', blurb: 'Every SOP, brand rule and decision — approvals sync in as permanent decisions.' },
  { icon: Rocket, name: 'Launches', table: 'os_launches', blurb: 'Every feature launch with its full checklist — nothing ships until the rollout is complete.' },
  { icon: Building2, name: 'Partners', table: 'os_partners', blurb: 'Investors, media, government, creators, agencies, sponsors and universities — one pipeline.' },
  { icon: Newspaper, name: 'Press', table: 'os_press', blurb: 'The news and coverage timeline — releases, coverage and quotes, all in one ledger.' },
  { icon: Megaphone, name: 'Campaigns', table: 'os_campaigns', blurb: 'Platform campaigns from idea to live — Africa is NowOpen, Restaurant Week and beyond.' },
];

const PRINCIPLES = [
  { icon: Database, title: 'One source of truth', text: 'Every number you see about NowOpen Africa comes from these ledgers. Nothing is fabricated to look busy.' },
  { icon: ShieldCheck, title: 'Admins only', text: 'The ledgers are private and admin-only. The public only ever sees what the company chooses to share.' },
  { icon: GitCommitHorizontal, title: 'Every change is a record', text: 'Statuses, decisions and sign-offs are persisted, not imagined — re-running anything is safe and honest.' },
];

export default function NowOpenOs() {
  useEffect(() => {
    return applySeo({
      title: 'The NowOpen OS — NowOpen Africa',
      description:
        'The operating system NowOpen Africa runs on: eight internal ledgers — workforce, work, approvals, knowledge, launches, partners, press and campaigns — with every number derived from real records.',
      path: '/os',
      type: 'website',
    });
  }, []);

  return (
    <div className="bg-gray-50 dark:bg-gray-900">
      <section className="relative overflow-hidden bg-gray-900 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(76,29,149,0.45),transparent_60%)]" />
        <div className="relative site-container py-16 sm:py-24 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium">
            <Cpu size={16} className="text-purple-300" />
            Inside NowOpen Africa
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight max-w-4xl mx-auto">
            The operating system we run on
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-white/85 max-w-2xl mx-auto">
            Eight ledgers. One source of truth. Every number NowOpen Africa shows you is
            derived from these records — never seeded, never staged.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <a href="#ledgers" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">
              See the eight ledgers <ArrowRight size={18} />
            </a>
            <Link to="/founder" className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 backdrop-blur-sm border border-white/25 text-white font-semibold rounded-lg hover:bg-white/20 transition">
              Meet the founder
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-white/80">
            <span>8 ledgers</span>
            <span className="hidden sm:inline">·</span>
            <span>Admin-only</span>
            <span className="hidden sm:inline">·</span>
            <span>Derived, not fabricated</span>
          </div>
        </div>
      </section>

      <section id="ledgers" className="scroll-mt-20 py-16 sm:py-20">
        <div className="site-container">
          <div className="max-w-2xl mb-10">
            <div className="text-sm font-semibold tracking-wide text-purple-600 dark:text-purple-400 uppercase">The eight ledgers</div>
            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Everything the company runs on</h2>
            <p className="mt-3 text-lg text-gray-600 dark:text-gray-400">
              A team, the work they do, the decisions they sign, the knowledge they keep,
              the launches they ship, the partners they build, the press they earn and the
              campaigns they run — all in one operating system.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {LEDGERS.map(({ icon: Icon, name, table, blurb }) => (
              <div key={name} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                  <Icon size={22} className="text-white" />
                </div>
                <h3 className="mt-4 font-bold text-gray-900 dark:text-white">{name}</h3>
                <p className="mt-1 text-[11px] font-mono text-purple-600 dark:text-purple-400">{table}</p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-white dark:bg-gray-800/40">
        <div className="site-container">
          <div className="max-w-2xl mb-10">
            <div className="text-sm font-semibold tracking-wide text-purple-600 dark:text-purple-400 uppercase">Why it matters</div>
            <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">Honest operations</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center text-purple-600 dark:text-purple-300">
                  <Icon size={20} />
                </div>
                <h3 className="mt-3 font-bold text-gray-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
