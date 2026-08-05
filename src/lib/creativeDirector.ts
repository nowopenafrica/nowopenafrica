// NowOpen Studio — AI Creative Director (the "brain").
//
// Sits between the business owner and the video generator, exactly like a
// creative director at an agency. Reads a one-line brief, then decides the
// campaign objective, target audience, message, offer, video type, hook,
// storyline, full script, scene list with camera moves, colour grade, music,
// CTA, caption, hashtags, thumbnail, duration and platform — and packages it
// into a creative brief the AI Video Generator can execute with zero further
// prompting.
//
// Also implements the agency-style features: five creative directions to pitch
// (like concept boards to a client), per-scene regeneration, and a Creative
// Director review with weighted scores. Everything is deterministic (seeded by
// the business + brief + direction) and pure enough to unit-test.

import { Business } from '../types';
import {
  VideoGoal, VideoProject, UploadMedia,
  formatByKey,
  generateVideoProject, hashString, mulberry32, pick,
} from './videoCreator';
import {
  buildAgencyPlan, goalCardByKey,
  type AgencyPlan,
} from './agencyStudio';

// --- Creative directions ------------------------------------------------------

export type CreativeDirection = 'luxury' | 'cinematic' | 'funny' | 'emotional' | 'commercial';

export interface DirectionProfile {
  key: CreativeDirection;
  label: string;
  emoji: string;
  desc: string;
  style: string;
  music: string;
  grade: string;
  camera: string;
  motion: string;
  hooks: string[];
}

export const CREATIVE_DIRECTIONS: DirectionProfile[] = [
  {
    key: 'luxury', label: 'Luxury', emoji: '💎',
    desc: 'Slow, elegant, gold-accented — for premium positioning.',
    style: 'luxury', music: 'cinematic',
    grade: 'Deep blacks, gold highlights, slow dolly',
    camera: 'Slow push-ins and glide shots',
    motion: 'Gold serif titles, soft fades',
    hooks: ['Where elegance meets excellence.', 'Treat yourself to the finer things.', 'This is luxury, local.'],
  },
  {
    key: 'cinematic', label: 'Cinematic', emoji: '🎬',
    desc: 'Filmic grade, letterbox feel — Apple TV+ energy.',
    style: 'cinematic', music: 'cinematic',
    grade: 'Warm filmic grade, soft highlights, anamorphic feel',
    camera: 'Drone-style sweeps and slow pans',
    motion: 'Letterbox bars, film-credit titles',
    hooks: ['This is not just any day.', 'Every detail was made for you.', 'Watch until the end.'],
  },
  {
    key: 'funny', label: 'Funny', emoji: '😂',
    desc: 'Playful, fast cuts, meme energy — built to be shared.',
    style: 'energy', music: 'pop',
    grade: 'Bright, saturated, high-key',
    camera: 'Whip pans and punch zooms',
    motion: 'Big emoji captions, playful pops',
    hooks: ['You will laugh. Then you will book.', 'Do not scroll — you will regret it.', 'Our customers said the same thing. You will too.'],
  },
  {
    key: 'emotional', label: 'Emotional', emoji: '❤️',
    desc: 'Warm, human, story-first — connection over conversion.',
    style: 'cinematic', music: 'acoustic',
    grade: 'Soft warm tones, shallow depth of field',
    camera: 'Handheld intimacy, slow close-ups',
    motion: 'Gentle quote cards, subtle fades',
    hooks: ['This one hits different.', 'We built this for people like you.', 'A little love goes a long way.'],
  },
  {
    key: 'commercial', label: 'Commercial', emoji: '📣',
    desc: 'Direct, punchy, offer-led — the safe sell that converts.',
    style: 'modern-african', music: 'afrobeats',
    grade: 'Crisp, brand-accurate, product-lit',
    camera: 'Product hero shots, rack focus',
    motion: 'Bold titles, animated CTA button',
    hooks: ['The offer you have been waiting for.', 'Limited time. Real value.', 'Straight to the point — this is the deal.'],
  },
];

export const directionByKey = (k: CreativeDirection): DirectionProfile =>
  CREATIVE_DIRECTIONS.find((d) => d.key === k) ?? CREATIVE_DIRECTIONS[0];

export const directionLetter = (k: CreativeDirection): string =>
  String.fromCharCode(65 + CREATIVE_DIRECTIONS.findIndex((d) => d.key === k));

// --- Scene enrichment ----------------------------------------------------------

export interface DirectorScene {
  id: string;
  order: number;
  seconds: number;
  text: string;
  direction: string;
  camera: string;
  voiceover: string;
  transition: string;
  grading: string;
  motion: string;
}

const CAMERA_MOVES = [
  'Punch-in zoom', 'Slow push-in', 'Whip pan', 'Tilt-up reveal', 'Tracking shot',
  'Static tripod', 'Handheld energy', 'Drone-style sweep', 'Rack focus', 'Glide pan',
];

// --- Audience, storyline, offer -------------------------------------------------

const GOAL_AUDIENCE: Record<VideoGoal, string> = {
  sales: 'buyers ready to act',
  calls: 'people who want answers fast',
  bookings: 'customers who value their time',
  recruit: 'ambitious candidates looking for growth',
  property: 'home hunters who move fast',
  event: 'the crowd that actually shows up',
  launch: 'early adopters and loyal fans',
  awareness: 'new eyes on your brand',
  brand: 'people who care who they buy from',
};

const STORYLINES: Record<VideoGoal, string> = {
  sales: 'Open with the offer, show it in action, prove it with customers, add a deadline, then the CTA.',
  calls: 'Name the problem, introduce the fix, prove it works, then ask for the call.',
  bookings: 'Show the experience, show the demand, make booking feel effortless, then the CTA.',
  recruit: 'Show the culture, show the role, show the growth, then invite applications.',
  property: 'Reveal the exterior, walk the space, highlight the finishes, show the location, then book a viewing.',
  event: 'Build the hype, show the lineup, add the countdown, then get the ticket.',
  launch: 'Tease it, reveal it, show the detail, then launch the CTA.',
  awareness: 'Hook fast, show what makes you different, keep it short and shareable.',
  brand: 'Start with why, show the people, show the craft, end with the invitation.',
};

// --- Director review -------------------------------------------------------------

export interface DirectorReview {
  hookStrength: number;
  visualQuality: number;
  brandConsistency: number;
  customerAttention: number;
  cta: number;
  overall: number;
  suggestions: string[];
}

export function directorReview(
  business: Pick<Business, 'phone' | 'logo_url' | 'image_url'>,
  video: VideoProject,
  scenes: DirectorScene[],
  readiness: number,
  urgency: boolean,
): DirectorReview {
  const base = Math.min(9.9, 5.5 + video.prediction.stars);
  const clamp = (n: number) => Math.max(2, Math.min(9.9, Math.round(n * 10) / 10));

  const hl = video.hook.length;
  const hookStrength = clamp(base + (hl >= 8 && hl <= 45 ? 0.8 : hl < 8 ? -1.5 : -0.4) + (urgency ? 0.3 : 0));
  const visualQuality = clamp(base + (scenes.length >= 5 ? 0.6 : scenes.length < 3 ? -1 : 0) + (video.upload ? 0.3 : 0));
  const brandConsistency = clamp(3 + (readiness / 100) * 6.5);
  const totalSec = scenes.reduce((s, x) => s + x.seconds, 0);
  const customerAttention = clamp(base + (totalSec <= 30 ? 0.5 : -0.5));
  const cta = clamp(base + (business.phone ? 0.8 : 0) + (video.cta.length >= 10 && video.cta.length <= 45 ? 0.3 : 0));

  const overall = Math.round(
    (hookStrength * 0.22 + visualQuality * 0.2 + brandConsistency * 0.18 + customerAttention * 0.2 + cta * 0.2) * 10,
  ) / 10;

  const suggestions: string[] = [];
  if (hookStrength < 7.5) suggestions.push('Make the hook sharper — fewer words, bigger type, faster first cut.');
  if (brandConsistency < 7.5) suggestions.push('Put your logo in the first 2 seconds and hold it on the end card.');
  if (cta < 7.5) suggestions.push('Improve the CTA — say exactly what to do, e.g. “Order on WhatsApp now”.');
  if (customerAttention < 7.5) suggestions.push('Shorten the ending — land the CTA a scene earlier.');
  if (visualQuality < 7.5) suggestions.push('Add a customer testimonial clip for social proof in the middle.');
  const PAD = [
    'Slow the transition between the second and third scenes.',
    'Add motion graphics on the offer so “Today only” pops.',
    'Colour-grade the thumbnails to match the end card.',
    'Put your phone number on screen for the last 3 seconds.',
    'Match the music drop to the hook beat.',
  ];
  for (const p of PAD) {
    if (suggestions.length >= 5) break;
    suggestions.push(p);
  }

  return { hookStrength, visualQuality, brandConsistency, customerAttention, cta, overall, suggestions };
}

// --- Creative brief ---------------------------------------------------------------

export interface CreativeBrief {
  briefText: string;
  direction: CreativeDirection;
  directionLabel: string;
  plan: AgencyPlan;
  video: VideoProject;
  objective: string;
  audience: string;
  message: string;
  offer: string;
  videoType: string;
  duration: number;
  platform: string;
  storyline: string;
  scenes: DirectorScene[];
  script: string;
  review: DirectorReview;
  hook: string;
  cta: string;
}

export function buildCreativeBrief(
  business: Business,
  briefText: string,
  direction: CreativeDirection,
  opts: { goal?: VideoGoal } = {},
): CreativeBrief {
  const plan = buildAgencyPlan(business, briefText, opts);
  const profile = directionByKey(direction);
  const parse = plan.parse;
  const industry = plan.industry;
  const goal = plan.recommendation.goal;
  const goalCard = goalCardByKey(goal);
  const topic = parse.topic || industry.promise;

  const rng = mulberry32(hashString(business.id + '|' + briefText + '|' + direction));
  const hookBank = [...profile.hooks, ...plan.hooks];
  const hook = pick(rng, hookBank);

  const video = generateVideoProject(business, {
    ...plan.input,
    hook,
    style: profile.style,
    music: profile.music,
  });

  const scenes: DirectorScene[] = video.scenes.map((s, i) => {
    const isLast = i === video.scenes.length - 1;
    return {
      id: s.id,
      order: i + 1,
      seconds: s.seconds,
      text: s.text,
      direction: s.direction,
      camera: pick(rng, CAMERA_MOVES),
      voiceover: s.voiceover,
      transition: s.transition,
      grading: profile.grade,
      motion: isLast ? 'Logo + phone number end card' : profile.motion,
    };
  });

  const topicTitle = topic.charAt(0).toUpperCase() + topic.slice(1);
  const objective = `${goalCard.label}: ${goalCard.desc}.`;
  const audience = `${industry.label} customers in ${business.location || 'your city'} — ${GOAL_AUDIENCE[goal]}.`;
  const message = topic.toLowerCase().includes(business.name.toLowerCase())
    ? `${topicTitle} — ${industry.promise}.`
    : `${topicTitle} at ${business.name} — ${industry.promise}.`;
  const offer = parse.urgency
    ? `${topicTitle} — this weekend only.`
    : parse.priceMention
      ? `${topicTitle} at a deal price.`
      : `${goalCard.desc} today.`;
  const videoType = formatByKey(plan.recommendation.format).label;
  const storyline = STORYLINES[goal];
  const script = scenes.map((s) => s.voiceover).filter(Boolean).join('\n');
  const review = directorReview(business, video, scenes, plan.assets.readiness, parse.urgency);

  return {
    briefText,
    direction,
    directionLabel: profile.label,
    plan,
    video,
    objective,
    audience,
    message,
    offer,
    videoType,
    duration: plan.recommendation.duration,
    platform: plan.recommendation.platform,
    storyline,
    scenes,
    script,
    review,
    hook,
    cta: video.cta,
  };
}

// --- Regenerate only one scene -----------------------------------------------------

const SCENE_TEXTS = [
  'The details matter', 'Made with care', 'Fresh, made today', 'You asked. We delivered.',
  'Worth the wait', 'Quality you can see', 'Made for you', 'This is the difference',
];

const SCENE_VOICES = [
  'Notice the details — everything is intentional.',
  'Fresh ingredients, made today — the way it should be.',
  'This is what sets us apart.',
  'Take a closer look — it is worth it.',
  'Crafted for people who notice.',
];

export function regenerateScene(business: Business, brief: CreativeBrief, sceneOrder: number, attempt: number): DirectorScene {
  const base = brief.scenes.find((s) => s.order === sceneOrder) ?? brief.scenes[brief.scenes.length - 1];
  const rng = mulberry32(hashString(business.id + '|' + brief.briefText + '|scene' + sceneOrder + '|' + attempt));
  return {
    ...base,
    order: sceneOrder,
    text: pick(rng, SCENE_TEXTS),
    camera: pick(rng, CAMERA_MOVES),
    voiceover: pick(rng, SCENE_VOICES),
  };
}

// --- Pack export --------------------------------------------------------------------

export interface DirectorPackExtras {
  hook?: string;
  cta?: string;
  script?: string;
  voiceover?: string;
  quality?: string;
  length?: number;
  format?: string;
  aspect?: string;
  titles?: string;
  logoAnimation?: boolean;
  callouts?: boolean;
  media?: UploadMedia[];
  caption?: string;
  /** Free AI video model used for the render (label), plus its auto reason. */
  model?: string;
  modelReason?: string;
  /** Number of real stock clips filmed per storyboard scene. */
  footageCount?: number;
}

export function directorPackText(business: Business, brief: CreativeBrief, extras: DirectorPackExtras = {}): string {
  const lines = [
    `${brief.directionLabel.toUpperCase()} DIRECTION — ${brief.message.toUpperCase()}`,
    '',
    'AI CREATIVE DIRECTOR — CREATIVE BRIEF',
    `Business: ${business.name}${business.location ? `, ${business.location}` : ''}`,
    `Direction: Version ${directionLetter(brief.direction)} — ${brief.directionLabel} (${directionByKey(brief.direction).desc})`,
    '',
    'CAMPAIGN',
    `Objective: ${brief.objective}`,
    `Audience: ${brief.audience}`,
    `Message: ${brief.message}`,
    `Offer: ${brief.offer}`,
    `Video type: ${brief.videoType} · ${brief.duration}s`,
    `Platform: ${platformLabel(brief.platform)}`,
    `Storyline: ${brief.storyline}`,
    '',
    'EXECUTION',
    `Hook: ${extras.hook ?? brief.hook}`,
    `CTA: ${extras.cta ?? brief.cta}`,
    `Voiceover: ${extras.voiceover ?? brief.video.voiceover}`,
    `Music: ${brief.video.music}`,
    `Style: ${brief.video.style}`,
    `Colour grade: ${directionByKey(brief.direction).grade}`,
    `Titles: ${extras.titles ?? brief.video.subtitle} · Logo animation: ${extras.logoAnimation === false ? 'off' : 'on'} · Callouts: ${extras.callouts ? 'on' : 'off'}`,
    '',
    'STORYBOARD',
    ...brief.scenes.map((s) => {
      const vo = extras.script
        ? (extras.script.split('\n')[s.order - 1] ?? s.voiceover).trim()
        : s.voiceover;
      return `Scene ${s.order} · [${s.seconds}s] ${s.text}\n   🎥 ${s.direction} (${s.camera})\n   🎨 ${s.grading}\n   ✨ ${s.motion}\n   🎙️ ${vo}`;
    }),
    '',
    'SCRIPT',
    extras.script ?? brief.script,
    '',
    'CAPTION',
    extras.caption ?? brief.video.caption,
    '',
    ...brief.video.hashtags,
    '',
    'CREATIVE DIRECTOR REVIEW',
    `Hook strength: ${brief.review.hookStrength}/10`,
    `Visual quality: ${brief.review.visualQuality}/10`,
    `Brand consistency: ${brief.review.brandConsistency}/10`,
    `Customer attention: ${brief.review.customerAttention}/10`,
    `CTA: ${brief.review.cta}/10`,
    `Overall: ${brief.review.overall}/10`,
    'Suggestions:',
    ...brief.review.suggestions.map((s) => `  • ${s}`),
    '',
    'RENDER SETTINGS',
    `Quality: ${extras.quality ?? '1080p'} · Length: ${extras.length ?? brief.duration}s · Container: ${extras.format ?? 'MP4'} · Aspect: ${extras.aspect ?? 'Vertical'}`,
    `AI Video Model: ${extras.model ?? 'Auto — Wan 2.2 (Alibaba)'}${extras.modelReason ? ` — ${extras.modelReason}` : ''}`,
    `Media attached: ${extras.media?.length ?? 0} file(s)`,
    `Footage: ${extras.footageCount ? `${extras.footageCount} real stock clip(s) (Pexels)` : 'generated graphics (no stock key set)'}`,
  ];
  if (brief.plan.season) {
    lines.push('', 'SEASON CAMPAIGN', `Occasion: ${brief.plan.season.occasion.label}`, `SMS: ${brief.plan.season.plan.sms}`, `Email subject: ${brief.plan.season.plan.emailSubject}`);
  }
  return lines.join('\n');
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = {
    instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube', whatsapp: 'WhatsApp', google: 'Google',
  };
  return map[platform] ?? platform;
}

// --- Director brief persistence -----------------------------------------------------
//
// The Creative Brief lives alongside the saved video project, so reloading a
// project restores the whole director brain — direction, storyboard, camera
// moves, grading, review and render settings — not just the output frames.

export interface DirectorBriefSettings {
  voiceover: string;
  titles: string;
  logoAnimation: boolean;
  callouts: boolean;
  transitionPref: string;
  quality: string;
  length: number;
  container: string;
  aspect: string;
  /** Free AI video model key used for the last render ('auto' = best free). */
  model?: string;
  /** Film the reel over real stock footage instead of generated graphics. */
  stockFootage?: boolean;
}

export interface DirectorBriefRecord {
  id: string;
  projectId: string;
  businessId: string;
  savedAt: string;
  brief: CreativeBrief;
  settings: DirectorBriefSettings;
}

export function directorKey(businessId: string): string {
  return `nowopen_directorBrief_${businessId}`;
}

export function loadDirectorBriefs(businessId: string): DirectorBriefRecord[] {
  try {
    const raw = localStorage.getItem(directorKey(businessId));
    const parsed = raw ? (JSON.parse(raw) as DirectorBriefRecord[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDirectorBrief(businessId: string, record: DirectorBriefRecord): DirectorBriefRecord[] {
  const next = [record, ...loadDirectorBriefs(businessId).filter((r) => r.projectId !== record.projectId)];
  try { localStorage.setItem(directorKey(businessId), JSON.stringify(next)); } catch { /* quota / private mode */ }
  return next;
}

export function getDirectorBrief(businessId: string, projectId: string): DirectorBriefRecord | null {
  return loadDirectorBriefs(businessId).find((r) => r.projectId === projectId) ?? null;
}

export function deleteDirectorBrief(businessId: string, projectId: string): DirectorBriefRecord[] {
  const next = loadDirectorBriefs(businessId).filter((r) => r.projectId !== projectId);
  try { localStorage.setItem(directorKey(businessId), JSON.stringify(next)); } catch { /* quota / private mode */ }
  return next;
}

export function buildDirectorBriefRecord(
  projectId: string,
  businessId: string,
  brief: CreativeBrief,
  settings: DirectorBriefSettings,
): DirectorBriefRecord {
  return {
    id: `db_${hashString(projectId + businessId).toString(16)}_${Date.now().toString(36)}`,
    projectId,
    businessId,
    savedAt: new Date().toISOString(),
    brief,
    settings,
  };
}
