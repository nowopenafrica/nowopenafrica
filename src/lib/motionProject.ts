// Motion Studio — the unified project model behind Quick Create → Studio →
// AI Director. Every mode produces the same MotionProject, so an AI-generated
// brief is not a dead-end: open it in Studio, change the words, swap the
// palette, resize for another format and render again.
//
// The AI Director here is a rule-based local designer (honest: no external AI
// call). It parses a plain-English brief into a deterministic MotionProject —
// the same prompt always builds the same project. The UI labels it as designed
// locally; the real model-backed director slots into the same function later.

import type { MotionConfig, MotionDuration, MotionStyle, MotionTimeline } from './motionGraphics';
import { RENDER_PALETTES, type RenderAspect } from './renderVideo';
import type { MotionTemplate } from '../data/motionTemplates';
import type { AiVideoModel } from './pollinations';
import type { VideoGenTier } from './videoGen';
import { hashString } from './videoCreator';

export type MotionProjectStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

export const MOTION_PROJECT_STATUSES: readonly MotionProjectStatus[] = [
  'draft', 'review', 'approved', 'published', 'archived',
];

export const MOTION_PROJECT_STATUS_LABELS: Record<MotionProjectStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
};

export interface MotionProject {
  id: string;
  name: string;
  status: MotionProjectStatus;
  source: 'template' | 'blank' | 'ai';
  templateKey?: string;
  createdAt: string;
  updatedAt: string;
  brief: MotionConfig;
  palette: [string, string, string];
  render: { source: 'canvas' | 'aivideo'; tier: VideoGenTier; model: AiVideoModel };
  /** Editor timeline overlay — reorder/trim/split/duplicate/remove edits on top of the generated brief. */
  timeline?: MotionTimeline;
}

const DEFAULT_BRIEF: MotionConfig = {
  business: 'NowOpen',
  headline: 'NOWOPEN AFRICA',
  subhead: 'Every business, open to the world',
  cta: 'Find your next favourite',
  logoEmoji: '✦',
  aspect: 'Vertical',
  duration: 'medium',
  style: 'logo-reveal',
  // Seeded so a flyer template renders as a finished layout the moment it is
  // picked. An empty services column reads as a broken template, not an empty
  // one, and nobody evaluates a design they cannot see.
  //
  // Service names and contact details are safe defaults — they describe or
  // belong to NowOpen. The stat NUMBERS are placeholders and the editor says
  // so: shipping invented proof points as if measured is exactly what the
  // Trust Panel rule exists to prevent.
  services: [
    'Brand & identity design',
    'Social media management',
    'Web design & development',
    'Paid ads & SEO',
  ],
  stats: [
    { value: '10+', label: 'Years' },
    { value: '250+', label: 'Projects' },
    { value: '30+', label: 'Markets' },
  ],
  contact: ['+234 708 154 7726', 'hello@nowopenafrica.com', 'nowopenafrica.com'],
};

export const MOTION_PROJECTS_KEY = 'nowopen_motion_projects';

// ---------------------------------------------------------------------------
// Persistence (localStorage, nowopen_ prefix — same convention as the other
// Studio tools). Projects are keyed by id; saving upserts, never duplicates.
// ---------------------------------------------------------------------------

export function loadMotionProjects(): MotionProject[] {
  try {
    const raw = localStorage.getItem(MOTION_PROJECTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as MotionProject[])
      .filter((p) => p && typeof p.id === 'string' && p.brief)
      .map(normalizeMotionProject);
  } catch {
    return [];
  }
}

export function saveMotionProject(project: MotionProject): MotionProject[] {
  const normalized = normalizeMotionProject(project);
  const next = [normalized, ...loadMotionProjects().filter((p) => p.id !== project.id)];
  try { localStorage.setItem(MOTION_PROJECTS_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
  return next;
}

export function deleteMotionProject(id: string): MotionProject[] {
  const next = loadMotionProjects().filter((p) => p.id !== id);
  try { localStorage.setItem(MOTION_PROJECTS_KEY, JSON.stringify(next)); } catch { /* quota / private mode */ }
  return next;
}

export function getMotionProject(id: string): MotionProject | null {
  return loadMotionProjects().find((p) => p.id === id) ?? null;
}

export function duplicateMotionProject(project: MotionProject): MotionProject {
  return {
    ...project,
    id: `motion_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${project.name} (copy)`,
    status: 'draft',
    source: project.source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Builders — every entry point produces a full MotionProject.
// ---------------------------------------------------------------------------

export function blankMotionProject(aspect: RenderAspect = 'Vertical'): MotionProject {
  const now = new Date().toISOString();
  return {
    id: `motion_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: 'Untitled motion',
    status: 'draft',
    source: 'blank',
    createdAt: now,
    updatedAt: now,
    brief: { ...DEFAULT_BRIEF, aspect },
    palette: RENDER_PALETTES[0],
    render: { source: 'canvas', tier: 'free', model: 'wan' },
  };
}

export function motionProjectFromTemplate(template: MotionTemplate, aspect: RenderAspect = template.preset.aspect): MotionProject {
  const now = new Date().toISOString();
  return {
    id: `motion_${template.key}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: template.name,
    status: 'draft',
    source: 'template',
    templateKey: template.key,
    createdAt: now,
    updatedAt: now,
    // DEFAULT_BRIEF first so a preset, which carries only the motion fields,
    // still arrives with flyer content for the design templates that need it.
    brief: { ...DEFAULT_BRIEF, ...template.preset, business: 'NowOpen', aspect },
    palette: template.palette,
    render: { source: 'canvas', tier: 'free', model: 'wan' },
  };
}

/** Defensive fill so a persisted (or legacy) project never renders a blank field. */
function normalizeMotionProject(p: MotionProject): MotionProject {
  return {
    ...p,
    brief: {
      ...DEFAULT_BRIEF,
      ...p.brief,
      business: p.brief.business?.trim() || DEFAULT_BRIEF.business,
      headline: p.brief.headline?.trim() || DEFAULT_BRIEF.headline,
      subhead: p.brief.subhead?.trim() || DEFAULT_BRIEF.subhead,
      cta: p.brief.cta?.trim() || DEFAULT_BRIEF.cta,
      logoEmoji: p.brief.logoEmoji?.trim() || DEFAULT_BRIEF.logoEmoji,
    },
  };
}

// ---------------------------------------------------------------------------
// AI Director — deterministic local designer.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(['a', 'an', 'the', 'to', 'for', 'of', 'with', 'this', 'your', 'and', 'on', 'in', 'at', 'by', 'off', 'our']);

const AI_EMOJI: Record<string, string> = {
  food: '🍽️', fashion: '🛍️', premium: '🏨', tech: '🚀', beauty: '💄',
  event: '🎉', retail: '🏬', default: '✦',
};

function detectCategory(prompt: string): { key: string; label: string; emoji: string } {
  const p = prompt.toLowerCase();
  if (/(restaurant|cafe|café|kitchen|bakery|bar|grill|food)/.test(p)) return { key: 'food', label: 'Food & drink', emoji: AI_EMOJI.food };
  if (/(fashion|designer|boutique|cloth|style)/.test(p)) return { key: 'fashion', label: 'Fashion', emoji: AI_EMOJI.fashion };
  if (/(hotel|lodge|resort|real estate|luxury|premium|suite)/.test(p)) return { key: 'premium', label: 'Premium', emoji: AI_EMOJI.premium };
  if (/(tech|startup|software|app|saas|digital)/.test(p)) return { key: 'tech', label: 'Tech & startups', emoji: AI_EMOJI.tech };
  if (/(beauty|spa|salon|makeup|skincare)/.test(p)) return { key: 'beauty', label: 'Beauty & wellness', emoji: AI_EMOJI.beauty };
  if (/(event|wedding|concert|conference|award|seminar|workshop)/.test(p)) return { key: 'event', label: 'Events', emoji: AI_EMOJI.event };
  if (/(shop|store|retail|mall|market|vendor)/.test(p)) return { key: 'retail', label: 'Retail', emoji: AI_EMOJI.retail };
  return { key: 'default', label: 'Local business', emoji: AI_EMOJI.default };
}

function detectAspect(prompt: string): RenderAspect {
  const p = prompt.toLowerCase();
  if (/(billboard|youtube|tv|website|web|landscape|led|signage|cinema)/.test(p)) return 'Landscape';
  if (/(square|feed|post)/.test(p)) return 'Square';
  return 'Vertical';
}

function detectStyle(prompt: string): MotionStyle {
  const p = prompt.toLowerCase();
  if (/(billboard|led |led$|marquee|roadside|signage|outdoor ad|neon sign)/.test(p)) return 'billboard-led';
  if (/(apple tv|key art|premium|elegant|luxury|cinematic|sophisticated|classy)/.test(p)) return 'premium-keyart';
  if (/(glassmorph|glass |frosted|modern card|clean|minimal card)/.test(p)) return 'glassmorphic';
  if (/(3d|isometric|parallax|depth|floating shapes)/.test(p)) return 'isometric-3d';
  if (/(countdown|coming soon|launch)/.test(p)) return 'countdown';
  if (/(logo|opener|intro|reveal)/.test(p)) return 'logo-reveal';
  if (/(lower third|caption|name|role)/.test(p)) return 'lower-third';
  if (/(quote|kinetic|lyric|hook)/.test(p)) return 'kinetic-type';
  if (/(open now|verified|badge|stamp)/.test(p)) return 'badge';
  if (/(announcement|broadcast|notice)/.test(p)) return 'reveal-title';
  return 'motion-poster';
}

function detectDuration(prompt: string): MotionDuration {
  const m = prompt.match(/(\d+)\s*(?:-|to\s*)?\d*\s*second/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n <= 10) return 'short';
    if (n <= 15) return 'medium';
    if (n <= 20) return 'long';
    if (n <= 30) return 'extended';
    return 'cinematic';
  }
  const p = prompt.toLowerCase();
  if (/short/.test(p)) return 'short';
  if (/cinematic/.test(p)) return 'cinematic';
  if (/extended|slow|relaxed/.test(p)) return 'extended';
  if (/long/.test(p)) return 'long';
  return 'medium';
}

function extractBusiness(prompt: string): string {
  const afterFor = prompt.match(/\bfor\s+(?:the\s+|a\s+|an\s+)?([A-Z][\w&' -]{1,40}?)(?:\s+offering|\s+with|\s+—|\s+-|,|\.|$)/i);
  const afterAt = prompt.match(/\b(?:at|by)\s+(?:the\s+)?([A-Z][\w&' -]{1,40}?)(?:\s+—|\s+-|,|\.|$)/i);
  const raw = afterFor?.[1] ?? afterAt?.[1];
  if (raw) {
    const cleaned = raw.trim().replace(/\s+/g, ' ');
    if (cleaned.length >= 3) return cleaned;
  }
  return 'NowOpen';
}

function headlineFromPrompt(prompt: string, percent: number | null): string {
  if (percent !== null) return `${percent}% OFF`;
  const p = prompt.toLowerCase();
  if (/(grand opening|now open)/.test(p)) return 'NOW OPEN';
  if (/(coming soon|launch|countdown)/.test(p)) return 'COMING SOON';
  if (/\bsale\b/.test(p)) return 'SALE';
  const words = prompt
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w.toLowerCase()) && !/\d+/.test(w))
    .slice(0, 4);
  const joined = words.join(' ').toUpperCase();
  return joined.length >= 4 ? joined : 'NOWOPEN';
}

function ctaFromPrompt(prompt: string, percent: number | null): string {
  const p = prompt.toLowerCase();
  if (percent !== null) return 'Claim the offer';
  if (/(book|reserve)/.test(p)) return 'Book your spot';
  if (/(order|shop|buy)/.test(p)) return 'Order now';
  if (/(visit|stop by)/.test(p)) return 'Visit us today';
  if (/(call|contact)/.test(p)) return 'Call today';
  if (/(app|launch|install|download|sign ?up)/.test(p)) return 'Get started';
  return 'Find out more';
}

function subheadFromPrompt(prompt: string, business: string, percent: number | null): string {
  if (percent !== null) {
    const m = prompt.match(/this\s+(weekend|week|month)/i);
    if (m) return `This ${m[1].toLowerCase()} only`;
    return 'Limited time only';
  }
  const m = prompt.match(/on\s+([A-Z][a-z]+day)/i);
  if (m) return m[1];
  if (/(coming soon|launch)/.test(prompt.toLowerCase())) return 'Launching soon';
  return `${business} — proudly NowOpen`;
}

/** Deterministic, local AI Director: plain-English brief → a full project. */
export function motionProjectFromPrompt(prompt: string): MotionProject {
  const trimmed = prompt.trim();
  const category = detectCategory(trimmed);
  const aspect = detectAspect(trimmed);
  const style = detectStyle(trimmed);
  const duration = detectDuration(trimmed);
  const business = extractBusiness(trimmed);
  const percent = trimmed.match(/(\d+)\s*%/)?.[1] ? parseInt(trimmed.match(/(\d+)\s*%/)![1], 10) : null;

  const now = new Date().toISOString();
  const seed = hashString(trimmed.toLowerCase());

  return {
    id: `motion_ai_${Math.abs(seed).toString(36)}`,
    name: `AI brief — ${business}`,
    status: 'draft',
    source: 'ai',
    createdAt: now,
    updatedAt: now,
    brief: {
      ...DEFAULT_BRIEF,
      business,
      headline: headlineFromPrompt(trimmed, percent),
      subhead: subheadFromPrompt(trimmed, business, percent),
      cta: ctaFromPrompt(trimmed, percent),
      logoEmoji: category.emoji,
      aspect,
      duration,
      style,
    },
    palette: RENDER_PALETTES[Math.abs(seed) % RENDER_PALETTES.length],
    render: { source: 'canvas', tier: 'free', model: 'wan' },
  };
}
