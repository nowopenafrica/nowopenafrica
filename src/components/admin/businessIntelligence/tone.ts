export const TONE: Record<string, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-300',
  purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
};

export function toneFor(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (/publish|active|published|approved|succeeded|running|permitted|verified|claimed|sent|delivered|enabled|\bhealthy\b/.test(s)) return 'emerald';
  if (/review|pending|held|scheduled|queued|processing|match|possible|reviewing/.test(s)) return 'blue';
  if (/draft|paused|needs|unknown|partial|expiring|degraded/.test(s)) return 'amber';
  if (/reject|failed|blocked|prohibited|suspended|archived|cancelled|removed|opt_out|do_not|off|\bunhealthy\b|\bdisabled\b/.test(s)) return 'rose';
  return 'gray';
}