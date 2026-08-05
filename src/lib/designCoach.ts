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

// ---------------------------------------------------------------------------
// Channel readiness
// ---------------------------------------------------------------------------
//
// Per-surface scores for the same design. Every number here is derived from
// geometry, character counts or WCAG contrast maths — things that can actually
// be measured from the canvas.
//
// Deliberately absent: "sales potential", "predicted reach", "predicted
// clicks". Those need historical performance data this product doesn't collect
// yet, and inventing a precise-looking number would poison trust in the scores
// that ARE real. Each score carries a `basis` string so the owner can see what
// it was computed from.

export type ChannelKey = 'feed' | 'story' | 'facebook' | 'print' | 'billboard' | 'accessibility';

export interface ChannelScore {
  key: ChannelKey;
  label: string;
  score: number;
  /** What the score was computed from — shown in the UI so it's auditable. */
  basis: string;
  note: string;
}

export interface ChannelInput {
  /** Canvas pixel size of the selected format. */
  width: number;
  height: number;
  headline: string;
  subline: string;
  badge: string;
  accent: string;
  /** Solid background colour, or null when the layout default / media is used. */
  bgColor: string | null;
}

/** How close `actual` is to `target` as a 0–100 score, tolerant either side. */
function aspectFit(actual: number, target: number): number {
  const ratio = actual > target ? target / actual : actual / target;
  return clampScore(ratio * 100);
}

/**
 * The renderer sizes the headline from the canvas's short edge
 * (~7–8.5% of minDim — see DesignStudio's `S.h1`). That makes on-screen
 * legibility at a given display width exactly computable.
 */
const HEADLINE_RATIO = 0.075;

function legibilityAtWidth(input: ChannelInput, displayWidth: number): { px: number; score: number } {
  const minDim = Math.min(input.width, input.height);
  const headlinePx = minDim * HEADLINE_RATIO;
  const scale = displayWidth / input.width;
  const effective = headlinePx * scale;
  // ~11px is about the floor for a glanceable headline in a scrolling feed.
  const score = clampScore((effective / 16) * 100);
  return { px: Math.round(effective), score };
}

function textLoadScore(input: ChannelInput): { chars: number; score: number } {
  const chars = `${input.headline} ${input.subline} ${input.badge}`.trim().length;
  // Megapixels of canvas; more area genuinely carries more text.
  const mp = (input.width * input.height) / 1_000_000;
  const perMp = chars / Math.max(0.25, mp);
  // Above ~90 chars per megapixel a design starts reading as a wall of text.
  const score = perMp <= 90 ? 100 : clampScore(100 - (perMp - 90) * 1.1);
  return { chars, score };
}

export function channelReadiness(input: ChannelInput): ChannelScore[] {
  const aspect = input.width / input.height;
  const load = textLoadScore(input);

  // Feed (Instagram / LinkedIn square-ish, shown small in a scroll)
  const feedLeg = legibilityAtWidth(input, 320);
  const feedAspect = Math.max(aspectFit(aspect, 1), aspectFit(aspect, 4 / 5));
  const feed = Math.round(feedAspect * 0.4 + feedLeg.score * 0.35 + load.score * 0.25);

  // Story / WhatsApp status — full-screen 9:16
  const storyAspect = aspectFit(aspect, 9 / 16);
  const storyLeg = legibilityAtWidth(input, 390);
  const story = Math.round(storyAspect * 0.5 + storyLeg.score * 0.3 + load.score * 0.2);

  // Facebook feed — tolerant of 1.91:1 and square
  const fbAspect = Math.max(aspectFit(aspect, 1.91), aspectFit(aspect, 1));
  const fbLeg = legibilityAtWidth(input, 470);
  const facebook = Math.round(fbAspect * 0.4 + fbLeg.score * 0.35 + load.score * 0.25);

  // Print — A5 short edge is 5.83in; DPI is exact once the pixel size is known.
  const shortIn = 5.83;
  const dpi = Math.round(Math.min(input.width, input.height) / shortIn);
  const print = clampScore((dpi / 300) * 100);

  // Billboard — read at distance, so the headline must occupy real height.
  const headlineShare = (Math.min(input.width, input.height) * HEADLINE_RATIO) / input.height;
  const billboard = Math.round(
    aspectFit(aspect, 3) * 0.45 + clampScore((headlineShare / 0.12) * 100) * 0.3 + load.score * 0.25,
  );

  // Accessibility — WCAG contrast, exact when a solid background is set.
  let a11y: number;
  let a11yBasis: string;
  let a11yNote: string;
  if (input.bgColor) {
    const ratio = contrastRatio(input.accent, input.bgColor);
    a11y = ratio >= 7 ? 100 : ratio >= 4.5 ? 82 : ratio >= 3 ? 58 : 28;
    a11yBasis = `contrast ${ratio.toFixed(1)}:1`;
    a11yNote = ratio >= 7 ? 'Passes WCAG AAA.' : ratio >= 4.5 ? 'Passes WCAG AA.' : ratio >= 3 ? 'Large text only — below AA for body copy.' : 'Fails WCAG AA — raise the contrast.';
  } else {
    a11y = 70;
    a11yBasis = 'no solid background set';
    a11yNote = 'Contrast varies over media — set a background colour for an exact reading.';
  }

  return [
    {
      key: 'feed', label: 'Instagram / feed', score: feed,
      basis: `${Math.round(aspect * 100) / 100}:1 aspect · headline ~${feedLeg.px}px at 320px wide`,
      note: feedAspect < 80 ? 'Crops in a square feed — try a 1:1 or 4:5 format.' : feedLeg.score < 60 ? 'Headline gets small in a scrolling feed.' : 'Reads well in-feed.',
    },
    {
      key: 'story', label: 'Story / WhatsApp', score: story,
      basis: `${storyAspect >= 95 ? 'matches' : 'differs from'} 9:16 · headline ~${storyLeg.px}px on a phone`,
      note: storyAspect < 80 ? 'Letterboxes as a story — use a 9:16 format.' : 'Fills a phone screen properly.',
    },
    {
      key: 'facebook', label: 'Facebook', score: facebook,
      basis: `headline ~${fbLeg.px}px at 470px wide`,
      note: fbAspect < 75 ? 'Awkward crop in the Facebook feed.' : 'Sits well in the Facebook feed.',
    },
    {
      key: 'print', label: 'Print', score: print,
      basis: `${dpi} DPI at A5`,
      note: dpi >= 300 ? 'Print-ready at A5.' : dpi >= 150 ? `${dpi} DPI — fine for handouts, soft for a press run.` : `${dpi} DPI — too low to print sharply.`,
    },
    {
      key: 'billboard', label: 'Outdoor / LED', score: billboard,
      basis: `headline ${(headlineShare * 100).toFixed(0)}% of height · ${load.chars} chars`,
      // Keep the wording in step with the score band the bar is coloured by,
      // so a 59 never reads as an unqualified pass.
      note: load.score < 60
        ? 'Too much copy to read while passing.'
        : billboard >= 75
          ? 'Legible at a distance.'
          : billboard >= 45
            ? 'Usable, but a wider format and a bigger headline would carry further.'
            : 'Needs a wider format and a much bigger headline.',
    },
    {
      key: 'accessibility', label: 'Accessibility', score: a11y,
      basis: a11yBasis,
      note: a11yNote,
    },
  ];
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
