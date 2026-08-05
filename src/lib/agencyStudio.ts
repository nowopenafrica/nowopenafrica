// NowOpen Studio — Creative Agency Mode ("AI Creative Director").
//
// Turns a one-line, conversational brief into a full campaign plan the way a
// hired agency would: read the brief, pick the goal / platform / format, check
// what brand assets the business already has, build a 7-day content calendar,
// generate hooks, a storyboard and a predicted performance score — and when the
// brief matches a season (Black Friday, Christmas…) hand back the full campaign
// pack (email, SMS, landing page). Everything is deterministic (seeded by the
// business + brief) and pure enough to unit-test.

import { Business } from '../types';
import {
  VideoGoal, VideoFormat, VideoCreatorInput, VideoProject, VideoIndustry,
  CampaignOccasion, CampaignPlan, CreatorType,
  industryKeyForCategory, industryByKey, goalByKey, formatByKey,
  hooksFor, generateVideoProject, buildCampaign, CAMPAIGN_OCCASIONS,
  projectPackText,
} from './videoCreator';

// --- Platforms ---------------------------------------------------------------

export type CampaignPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'whatsapp' | 'google';

export interface PlatformRule {
  platform: CampaignPlatform;
  label: string;
  emoji: string;
  bestTimes: string;
  hashtags: string[];
  tips: string[];
}

export const PLATFORM_RULES: Record<CampaignPlatform, PlatformRule> = {
  instagram: {
    platform: 'instagram', label: 'Instagram', emoji: '📸',
    bestTimes: 'Tue–Sat · 11AM–1PM & 7–9PM',
    hashtags: ['#Reels', '#InstaDaily', '#SmallBizAfrica'],
    tips: [
      'Reels beat static — post video 4–6× a week.',
      'Put the hook in the first 2 seconds — most reels are watched without sound.',
      'Reply to comments in the first hour to push the algorithm.',
    ],
  },
  tiktok: {
    platform: 'tiktok', label: 'TikTok', emoji: '🎵',
    bestTimes: 'Mon–Fri · 6–10PM',
    hashtags: ['#TikTokAfrica', '#FYP', '#Trending'],
    tips: [
      'Ride trends fast — jump on a sound within 48 hours.',
      'Front-load the hook: the 0–3s decides the loop.',
      'Post 1–2× a day — consistency beats polish here.',
    ],
  },
  facebook: {
    platform: 'facebook', label: 'Facebook', emoji: '👍',
    bestTimes: 'Thu–Sun · 12–3PM',
    hashtags: ['#Facebook', '#LocalBusiness', '#SupportLocal'],
    tips: [
      'Groups and pages are king — post where your neighbourhood hangs out.',
      'Longer captions and links work better here than on IG.',
      'Native video with captions out-performs shares from other apps.',
    ],
  },
  youtube: {
    platform: 'youtube', label: 'YouTube', emoji: '▶️',
    bestTimes: 'Fri–Sun · 5–8PM',
    hashtags: ['#YouTube', '#Shorts', '#AfricanBusiness'],
    tips: [
      'Shorts feed discovery — keep them under 60 seconds.',
      'Title with the search phrase customers actually type.',
      'End every Short with a tap to your channel or WhatsApp.',
    ],
  },
  whatsapp: {
    platform: 'whatsapp', label: 'WhatsApp', emoji: '💬',
    bestTimes: 'Daily · 10AM–12PM & 4–6PM',
    hashtags: ['#WhatsApp', '#StatusUpdate'],
    tips: [
      'Send the reel as a status and a broadcast to saved customers.',
      'Keep it under 30 seconds — status viewers are quick.',
      'End with your number on screen so it survives a re-send.',
    ],
  },
  google: {
    platform: 'google', label: 'Google', emoji: '🔍',
    bestTimes: 'Always-on search presence',
    hashtags: ['#GoogleBusiness'],
    tips: [
      'Use the video on your Google Business profile and reply to questions.',
      'Local keywords in captions help you rank for “near me” searches.',
      'Pair it with reviews — they lift your ranking alongside the video.',
    ],
  },
};

export const platformRule = (p: CampaignPlatform): PlatformRule => PLATFORM_RULES[p];

// --- Campaign goal cards -----------------------------------------------------

export interface CampaignGoalCard {
  key: VideoGoal;
  label: string;
  emoji: string;
  desc: string;
  metric: string;
  formats: VideoFormat[];
  platforms: CampaignPlatform[];
  music: string;
  style: string;
  tone: string;
}

export const CAMPAIGN_GOAL_CARDS: CampaignGoalCard[] = [
  { key: 'sales', label: 'Drive sales', emoji: '🛍️', desc: 'Turn views into orders', metric: 'New orders', formats: ['Reel 15', 'Reel 30', 'Countdown', 'Product Spotlight'], platforms: ['instagram', 'tiktok', 'whatsapp'], music: 'afrobeats', style: 'energy', tone: 'Urgent & direct' },
  { key: 'calls', label: 'Get calls', emoji: '📞', desc: 'Fill the phone line', metric: 'Inbound calls', formats: ['Reel 15', 'Service Explainer', 'Story'], platforms: ['instagram', 'facebook', 'google'], music: 'synth', style: 'corporate', tone: 'Straight-talking' },
  { key: 'bookings', label: 'Fill bookings', emoji: '📅', desc: 'Book tables, slots and visits', metric: 'Confirmed bookings', formats: ['Reel 15', 'Service Explainer', 'Story'], platforms: ['instagram', 'facebook', 'whatsapp'], music: 'piano', style: 'minimal', tone: 'Warm & action-driven' },
  { key: 'recruit', label: 'Hire staff', emoji: '👥', desc: 'Attract the right people', metric: 'Applications', formats: ['Reel 15', 'Service Explainer'], platforms: ['facebook', 'instagram'], music: 'synth', style: 'corporate', tone: 'Welcoming & credible' },
  { key: 'property', label: 'Move property', emoji: '🏠', desc: 'Sell or let listings fast', metric: 'Viewings booked', formats: ['Property Tour', 'Reel 30', 'Landscape'], platforms: ['instagram', 'youtube'], music: 'cinematic', style: 'luxury-real-estate', tone: 'Luxury & quiet' },
  { key: 'event', label: 'Fill the room', emoji: '🎉', desc: 'Sell tickets and RSVPs', metric: 'Tickets / RSVPs', formats: ['Event', 'Reel 15', 'Countdown'], platforms: ['instagram', 'tiktok'], music: 'drum', style: 'energy', tone: 'High energy' },
  { key: 'launch', label: 'Launch something', emoji: '🚀', desc: 'Debuts, drops and openings', metric: 'Sign-ups / pre-orders', formats: ['Product Spotlight', 'Reel 15', 'Reel 30'], platforms: ['instagram', 'tiktok'], music: 'pop', style: 'modern-african', tone: 'Hype & curiosity' },
  { key: 'awareness', label: 'Get discovered', emoji: '📣', desc: 'Build reach and follows', metric: 'Reach / followers', formats: ['Reel 15', 'Reel 30', 'Daily Post'], platforms: ['tiktok', 'instagram'], music: 'lofi', style: 'afrobeats', tone: 'Loose & fun' },
  { key: 'brand', label: 'Tell your story', emoji: '🏛️', desc: 'Who you are and why you exist', metric: 'Profile views', formats: ['Reel 30', 'Landscape', 'Story'], platforms: ['instagram', 'youtube'], music: 'acoustic', style: 'cinematic', tone: 'Warm & cinematic' },
];

export const goalCardByKey = (key: VideoGoal): CampaignGoalCard =>
  CAMPAIGN_GOAL_CARDS.find((g) => g.key === key) ?? CAMPAIGN_GOAL_CARDS[0];

// --- Brief parsing ------------------------------------------------------------

export interface BriefParse {
  topic: string;
  goal: VideoGoal | null;
  platform: CampaignPlatform | null;
  format: VideoFormat | null;
  duration: number | null;
  urgency: boolean;
  priceMention: boolean;
  tags: string[];
}

const GOAL_RULES: { re: RegExp; goal: VideoGoal; tag: string }[] = [
  { re: /hire|recruit|vacanc|staff|join our team|job opening/i, goal: 'recruit', tag: 'Hiring' },
  { re: /property|house|land|apartment|listing|estate|rental|flat/i, goal: 'property', tag: 'Property' },
  { re: /book|reserve|slot|table|appointment|viewing|session|seat/i, goal: 'bookings', tag: 'Bookings' },
  { re: /event|concert|party|wedding|open day|seminar|conference|birthday/i, goal: 'event', tag: 'Event' },
  { re: /launch|opening|new branch|new menu|new product|new service|new collection|new arrival|dropping|debut|grand open/i, goal: 'launch', tag: 'Launch' },
  { re: /call|phone|ring|dial|enquir/i, goal: 'calls', tag: 'Calls' },
  { re: /aware|discover|follow|get known|reach|followers/i, goal: 'awareness', tag: 'Awareness' },
  { re: /brand|story|who we are|about us|behind the scenes/i, goal: 'brand', tag: 'Brand' },
  { re: /sale|discount|offer|deal|promo|order|buy|price|pay|bogo|percent|% off|bargain/i, goal: 'sales', tag: 'Sales' },
];

const PLATFORM_KEYWORDS: { re: RegExp; platform: CampaignPlatform; tag: string }[] = [
  { re: /tiktok|tik ?tok/i, platform: 'tiktok', tag: 'TikTok' },
  { re: /instagram|reel|insta|@ig/i, platform: 'instagram', tag: 'Instagram' },
  { re: /youtube|you ?tube/i, platform: 'youtube', tag: 'YouTube' },
  { re: /whatsapp|\bwa\b/i, platform: 'whatsapp', tag: 'WhatsApp' },
  { re: /google|search|near me/i, platform: 'google', tag: 'Google' },
  { re: /facebook|\bfb\b/i, platform: 'facebook', tag: 'Facebook' },
];

const FORMAT_KEYWORDS: { re: RegExp; format: VideoFormat }[] = [
  { re: /\bstory\b/i, format: 'Story' },
  { re: /\bsquare\b/i, format: 'Square' },
  { re: /\blandscape\b|widescreen/i, format: 'Landscape' },
];

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'to', 'for', 'with', 'of', 'in', 'on', 'at', 'my',
  'our', 'your', 'me', 'us', 'we', 'i', 'is', 'are', 'want', 'need', 'like',
  'make', 'create', 'get', 'do', 'can', 'could', 'please', 'pls', 'plz', 'help',
  'about', 'that', 'this', 'it', 'its', 'from', 'by', 'be', 'have', 'has', 'or',
  'so', 'them', 'they', 'their', 'am', 'been',
]);

function topicFrom(brief: string): string {
  const stripped = brief
    .replace(/tiktok|instagram|facebook|youtube|whatsapp|reel|story|status|black friday/gi, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(' ').filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  const joined = words.join(' ').slice(0, 60).trim();
  if (joined) return joined;
  const cleaned = brief.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, 60);
}

export function parseBrief(brief: string): BriefParse {
  const text = brief.trim();
  const tags: string[] = [];
  let goal: VideoGoal | null = null;
  for (const r of GOAL_RULES) {
    if (r.re.test(text)) { goal = r.goal; tags.push(r.tag); break; }
  }
  let platform: CampaignPlatform | null = null;
  for (const r of PLATFORM_KEYWORDS) {
    if (r.re.test(text)) { platform = r.platform; tags.push(r.tag); break; }
  }
  let format: VideoFormat | null = null;
  for (const r of FORMAT_KEYWORDS) {
    if (r.re.test(text)) { format = r.format; tags.push(r.format); break; }
  }
  const durations = text.match(/\b(15|20|30|45|60)\b/g);
  const duration = durations ? Number(durations[0]) : null;
  const urgency = /tonight|this weekend|weekend only|\bweekend\b|limited|ends|hurry|only|while|before it|flash|24 hours|today only|black friday|do not miss/i.test(text);
  const priceMention = /₦|ngn|price|cost|discount|% off|cheap|affordable|free/i.test(text);
  return {
    topic: topicFrom(text),
    goal,
    platform,
    format,
    duration,
    urgency,
    priceMention,
    tags,
  };
}

// --- Format helpers ------------------------------------------------------------

export function creatorForFormat(format: VideoFormat): CreatorType {
  switch (format) {
    case 'Property Tour': return 'property';
    case 'Food Commercial': return 'food';
    case 'Countdown': return 'countdown';
    case 'Event': return 'event';
    case 'Customer Review': return 'review';
    case 'Before & After': return 'before-after';
    case 'Service Explainer': return 'service';
    case 'Product Spotlight': return 'product';
    case 'Daily Post': return 'daily';
    default: return 'promote';
  }
}

function durationFormat(seconds: number, goal: VideoGoal): VideoFormat {
  if (goal === 'property') return 'Property Tour';
  if (goal === 'event') return 'Event';
  if (goal === 'launch') return 'Product Spotlight';
  if (seconds <= 12) return 'Story';
  if (seconds <= 15) return 'Reel 15';
  if (seconds <= 30) return 'Reel 30';
  return 'Landscape';
}

const GOAL_DEFAULT_FORMAT: Partial<Record<VideoGoal, VideoFormat>> = {
  property: 'Property Tour',
  event: 'Event',
  launch: 'Product Spotlight',
  recruit: 'Service Explainer',
};

const GOAL_DEFAULT_PLATFORM: Partial<Record<VideoGoal, CampaignPlatform>> = {
  recruit: 'facebook',
  event: 'instagram',
  calls: 'instagram',
  property: 'instagram',
  brand: 'instagram',
};

// --- Campaign recommendation ---------------------------------------------------

export interface AgencyRecommendation {
  goal: VideoGoal;
  goalCard: CampaignGoalCard;
  platform: CampaignPlatform;
  format: VideoFormat;
  duration: number;
  tone: string;
  music: string;
  style: string;
  postingTime: string;
  contentMix: { reels: number; stories: number; posts: number };
  budget: string;
  headline: string;
  summary: string;
  reasoning: string[];
}

const CONTENT_MIX: Record<VideoGoal, { reels: number; stories: number; posts: number }> = {
  sales: { reels: 4, stories: 2, posts: 1 },
  calls: { reels: 3, stories: 1, posts: 2 },
  bookings: { reels: 3, stories: 2, posts: 1 },
  recruit: { reels: 2, stories: 1, posts: 2 },
  property: { reels: 2, stories: 1, posts: 2 },
  event: { reels: 5, stories: 3, posts: 0 },
  launch: { reels: 4, stories: 2, posts: 1 },
  awareness: { reels: 5, stories: 2, posts: 0 },
  brand: { reels: 3, stories: 2, posts: 2 },
};

export function recommendCampaign(
  business: Pick<Business, 'name' | 'location'>,
  industry: VideoIndustry,
  parse: BriefParse,
  goal: VideoGoal,
  platform: CampaignPlatform,
  format: VideoFormat,
): AgencyRecommendation {
  const card = goalCardByKey(goal);
  const topic = parse.topic || industry.promise;
  const duration = formatByKey(format).seconds;
  const loc = business.location ? ` in ${business.location}` : '';
  const headline = `${topic.charAt(0).toUpperCase() + topic.slice(1)} at ${business.name}${loc}${parse.urgency ? ' — this weekend only' : ''}`;
  const contentMix = CONTENT_MIX[goal];
  const postingTime = platformRule(platform).bestTimes;
  const budget = platform === 'google'
    ? 'Start at ₦500–1,000/day search ads on a tight radius, then scale what converts.'
    : 'Start at ₦2,000–5,000/day local boost aimed at your radius, then scale the winners.';

  const reasoning = [
    `The brief is about “${topic}” — a specific offer converts better than a generic brand post.`,
    parse.goal
      ? `The brief mentions “${parse.tags[0] ?? card.label}”, so the campaign leads with ${card.desc.toLowerCase()}.`
      : `No explicit goal in the brief, so we default to ${card.desc.toLowerCase()} — the highest-value move for a ${industry.label}.`,
    `We recommend ${platformRule(platform).label} — that is where ${industry.label} customers scroll${loc}.`,
    `${formatByKey(format).label} (${duration}s) keeps completion high and the CTA close to the action.`,
    `Post ${contentMix.reels} reels, ${contentMix.stories} stories and ${contentMix.posts} posts a week — consistent beats perfect.`,
    parse.urgency ? 'The brief signals urgency — say “this weekend only” and end with a hard deadline.' : '',
  ].filter(Boolean);

  return {
    goal,
    goalCard: card,
    platform,
    format,
    duration,
    tone: card.tone,
    music: card.music,
    style: card.style,
    postingTime,
    contentMix,
    budget,
    headline,
    summary: `${card.label} campaign for ${business.name}: a ${duration}s ${formatByKey(format).label} led by “${topic}”, posted on ${platformRule(platform).label}, ${contentMix.reels}× a week.${parse.urgency ? ' Urgency angle on.' : ''}`,
    reasoning,
  };
}

// --- Brand assets readiness ------------------------------------------------------

export interface BrandAsset {
  key: string;
  label: string;
  emoji: string;
  present: boolean;
  hint: string;
}

export interface BrandAssetsReport {
  assets: BrandAsset[];
  present: number;
  total: number;
  readiness: number;
  verdict: string;
}

export function brandAssetsReport(business: Business): BrandAssetsReport {
  const assets: BrandAsset[] = [
    { key: 'logo', label: 'Logo', emoji: '🎨', present: Boolean(business.logo_url), hint: 'Upload your logo in Media Library — it sits on every end card and thumbnail.' },
    { key: 'cover', label: 'Cover / hero photo', emoji: '🖼️', present: Boolean(business.image_url), hint: 'Add a hero photo — reels pull the strongest visual from your profile.' },
    { key: 'copy', label: 'About / description', emoji: '✍️', present: Boolean(business.description && business.description.trim()), hint: 'Write 2–3 lines on what you do — captions are built from this.' },
    { key: 'location', label: 'Location', emoji: '📍', present: Boolean(business.location), hint: 'Add your location — every CTA becomes “visit us in Lagos”, not “visit us”.' },
    { key: 'phone', label: 'Phone / WhatsApp', emoji: '📞', present: Boolean(business.phone), hint: 'Add a phone number — the CTA then opens WhatsApp with one tap.' },
    { key: 'website', label: 'Website', emoji: '🌐', present: Boolean(business.website), hint: 'Add a website — the link-out destination for every campaign.' },
    { key: 'hours', label: 'Opening hours', emoji: '🕒', present: Boolean(business.hours), hint: 'Add opening hours — customers decide faster when they know you are open.' },
    { key: 'proof', label: 'Customer ratings', emoji: '⭐', present: Boolean(business.rating), hint: 'Collect reviews — social proof is the cheapest ad there is.' },
    { key: 'verified', label: 'Verified badge', emoji: '🛡️', present: Boolean(business.verified || business.verification_tier), hint: 'Get verified — a badge lifts trust on every profile and ad.' },
    { key: 'email', label: 'Email', emoji: '📧', present: Boolean(business.email), hint: 'Add an email — backup contact for bookings and receipts.' },
  ];
  const present = assets.filter((a) => a.present).length;
  const total = assets.length;
  const readiness = Math.round((present / total) * 100);
  const verdict = readiness >= 80
    ? 'Launch-ready — your brand has the assets a campaign needs.'
    : readiness >= 50
      ? 'Nearly there — close the gaps below and the campaign will convert harder.'
      : 'Start with the basics below — a few minutes of setup doubles your ad results.';
  return { assets, present, total, readiness, verdict };
}

// --- Content calendar ------------------------------------------------------------

export interface CalendarDay {
  day: number;
  dow: string;
  format: VideoFormat;
  platform: CampaignPlatform;
  topic: string;
  hook: string;
  action: string;
  status: 'draft' | 'scheduled' | 'publish';
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatCycle(goal: VideoGoal): VideoFormat[] {
  switch (goal) {
    case 'property': return ['Property Tour', 'Reel 15', 'Story', 'Property Tour', 'Landscape', 'Reel 30', 'Story'];
    case 'event': return ['Event', 'Reel 15', 'Story', 'Event', 'Reel 30', 'Story', 'Reel 15'];
    case 'launch': return ['Product Spotlight', 'Reel 15', 'Story', 'Product Spotlight', 'Reel 30', 'Story', 'Reel 15'];
    case 'awareness': return ['Reel 15', 'Reel 30', 'Story', 'Reel 15', 'Daily Post', 'Reel 30', 'Story'];
    default: return ['Reel 15', 'Reel 30', 'Story', 'Reel 15', 'Product Spotlight', 'Reel 30', 'Story'];
  }
}

export function contentCalendar(
  industry: VideoIndustry,
  topic: string,
  goal: VideoGoal,
  platform: CampaignPlatform,
  hooks: string[],
): CalendarDay[] {
  const cycle = formatCycle(goal);
  const ctas = goalByKey(goal).ctas;
  const base = topic.trim() || industry.promise;
  const topics = [base, ...industry.promote];
  return Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    dow: DOW[i],
    format: cycle[i % cycle.length],
    platform,
    topic: topics[i % topics.length],
    hook: hooks[i % hooks.length],
    action: ctas[i % ctas.length],
    status: i < 2 ? 'draft' : i < 5 ? 'scheduled' : 'publish',
  }));
}

// --- Season fit (full campaign generator) -----------------------------------------

const OCCASION_KEYWORDS: { key: string; re: RegExp }[] = [
  { key: 'black-friday', re: /black friday/i },
  { key: 'christmas', re: /christmas|xmas/i },
  { key: 'new-year', re: /new year|january/i },
  { key: 'ramadan', re: /ramadan|iftar/i },
  { key: 'easter', re: /easter/i },
  { key: 'independence', re: /independen|october/i },
  { key: 'valentines', re: /valentine/i },
  { key: 'back-to-school', re: /back to school|resume|school/i },
];

export function seasonFit(brief: string): CampaignOccasion | null {
  const hit = OCCASION_KEYWORDS.find((o) => o.re.test(brief));
  return hit ? CAMPAIGN_OCCASIONS.find((o) => o.key === hit.key) ?? null : null;
}

// --- Full agency plan ----------------------------------------------------------------

export interface AgencyPlan {
  brief: string;
  parse: BriefParse;
  industry: VideoIndustry;
  recommendation: AgencyRecommendation;
  assets: BrandAssetsReport;
  calendar: CalendarDay[];
  hooks: string[];
  season: { occasion: CampaignOccasion; plan: CampaignPlan } | null;
  video: VideoProject;
  input: VideoCreatorInput;
}

export function buildAgencyPlan(
  business: Business,
  brief: string,
  opts: { goal?: VideoGoal; platform?: CampaignPlatform; format?: VideoFormat } = {},
): AgencyPlan {
  const industry = industryByKey(industryKeyForCategory(business.category));
  const parse = parseBrief(brief);
  const goal = opts.goal ?? parse.goal ?? (parse.topic ? 'sales' : 'awareness');
  const platform = opts.platform ?? parse.platform ?? GOAL_DEFAULT_PLATFORM[goal] ?? 'instagram';
  const format = opts.format
    ?? parse.format
    ?? (parse.duration ? durationFormat(parse.duration, goal) : (GOAL_DEFAULT_FORMAT[goal] ?? 'Reel 30'));

  const recommendation = recommendCampaign(business, industry, parse, goal, platform, format);
  const hooks = hooksFor(business, industry, parse.topic).slice(0, 8);
  const calendar = contentCalendar(industry, parse.topic, goal, platform, hooks);
  const assets = brandAssetsReport(business);
  const occasion = seasonFit(brief);
  const season = occasion ? { occasion, plan: buildCampaign(business, industry, occasion) } : null;

  const input: VideoCreatorInput = {
    creator: creatorForFormat(format),
    industryKey: industry.key,
    goal,
    format,
    topic: parse.topic || industry.promise,
    media: 'ai',
    voiceover: 'female-nigerian',
    subtitle: 'apple',
    style: recommendation.style,
    music: recommendation.music,
    market: 'nigeria',
  };
  const video = generateVideoProject(business, input);

  return { brief, parse, industry, recommendation, assets, calendar, hooks, season, video, input };
}

// --- Agency pack ----------------------------------------------------------------

export function agencyPackText(business: Business, plan: AgencyPlan): string {
  const r = plan.recommendation;
  const lines = [
    `${r.headline.toUpperCase()}`,
    '',
    'CREATIVE AGENCY MODE — FULL CAMPAIGN PLAN',
    `Business: ${business.name}${business.location ? `, ${business.location}` : ''}`,
    `Industry: ${plan.industry.label}`,
    `Goal: ${r.goalCard.label} (metric: ${r.goalCard.metric})`,
    `Platform: ${platformRule(r.platform).label} (${r.platform})`,
    `Format: ${formatByKey(r.format).label} · ${r.duration}s · ${formatByKey(r.format).size}`,
    `Tone: ${r.tone} · Music: ${r.music} · Style: ${r.style}`,
    `Posting time: ${r.postingTime}`,
    `Weekly mix: ${r.contentMix.reels} reels · ${r.contentMix.stories} stories · ${r.contentMix.posts} posts`,
    `Budget: ${r.budget}`,
    '',
    'WHY THIS PLAN',
    ...r.reasoning,
    '',
    'BRAND ASSETS',
    `Readiness: ${plan.assets.readiness}/100 (${plan.assets.present}/${plan.assets.total} assets in place)`,
    ...plan.assets.assets.map((a) => `  ${a.present ? '[✓]' : '[ ]'} ${a.emoji} ${a.label} — ${a.hint}`),
    '',
    'HOOK BANK (pick one per post)',
    ...plan.hooks.map((h) => `  • ${h}`),
    '',
    '7-DAY CONTENT CALENDAR',
    ...plan.calendar.map((d) => (
      `Day ${d.day} (${d.dow}) · ${d.status.toUpperCase()} · ${formatByKey(d.format).label} on ${platformRule(d.platform).label}\n   Topic: ${d.topic}\n   Hook: ${d.hook}\n   CTA: ${d.action}`
    )),
  ];

  if (plan.season) {
    const s = plan.season.plan;
    lines.push(
      '',
      'SEASON CAMPAIGN',
      `Occasion: ${plan.season.occasion.label}`,
      `Theme: ${s.theme}`,
      `Email subject: ${s.emailSubject}`,
      `Email body: ${s.emailBody}`,
      `SMS: ${s.sms}`,
      `Landing headline: ${s.landingHeadline}`,
      `Landing sub: ${s.landingSub}`,
      `Best times: ${s.bestTimes}`,
      `Budget hint: ${s.budgetHint}`,
      `Hashtags: ${s.hashtags.join(' ')}`,
    );
  }

  lines.push('', 'HERO VIDEO PLAN', projectPackText(plan.video));
  return lines.join('\n');
}
