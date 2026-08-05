// Deterministic "AI" design coach for the Creative Studio.
//
// No model behind this — a rule-based report that scores the current design on
// readability, call-to-action strength, visibility/contrast, trust signals and
// brand consistency, then turns the weak points into human advice. Mirrors the
// Brand Health scoring pattern so the numbers always add up to something the
// owner can act on.

import { badgeHasAction } from './aiCopy';

export interface DesignCoachInput {
  headline: string;
  subline: string;
  badge: string;
  accent: string;
  /** Layout background override, or null when the layout default is used. */
  bgColor: string | null;
  qr: string;
  hasLogo: boolean;
  /** True when a cover photo / uploaded media sits behind the design. */
  hasBackground: boolean;
  /** Saved brand colour from Brand Card Studio (empty = not set). */
  brandAccent: string;
}

export interface DesignMetric {
  key: string;
  label: string;
  score: number;
  note: string;
}

export interface DesignTip {
  level: 'good' | 'warn' | 'bad';
  text: string;
}

export interface DesignCoachReport {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'E';
  metrics: DesignMetric[];
  tips: DesignTip[];
  /** 0–100 how closely the accent matches the saved brand colour. */
  brandMatch: number;
  /** True when a saved brand colour exists and differs from the accent. */
  canApplyBrand: boolean;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return 0;
  const n = parseInt(h, 16);
  const chans = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
}

export function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function gradeFor(score: number): DesignCoachReport['grade'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'E';
}

function readabilityScore(headline: string, subline: string): { score: number; note: string } {
  const h = headline.trim().length;
  const s = subline.trim().length;
  if (h === 0) return { score: 0, note: 'Add a headline — it is the first thing people read.' };
  let score = 100;
  if (h < 12) score -= 25;
  if (h > 60) score -= 30;
  if (h > 40) score -= 10;
  if (s === 0) score -= 15;
  if (s > 80) score -= 10;
  const note = h > 60
    ? 'Headline is long — aim for 5–8 punchy words.'
    : h < 12
      ? 'Headline is very short — add what makes it worth stopping for.'
      : s === 0
        ? 'Good headline. Add a subtext line for context.'
        : 'Clear headline and subtext length.';
  return { score: clampScore(score), note };
}

function ctaScore(badge: string, subline: string): { score: number; note: string } {
  let score = 0;
  if (badge.trim()) score += 40;
  if (badgeHasAction(badge)) score += 25;
  if (subline.trim()) score += 25;
  if (/today|now|only|limited|don'?t miss|before it|hurry|free|while|ends/i.test(subline)) score += 10;
  const note = !badge.trim()
    ? 'Add a call to action (e.g. "Book Now", "Reserve a Table").'
    : !badgeHasAction(badge)
      ? 'Make the badge an action so people know what to do next.'
      : 'Strong call to action.';
  return { score: clampScore(score), note };
}

function visibilityScore(accent: string, bgColor: string | null, hasBackground: boolean): { score: number; note: string } {
  if (bgColor) {
    const ratio = contrastRatio(accent, bgColor);
    const score = ratio >= 7 ? 100 : ratio >= 4.5 ? 85 : ratio >= 3 ? 65 : ratio >= 2 ? 40 : 20;
    const note = ratio >= 4.5
      ? 'Good contrast between the accent and background.'
      : ratio >= 3
        ? 'Contrast is okay — consider a stronger accent for readability.'
        : 'Low contrast — the accent and background are too close.';
    return { score, note };
  }
  if (hasBackground) return { score: 80, note: 'Media background — contrast varies by image.' };
  return { score: 75, note: 'Layout default background — contrast looks fine.' };
}

function trustScore(qr: string, hasLogo: boolean): { score: number; note: string } {
  let score = 0;
  if (hasLogo) score += 45;
  if (qr) score += 55;
  const note = !qr && !hasLogo
    ? 'Add your logo and the QR so people can find you instantly.'
    : !qr
      ? 'Add the QR code — visitors can scan straight to your profile.'
      : !hasLogo
        ? 'Add your logo for instant recognition.'
        : 'Logo and QR in place — people can act immediately.';
  return { score: clampScore(score), note };
}

function normalize(hex: string): string {
  return (hex || '').trim().toLowerCase();
}

export function designCoachReport(input: DesignCoachInput): DesignCoachReport {
  const read = readabilityScore(input.headline, input.subline);
  const cta = ctaScore(input.badge, input.subline);
  const vis = visibilityScore(input.accent, input.bgColor, input.hasBackground);
  const trust = trustScore(input.qr, input.hasLogo);

  const brand = normalize(input.brandAccent);
  let brandMatch: number;
  let canApplyBrand = false;
  if (!brand) {
    brandMatch = 80;
  } else if (normalize(input.accent) === brand) {
    brandMatch = 100;
  } else {
    brandMatch = 55;
    canApplyBrand = true;
  }
  const brandNote = canApplyBrand
    ? `Different from your saved brand colour (${input.brandAccent}).`
    : brand
      ? 'Matches your saved brand colour.'
      : 'Set a brand colour in Brand Card Studio to lock your palette.';

  const metrics: DesignMetric[] = [
    { key: 'readability', label: 'Readability', score: read.score, note: read.note },
    { key: 'cta', label: 'Call to Action', score: cta.score, note: cta.note },
    { key: 'visibility', label: 'Visibility', score: vis.score, note: vis.note },
    { key: 'trust', label: 'Trust & Findability', score: trust.score, note: trust.note },
    { key: 'brand', label: 'Brand Match', score: brandMatch, note: brandNote },
  ];

  const overall = Math.round(
    metrics[0].score * 0.22 + metrics[1].score * 0.22 + metrics[2].score * 0.18 + metrics[3].score * 0.18 + metrics[4].score * 0.2,
  );

  const tips: DesignTip[] = [];
  const low = metrics.filter((m) => m.score < 75);
  for (const m of low) {
    tips.push({ level: m.score < 45 ? 'bad' : 'warn', text: m.note });
  }
  if (canApplyBrand) tips.push({ level: 'warn', text: `Use your brand colour ${input.brandAccent} for full consistency.` });
  if (input.headline.trim() && input.headline.trim().length > 40) {
    tips.push({ level: 'warn', text: 'Keep the headline under ~40 characters so it never clips on small screens.' });
  }
  if (!low.length) tips.push({ level: 'good', text: 'Everything checks out — this design is ready to export.' });

  return { overall, grade: gradeFor(overall), metrics, tips, brandMatch, canApplyBrand };
}
