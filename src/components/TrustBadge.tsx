import { ShieldCheck } from 'lucide-react';
import { TIERS, Tier } from '../lib/trust';

// Compact verification-tier pill shown on business cards and profiles.
// Renders nothing for the 'none' tier so unverified businesses stay clean.
export default function TrustBadge({
  tier,
  score,
  size = 'sm',
}: {
  tier?: string | null;
  score?: number | null;
  size?: 'sm' | 'md';
}) {
  const t = (tier && tier in TIERS ? tier : 'none') as Tier;
  if (t === 'none') return null;
  const meta = TIERS[t];
  const pad = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  const icon = size === 'md' ? 14 : 12;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad} ${meta.badge}`}
      title={`${meta.label} verified — ${meta.blurb}${typeof score === 'number' ? ` · Trust score ${score}/100` : ''}`}
    >
      <ShieldCheck size={icon} />
      {meta.label}
      {typeof score === 'number' && score > 0 ? <span className="opacity-70">· {score}</span> : null}
    </span>
  );
}
