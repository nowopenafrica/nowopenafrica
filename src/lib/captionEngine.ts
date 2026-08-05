// NowOpen Studio — AI Caption Generator (industry × tone).
//
// The dedicated caption factory: for any industry profile and any of the
// Studio's tones it generates a full spread of ready-to-post captions —
// promotion, social proof, behind the scenes, educational, community and
// event angles — each with a hook and a hashtag set. Seeded per business +
// day + tone so regenerating is stable within a day.

import { Business } from '../types';
import { hashString, mulberry32, pick } from './videoCreator';
import { industryKeyForCategory, industryByKey, VideoIndustry } from './videoCreator';
import { applyTone, COPY_TONES } from './copywriter';
import { dateKey } from './businessStatus';

export interface CaptionAngle {
  key: string;
  label: string;
  emoji: string;
}

export const CAPTION_ANGLES: CaptionAngle[] = [
  { key: 'promo', label: 'Offer & promotion', emoji: '🏷️' },
  { key: 'proof', label: 'Social proof', emoji: '⭐' },
  { key: 'behind-scenes', label: 'Behind the scenes', emoji: '🎬' },
  { key: 'educational', label: 'Educational tip', emoji: '💡' },
  { key: 'community', label: 'Community & welcome', emoji: '💛' },
  { key: 'event', label: 'Event & invite', emoji: '📅' },
];

export interface CaptionOption {
  angle: string;
  title: string;
  hook: string;
  text: string;
  hashtags: string;
}

function makeAngle(
  business: Business,
  industry: VideoIndustry,
  angle: string,
  toneKey: string,
  rng: () => number,
): CaptionOption {
  const name = business.name;
  const category = industry.label;
  const location = business.location || 'your area';
  const focus = pick(rng, industry.promote);
  const hook = pick(rng, industry.hooks);
  const closeup = industry.closeup;
  const promise = industry.promise;
  const tagline = business.description ? business.description.split('.')[0].slice(0, 80) : `${category} you can rely on`;

  let title = '';
  let text = '';

  switch (angle) {
    case 'promo':
      title = `Today's ${focus}`;
      text = `${hook}\n\nRight now: ${focus} at ${name}.\n\n${promise}. Message us on WhatsApp to grab it before it is gone.\n\nTag a friend who needs this.`;
      break;
    case 'proof':
      title = 'What customers say';
      text = `${hook}\n\n"${focus} never disappoints."\n\n${closeup} — real work, real care. That is why customers rate ${name} ${business.rating || 5}/5 in ${location}.\n\nCome see for yourself.`;
      break;
    case 'behind-scenes':
      title = 'Inside the shop';
      text = `${hook}\n\nPeek behind the scenes at ${name}: ${closeup}.\n\n${promise}. Follow along for the everyday moments.`;
      break;
    case 'educational':
      title = 'A useful tip';
      text = `${hook}\n\nQuick tip about ${focus.toLowerCase()}: ${promise}.\n\nSave this post so you do not lose it.`;
      break;
    case 'community':
      title = 'Welcome to the family';
      text = `${hook}\n\n${tagline}.\n\nNew here? We are ${name}, a ${category} in ${location}. Follow along, say hello in the comments and let us know what you want to see next.`;
      break;
    case 'event':
      title = 'You are invited';
      text = `${hook}\n\nSomething special is coming to ${name}: ${focus}.\n\n${promise}. Save the date and invite your crew.`;
      break;
  }

  const hashtags = [
    ...industry.hashtags.slice(0, 3),
    `#${name.replace(/[^a-zA-Z0-9]/g, '')}`,
    `#${category.replace(/[^a-zA-Z0-9]/g, '')}`,
    '#NowOpenAfrica',
  ].filter((h) => h.length > 1);

  return {
    angle,
    title,
    hook,
    text: applyTone(text, toneKey),
    hashtags: hashtags.join(' '),
  };
}

export function generateCaptions(
  business: Business,
  opts?: { industryKey?: string; tone?: string; count?: number; now?: Date },
): CaptionOption[] {
  const now = opts?.now || new Date();
  const industryKey = opts?.industryKey || industryKeyForCategory(business.category);
  const industry = industryByKey(industryKey);
  const toneKey = opts?.tone || '';
  const count = opts?.count || CAPTION_ANGLES.length;

  const angles = [...CAPTION_ANGLES].slice(0, Math.min(count, CAPTION_ANGLES.length));
  return angles.map((a) => {
    const rng = mulberry32(hashString(`${business.id}:${dateKey(now)}:${industryKey}:${toneKey || 'neutral'}:${a.key}`));
    return makeAngle(business, industry, a.key, toneKey, rng);
  });
}

export function toneOptions(): { key: string; label: string }[] {
  return [{ key: '', label: 'Neutral' }, ...COPY_TONES.map((t) => ({ key: t.key, label: t.label }))];
}
