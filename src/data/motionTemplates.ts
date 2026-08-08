// Motion Graphics Studio — modern template gallery.
//
// A curated set of the latest motion design concepts (glassmorphism, kinetic
// type, neon noir, neo-brutalism, …). Each template is a starting point, not a
// finished poster: selecting one loads its concept into the editor — style,
// palette, words, shape and pace — and the owner can tweak anything after.
// Because every template maps onto the same pure MotionConfig fields, the
// existing storyboard builder + canvas renderer consume it exactly like a
// hand-written brief.

import type { MotionStyle, MotionDuration } from '../lib/motionGraphics';
import type { RenderAspect } from '../lib/renderVideo';

export interface MotionTemplatePreset {
  style: MotionStyle;
  aspect: RenderAspect;
  duration: MotionDuration;
  headline: string;
  subhead: string;
  cta: string;
  logoEmoji: string;
}

export interface MotionTemplate {
  key: string;
  name: string;
  concept: string;
  /** Audience signal chips, e.g. 'Trending', 'Viral', 'New'. */
  tags: string[];
  emoji: string;
  palette: [string, string, string];
  preset: MotionTemplatePreset;
}

export const MOTION_TEMPLATES: MotionTemplate[] = [
  {
    key: 'aurora-glass',
    name: 'Aurora Glass',
    concept: 'Frosted glass panels drifting over a flowing aurora gradient.',
    tags: ['Trending', 'New'],
    emoji: '🧊',
    palette: ['#1e3a8a', '#7c3aed', '#ec4899'],
    preset: { style: 'motion-poster', aspect: 'Vertical', duration: 'short', headline: 'AURORA DROP', subhead: 'Cold, clear, refreshing', cta: 'Taste the moment', logoEmoji: '❄️' },
  },
  {
    key: 'neo-brutalism',
    name: 'Neo-Brutalism',
    concept: 'Hard borders, loud flat colour and an offset shadow — unmissable.',
    tags: ['Trending'],
    emoji: '🟨',
    palette: ['#facc15', '#f43f5e', '#0f172a'],
    preset: { style: 'motion-poster', aspect: 'Square', duration: 'medium', headline: 'BIG ENERGY', subhead: 'Loud. Bold. Unmissable.', cta: 'Claim yours today', logoEmoji: '🟥' },
  },
  {
    key: 'kinetic-storm',
    name: 'Kinetic Storm',
    concept: 'One word per beat — the hook pops in sync with the tempo.',
    tags: ['Viral', 'New'],
    emoji: '🌀',
    palette: ['#0ea5e9', '#22d3ee', '#ffffff'],
    preset: { style: 'kinetic-type', aspect: 'Vertical', duration: 'medium', headline: 'Drop the hook first', subhead: 'Words that hit on the beat', cta: 'Follow the series', logoEmoji: '⚡' },
  },
  {
    key: 'neon-noir',
    name: 'Neon Noir',
    concept: 'A dark cityscape with razor-thin neon strokes on deep black.',
    tags: ['New'],
    emoji: '🌃',
    palette: ['#020617', '#22d3ee', '#f0abfc'],
    preset: { style: 'logo-reveal', aspect: 'Vertical', duration: 'long', headline: 'AFTER DARK', subhead: 'The city that never sleeps', cta: 'Open till late', logoEmoji: '🌙' },
  },
  {
    key: 'mono-editorial',
    name: 'Mono Editorial',
    concept: 'A quiet magazine cover — black & white, huge type, no noise.',
    tags: ['Classic', 'Editorial'],
    emoji: '◾',
    palette: ['#0f0f0f', '#525252', '#fafafa'],
    preset: { style: 'reveal-title', aspect: 'Landscape', duration: 'long', headline: 'LESS IS MORE', subhead: 'The quiet statement', cta: 'Read the story', logoEmoji: '◆' },
  },
  {
    key: 'duotone-pop',
    name: 'Duotone Pop',
    concept: 'Two-tone poster energy — high contrast ink with a punchy accent.',
    tags: ['Trending'],
    emoji: '🎨',
    palette: ['#111827', '#fb7185', '#34d399'],
    preset: { style: 'motion-poster', aspect: 'Square', duration: 'short', headline: 'TWO TONES, ONE MOOD', subhead: 'High contrast, high energy', cta: 'Get the look', logoEmoji: '🟣' },
  },
  {
    key: 'y2k-chrome',
    name: 'Y2K Chrome',
    concept: 'Glossy metallic shine and baby pastels — pure retro-future.',
    tags: ['Retro', 'New'],
    emoji: '💿',
    palette: ['#7dd3fc', '#d8b4fe', '#f0abfc'],
    preset: { style: 'badge', aspect: 'Square', duration: 'medium', headline: 'FRESH DROP', subhead: 'Glossy, shiny, futuristic', cta: 'Shop the drop', logoEmoji: '💿' },
  },
  {
    key: 'countdown-launch',
    name: 'Countdown Launch',
    concept: '3…2…1…GO — a hype ramp that ends with the call to action.',
    tags: ['Viral'],
    emoji: '🚀',
    palette: ['#7c3aed', '#f97316', '#fde047'],
    preset: { style: 'countdown', aspect: 'Vertical', duration: 'short', headline: 'GO!', subhead: 'Launching in seconds', cta: 'Notify me on launch', logoEmoji: '🚀' },
  },
  {
    key: 'broadcast-caption',
    name: 'Broadcast Caption',
    concept: 'A clean name + role caption for interviews, panels and podcasts.',
    tags: ['Classic'],
    emoji: '📺',
    palette: ['#164e63', '#0ea5e9', '#f8fafc'],
    preset: { style: 'lower-third', aspect: 'Landscape', duration: 'medium', headline: 'Chief Editor', subhead: 'The Voice of NowOpen Africa', cta: '', logoEmoji: '🎙️' },
  },
  {
    key: 'soft-pastel',
    name: 'Soft Pastel',
    concept: 'Dreamy candy tones and slow, gentle motion for lifestyle drops.',
    tags: ['Trending'],
    emoji: '🍧',
    palette: ['#fbcfe8', '#c7d2fe', '#e0f2fe'],
    preset: { style: 'logo-reveal', aspect: 'Square', duration: 'long', headline: 'SOFT HOUR', subhead: 'Calm colours, slow mornings', cta: 'Start your morning', logoEmoji: '☁️' },
  },
  {
    key: 'ember-luxury',
    name: 'Ember Luxury',
    concept: 'Charcoal, ember gold and a serif-feel title — refined and rare.',
    tags: ['New'],
    emoji: '🔥',
    palette: ['#1c1917', '#f59e0b', '#fef3c7'],
    preset: { style: 'reveal-title', aspect: 'Landscape', duration: 'long', headline: 'GOLD STANDARD', subhead: 'Refined. Rare. Yours.', cta: 'Reserve your seat', logoEmoji: '👑' },
  },
  {
    key: 'viral-stack',
    name: 'Viral Stack',
    concept: 'One bold word at a time, stacked for the feed — made to replay.',
    tags: ['Viral'],
    emoji: '💥',
    palette: ['#db2777', '#7c3aed', '#0f172a'],
    preset: { style: 'kinetic-type', aspect: 'Vertical', duration: 'short', headline: 'Say it once', subhead: 'Make it loud', cta: 'Share the reel', logoEmoji: '💥' },
  },
];

export const motionTemplateByKey = (key: string): MotionTemplate | undefined =>
  MOTION_TEMPLATES.find((t) => t.key === key);
