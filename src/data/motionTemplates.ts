// Motion Graphics Studio — modern template gallery.
//
// A curated set of the latest motion design concepts (billboard LED, Apple TV
// key art, glassmorphism, 3D depth, kinetic type, neon noir, neo-brutalism, …).
// Each template is a starting point, not a finished poster: selecting one loads
// its concept into the editor — style, palette, words, shape and pace — and the
// owner can tweak anything after. Because every template maps onto the same
// pure MotionConfig fields, the existing storyboard builder + canvas renderer
// consume it exactly like a hand-written brief.

import type { MotionStyle, MotionDuration } from '../lib/motionGraphics';
import type { RenderAspect } from '../lib/renderVideo';

/**
 * The design language of a template. Templates are grouped by these styles in
 * the gallery, so a creator who knows they want "retro" or "corporate" can find
 * a starting point at a glance instead of reading concepts. Each style is a
 * full, editable MotionProject once loaded — nothing here is a fixed colour mix.
 */
export type DesignStyle = 'minimal' | 'retro' | 'corporate' | 'fun' | 'tech' | '3d';

export interface DesignStyleMeta {
  key: DesignStyle;
  label: string;
  emoji: string;
  blurb: string;
}

export const DESIGN_STYLES: DesignStyleMeta[] = [
  { key: 'minimal', label: 'Minimal', emoji: '◽', blurb: 'Quiet, lots of air, one strong statement.' },
  { key: 'retro', label: 'Retro', emoji: '📼', blurb: 'Vintage warmth — neon, chrome and old-school charm.' },
  { key: 'corporate', label: 'Corporate', emoji: '💼', blurb: 'Trustworthy, refined, built for business.' },
  { key: 'fun', label: 'Fun', emoji: '🎈', blurb: 'Bold, loud and playful — made to be shared.' },
  { key: 'tech', label: 'Tech', emoji: '⚡', blurb: 'Sleek gradients, glass and future energy.' },
  { key: '3d', label: '3D', emoji: '🧊', blurb: 'Layered depth and parallax that pops.' },
];

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
  /** The design language this template belongs to (groups the gallery). */
  designStyle: DesignStyle;
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
    designStyle: 'tech',
    preset: { style: 'motion-poster', aspect: 'Vertical', duration: 'short', headline: 'AURORA DROP', subhead: 'Cold, clear, refreshing', cta: 'Taste the moment', logoEmoji: '❄️' },
  },
  {
    key: 'neo-brutalism',
    name: 'Neo-Brutalism',
    concept: 'Hard borders, loud flat colour and an offset shadow — unmissable.',
    tags: ['Trending'],
    emoji: '🟨',
    palette: ['#facc15', '#f43f5e', '#0f172a'],
    designStyle: 'fun',
    preset: { style: 'motion-poster', aspect: 'Square', duration: 'medium', headline: 'BIG ENERGY', subhead: 'Loud. Bold. Unmissable.', cta: 'Claim yours today', logoEmoji: '🟥' },
  },
  {
    key: 'kinetic-storm',
    name: 'Kinetic Storm',
    concept: 'One word per beat — the hook pops in sync with the tempo.',
    tags: ['Viral', 'New'],
    emoji: '🌀',
    palette: ['#0ea5e9', '#22d3ee', '#ffffff'],
    designStyle: 'fun',
    preset: { style: 'kinetic-type', aspect: 'Vertical', duration: 'medium', headline: 'Drop the hook first', subhead: 'Words that hit on the beat', cta: 'Follow the series', logoEmoji: '⚡' },
  },
  {
    key: 'neon-noir',
    name: 'Neon Noir',
    concept: 'A dark cityscape with razor-thin neon strokes on deep black.',
    tags: ['New'],
    emoji: '🌃',
    palette: ['#020617', '#22d3ee', '#f0abfc'],
    designStyle: 'retro',
    preset: { style: 'logo-reveal', aspect: 'Vertical', duration: 'long', headline: 'AFTER DARK', subhead: 'The city that never sleeps', cta: 'Open till late', logoEmoji: '🌙' },
  },
  {
    key: 'mono-editorial',
    name: 'Mono Editorial',
    concept: 'A quiet magazine cover — black & white, huge type, no noise.',
    tags: ['Classic', 'Editorial'],
    emoji: '◾',
    palette: ['#0f0f0f', '#525252', '#fafafa'],
    designStyle: 'minimal',
    preset: { style: 'reveal-title', aspect: 'Landscape', duration: 'long', headline: 'LESS IS MORE', subhead: 'The quiet statement', cta: 'Read the story', logoEmoji: '◆' },
  },
  {
    key: 'duotone-pop',
    name: 'Duotone Pop',
    concept: 'Two-tone poster energy — high contrast ink with a punchy accent.',
    tags: ['Trending'],
    emoji: '🎨',
    palette: ['#111827', '#fb7185', '#34d399'],
    designStyle: 'fun',
    preset: { style: 'motion-poster', aspect: 'Square', duration: 'short', headline: 'TWO TONES, ONE MOOD', subhead: 'High contrast, high energy', cta: 'Get the look', logoEmoji: '🟣' },
  },
  {
    key: 'y2k-chrome',
    name: 'Y2K Chrome',
    concept: 'Glossy metallic shine and baby pastels — pure retro-future.',
    tags: ['Retro', 'New'],
    emoji: '💿',
    palette: ['#7dd3fc', '#d8b4fe', '#f0abfc'],
    designStyle: 'retro',
    preset: { style: 'badge', aspect: 'Square', duration: 'medium', headline: 'FRESH DROP', subhead: 'Glossy, shiny, futuristic', cta: 'Shop the drop', logoEmoji: '💿' },
  },
  {
    key: 'countdown-launch',
    name: 'Countdown Launch',
    concept: '3…2…1…GO — a hype ramp that ends with the call to action.',
    tags: ['Viral'],
    emoji: '🚀',
    palette: ['#7c3aed', '#f97316', '#fde047'],
    designStyle: 'fun',
    preset: { style: 'countdown', aspect: 'Vertical', duration: 'short', headline: 'GO!', subhead: 'Launching in seconds', cta: 'Notify me on launch', logoEmoji: '🚀' },
  },
  {
    key: 'broadcast-caption',
    name: 'Broadcast Caption',
    concept: 'A clean name + role caption for interviews, panels and podcasts.',
    tags: ['Classic'],
    emoji: '📺',
    palette: ['#164e63', '#0ea5e9', '#f8fafc'],
    designStyle: 'corporate',
    preset: { style: 'lower-third', aspect: 'Landscape', duration: 'medium', headline: 'Chief Editor', subhead: 'The Voice of NowOpen Africa', cta: '', logoEmoji: '🎙️' },
  },
  {
    key: 'soft-pastel',
    name: 'Soft Pastel',
    concept: 'Dreamy candy tones and slow, gentle motion for lifestyle drops.',
    tags: ['Trending'],
    emoji: '🍧',
    palette: ['#fbcfe8', '#c7d2fe', '#e0f2fe'],
    designStyle: 'minimal',
    preset: { style: 'logo-reveal', aspect: 'Square', duration: 'long', headline: 'SOFT HOUR', subhead: 'Calm colours, slow mornings', cta: 'Start your morning', logoEmoji: '☁️' },
  },
  {
    key: 'ember-luxury',
    name: 'Ember Luxury',
    concept: 'Charcoal, ember gold and a serif-feel title — refined and rare.',
    tags: ['New'],
    emoji: '🔥',
    palette: ['#1c1917', '#f59e0b', '#fef3c7'],
    designStyle: 'corporate',
    preset: { style: 'reveal-title', aspect: 'Landscape', duration: 'long', headline: 'GOLD STANDARD', subhead: 'Refined. Rare. Yours.', cta: 'Reserve your seat', logoEmoji: '👑' },
  },
  {
    key: 'viral-stack',
    name: 'Viral Stack',
    concept: 'One bold word at a time, stacked for the feed — made to replay.',
    tags: ['Viral'],
    emoji: '💥',
    palette: ['#db2777', '#7c3aed', '#0f172a'],
    designStyle: 'fun',
    preset: { style: 'kinetic-type', aspect: 'Vertical', duration: 'short', headline: 'Say it once', subhead: 'Make it loud', cta: 'Share the reel', logoEmoji: '💥' },
  },
  {
    key: 'led-billboard',
    name: 'LED Billboard',
    concept: 'A glowing roadside board — neon type over a scanline grid, with a scrolling marquee.',
    tags: ['Billboard', 'New'],
    emoji: '🪧',
    palette: ['#050014', '#22d3ee', '#f0abfc'],
    designStyle: 'tech',
    preset: { style: 'billboard-led', aspect: 'Landscape', duration: 'medium', headline: 'GRAND OPENING', subhead: 'Now open for business', cta: 'Come see us today', logoEmoji: '🪧' },
  },
  {
    key: 'apple-keyart',
    name: 'Apple Key Art',
    concept: 'Apple TV standard — one elegant title, soft spotlight, generous space.',
    tags: ['Premium', 'New'],
    emoji: '🍾',
    palette: ['#0a0a0f', '#71717a', '#f4f4f5'],
    designStyle: 'minimal',
    preset: { style: 'premium-keyart', aspect: 'Landscape', duration: 'long', headline: 'THE PREMIUM DROP', subhead: 'Experience it first', cta: 'Reserve your seat', logoEmoji: '🍾' },
  },
  {
    key: 'glass-saas',
    name: 'Glass SaaS',
    concept: 'Frosted panels over soft colour — a clean, modern business card.',
    tags: ['Trending', 'New'],
    emoji: '🪟',
    palette: ['#1e1b4b', '#7c3aed', '#22d3ee'],
    designStyle: 'corporate',
    preset: { style: 'glassmorphic', aspect: 'Square', duration: 'medium', headline: 'OPEN FOR BUSINESS', subhead: 'Modern, clear, welcoming', cta: 'Visit us today', logoEmoji: '🪟' },
  },
  {
    key: 'depth-3d',
    name: 'Depth 3D',
    concept: 'Layered shapes with real parallax depth — the camera moves through the ad.',
    tags: ['3D', 'New'],
    emoji: '📐',
    palette: ['#022c22', '#10b981', '#fde047'],
    designStyle: '3d',
    preset: { style: 'isometric-3d', aspect: 'Vertical', duration: 'short', headline: 'NEW DROP', subhead: 'Depth you can feel', cta: 'Shop the drop', logoEmoji: '📐' },
  },
  {
    key: 'led-nightlife',
    name: 'LED Nightlife',
    concept: 'A neon marquee for the after-hours crowd — bolder, louder, later.',
    tags: ['Billboard', 'Trending'],
    emoji: '🌆',
    palette: ['#0f0524', '#ec4899', '#22d3ee'],
    designStyle: 'tech',
    preset: { style: 'billboard-led', aspect: 'Landscape', duration: 'short', headline: 'OPEN TILL LATE', subhead: 'The night is young', cta: 'Come on in', logoEmoji: '🌆' },
  },
  {
    key: 'cinema-3d',
    name: 'Cinema 3D',
    concept: 'Wide-screen depth for the big ad — floating panels and a grounded floor.',
    tags: ['3D', 'Cinema'],
    emoji: '🎥',
    palette: ['#111827', '#f97316', '#fef3c7'],
    designStyle: '3d',
    preset: { style: 'isometric-3d', aspect: 'Landscape', duration: 'long', headline: 'THE MAIN EVENT', subhead: 'Built for the big screen', cta: 'Get your tickets', logoEmoji: '🎥' },
  },
  {
    key: 'timeless-serif',
    name: 'Timeless Serif',
    concept: 'One elegant serif line on quiet paper — classic editorial calm.',
    tags: ['Minimal', 'Classic'],
    emoji: '🕊️',
    palette: ['#1c1917', '#a8a29e', '#fafaf9'],
    designStyle: 'minimal',
    preset: { style: 'reveal-title', aspect: 'Landscape', duration: 'long', headline: 'SIMPLY REFINED', subhead: 'The art of understatement', cta: 'Discover more', logoEmoji: '🕊️' },
  },
  {
    key: 'retro-vinyl',
    name: 'Retro Vinyl',
    concept: 'Warm 70s record sleeve — cream, burnt orange and a bold sunburst.',
    tags: ['Retro', 'Vintage'],
    emoji: '💽',
    palette: ['#1c0a00', '#ea580c', '#fde68a'],
    designStyle: 'retro',
    preset: { style: 'badge', aspect: 'Square', duration: 'medium', headline: 'RETRO NIGHTS', subhead: 'Spin it back', cta: 'Get the vinyl', logoEmoji: '💽' },
  },
  {
    key: 'corporate-blue',
    name: 'Corporate Blue',
    concept: 'Trustworthy deep-blue gradients with clean white type — boardroom ready.',
    tags: ['Corporate', 'Trusted'],
    emoji: '💼',
    palette: ['#0c2340', '#1d4ed8', '#93c5fd'],
    designStyle: 'corporate',
    preset: { style: 'motion-poster', aspect: 'Landscape', duration: 'medium', headline: 'BUILT ON TRUST', subhead: 'Enterprise-grade, human-first', cta: 'Book a demo', logoEmoji: '💼' },
  },
  {
    key: 'cyber-grid',
    name: 'Cyber Grid',
    concept: 'Holographic teal on near-black with a glowing data grid — future ready.',
    tags: ['Tech', 'Cyber'],
    emoji: '🔷',
    palette: ['#050914', '#06b6d4', '#f472b6'],
    designStyle: 'tech',
    preset: { style: 'billboard-led', aspect: 'Vertical', duration: 'short', headline: 'NEXT GEN', subhead: 'Built for what is next', cta: 'Get early access', logoEmoji: '🔷' },
  },
];

export const motionTemplateByKey = (key: string): MotionTemplate | undefined =>
  MOTION_TEMPLATES.find((t) => t.key === key);
