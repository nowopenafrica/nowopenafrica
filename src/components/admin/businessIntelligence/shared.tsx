import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { TONE, toneFor } from './tone';

/**
 * Shared atoms for the Business Intelligence tabs.
 *
 * Deliberately tiny and local: the admin panels each keep their own little chip
 * maps, so this area does the same rather than pretending there is a global
 * design system for them.
 */

export function StatusChip({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[toneFor(status)]}`}>
      {children ?? status}
    </span>
  );
}

export function Card({ title, action, children, className = '' }: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function StatCard({ label, value, sub, tone = 'gray' }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${TONE[tone].split(' ')[1] ?? 'text-gray-900 dark:text-white'}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{children}</p>
  );
}

export function WarnBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}