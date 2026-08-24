// NowOpen Studio — AI Marketing Assistant.
//
// A rule-based "co-pilot" that answers marketing questions in natural
// language using the business profile: captions, ads, campaigns, promos,
// pricing, description rewrites, hashtags and growth advice. Instant and
// offline — every reply is built from the same libs as the other Studio
// modules (copywriter, growth), and every reply can hand you off to the
// matching Studio module.

import { Business } from '../types';
import { copyForGoal, hashtagsFor, CopyGoal, COPY_GOALS } from './copywriter';
import { growthScore, healthTips, scoreLabel, GrowthPlanModule } from './growth';
import { trendRadarFor } from './trendRadar';
import { todayMission } from './missions';
import { marketingHealth } from './marketingHealth';
import { buildMorningBrief } from './morningBrief';
import { competitorInsights } from './competitorInsights';

export interface AssistantAction {
  label: string;
  module: GrowthPlanModule;
}

export interface AssistantReply {
  text: string;
  actions: AssistantAction[];
}

// --- Shared builders --------------------------------------------------------

export function suggestPromotions(): { title: string; detail: string }[] {
  return [
    { title: 'Buy one, get one free', detail: 'Pulls in pairs and clears stock fast — great for a quiet Tuesday.' },
    { title: '20% off this weekend', detail: 'The classic weekend magnet. Deadline builds urgency.' },
    { title: 'Refer a friend', detail: 'Your happiest customers bring the next ones. Reward both sides.' },
    { title: 'Loyalty stamp card', detail: 'Buy 5, get the 6th free. Turns one-off visitors into regulars.' },
    { title: 'Free delivery over a minimum', detail: 'Lifts average order size while sounding generous.' },
    { title: 'Bundle deal', detail: 'Pair two best-sellers at a combined price customers can’t ignore.' },
  ];
}

export function campaignPlan(business: Business): string {
  const name = business.name;
  const goal = 'Weekend Promotion';
  return [
    `Here is a 7-day campaign for ${name}:`,
    '',
    `• Day 1 — Announce: "We are running a ${goal} this weekend." (Marketing Department post)`,
    `• Day 2 — Tease: show what is on offer with a countdown story.`,
    `• Day 3 — Remind: WhatsApp status + SMS blast to saved customers.`,
    `• Day 4 — Open: publish the offer with a clear deadline.`,
    `• Day 5 — Proof: reshare a customer photo or review.`,
    `• Day 6 — Last call: "Ends tomorrow" urgency post.`,
    `• Day 7 — Thank you: a gratitude post keeps the goodwill rolling.`,
    '',
    'Open the Content Planner and drop these dates in so nothing slips.',
  ].join('\n');
}

export function pricingSuggestions(business: Business): string {
  const category = business.category || 'your industry';
  return [
    `For ${category}, three simple pricing rules work almost everywhere:`,
    '',
    `• Anchor high — show a premium option first; the middle one becomes the obvious pick.`,
    `• Bundle — pair fast-moving items with slow ones so both sell.`,
    `• Round for cash — prices ending in 0 or 5 feel friendlier on WhatsApp and in-store.`,
    '',
    'If you are unsure, ask 3 regular customers what they would pay — they are your best focus group.',
  ].join('\n');
}

export function rewriteDescription(business: Business): string {
  const desc = String(business.description || '').trim();
  const name = business.name;
  const category = business.category || 'business';
  const location = business.location || 'your area';
  const seed = desc || `We are a ${category} based in ${location}.`;
  return [
    `${name} — ${category} you can rely on in ${location}.`,
    '',
    seed,
    '',
    'Quality you can count on, service that makes you feel welcome, and a team that genuinely cares. Visit our NowOpen Africa profile for offers, opening hours and directions.',
  ].join('\n');
}

// --- Intent matching ---------------------------------------------------------

function detectGoal(m: string): CopyGoal {
  const has = (r: RegExp) => r.test(m);
  if (has(/grand open|now open|opening/i)) return 'grand-opening';
  if (has(/new product|launch|arrival/i)) return 'product-launch';
  if (has(/weekend/i)) return 'weekend-promo';
  if (has(/flash/i)) return 'flash-sale';
  if (has(/hire|recruit|job|vacancy/i)) return 'hiring';
  if (has(/event|invite|happening/i)) return 'event';
  if (has(/thank|appreciate/i)) return 'thank-you';
  if (has(/anniversary|year/i)) return 'anniversary';
  if (has(/season|holiday|christmas/i)) return 'seasonal-sale';
  return 'weekend-promo';
}

export function assistantReply(business: Business, raw: string): AssistantReply {
  const m = raw.toLowerCase();
  const goal = detectGoal(m);

  if (/(caption|write a post|write for instagram|instagram caption|social post)/.test(m)) {
    const goalLabel = COPY_GOALS.find((g) => g.key === goal)?.label || goal;
    const caption = copyForGoal(business, goal, 'instagram');
    const tags = hashtagsFor(business, goal);
    return {
      text: [
        `Done — a ${goalLabel} caption for your Instagram, written from your profile:`,
        '',
        caption,
        '',
        `Hashtags: ${tags}`,
      ].join('\n'),
      actions: [
        { label: 'More copy in the AI Copywriter', module: 'copywriter' },
        { label: 'Design the matching post', module: 'social' },
      ],
    };
  }

  if (/(ad|facebook ad|instagram ad|sponsor)/.test(m)) {
    return {
      text: [
        `Here is a short ad angle for ${business.name}:`,
        '',
        `Headline: ${business.name} — ${business.category || 'quality you can trust'} in ${business.location || 'your area'}.`,
        '',
        'Body: New customers get something special this week. Tap to see what is waiting.',
        '',
        `CTA: Visit NowOpen Africa — ${business.phone ? `or call/WhatsApp ${business.phone}.` : 'one tap away.'}`,
        '',
        'Tip: ads with a square photo and a clear offer convert best. Build the visual in the Marketing Department.',
      ].join('\n'),
      actions: [
        { label: 'Design the ad visual', module: 'social' },
        { label: 'Write more ad copy', module: 'copywriter' },
      ],
    };
  }

  if (/(campaign|marketing plan|week plan|strategy)/.test(m)) {
    return {
      text: campaignPlan(business),
      actions: [
        { label: 'Schedule it in the Content Planner', module: 'planner' },
        { label: 'Design the announcement post', module: 'social' },
      ],
    };
  }

  if (/(promo|discount|offer|sale|deal|bogo|referral|loyalty)/.test(m)) {
    const promos = suggestPromotions();
    return {
      text: [
        `Here are promotion ideas that work for a ${business.category || 'small business'}:`,
        '',
        ...promos.map((p) => `• ${p.title} — ${p.detail}`),
        '',
        'Pick one, add a deadline, and turn it into a visual in seconds.',
      ].join('\n'),
      actions: [
        { label: 'Build the promo asset', module: 'promotions' },
        { label: 'Write the promo caption', module: 'copywriter' },
      ],
    };
  }

  if (/(price|pricing|charge|how much)/.test(m)) {
    return {
      text: pricingSuggestions(business),
      actions: [
        { label: 'Ask the AI Copywriter to explain your offer', module: 'copywriter' },
      ],
    };
  }

  if (/(score|health|growth|grow|rank|reach|better|performance)/.test(m)) {
    const { score, items } = growthScore(business);
    const tips = healthTips(business);
    const health11 = marketingHealth(business);
    return {
      text: [
        `Your Growth Score is ${score}/100 — ${scoreLabel(score)}.`,
        '',
        ...items.map((i) => `• ${i.label}: ${i.earned}/${i.max}`),
        '',
        health11.score !== null
          ? `Full 11-dimension score: ${health11.score}/100 (${health11.label}), from the ${health11.measuredCount} dimensions we can measure so far.`
          : 'The 11-dimension score needs at least two measurable signals — publish a post, add an offer or collect a review to start it.',
        ...(health11.weakest
          ? [`Biggest opportunity: ${health11.weakest.label} (${health11.weakest.score}/100) — ${health11.weakest.tip}`]
          : []),
        '',
        `Coach tip: ${tips[0]?.tip}`,
      ].join('\n'),
      actions: [
        { label: 'Open the Growth Score panel', module: 'health' },
        { label: 'View my weekly plan', module: 'home' },
      ],
    };
  }

  if (/(trend|radar|viral|trending|what.s hot)/.test(m)) {
    const radar = trendRadarFor(business);
    return {
      text: [
        `Trending near you (${radar.marketLabel} ${radar.flag}) for ${radar.industryLabel}:`,
        '',
        ...radar.trends.map((t) => `• ${t.emoji} ${t.topic} — opportunity ${t.score}/100. ${t.hook}`),
        '',
        `Your top play: "${radar.best.suggestedPost.slice(0, 160)}…"`,
      ].join('\n'),
      actions: [
        { label: 'Open the AI Trend Radar', module: 'analytics' },
        { label: 'Write a trend caption', module: 'copywriter' },
      ],
    };
  }

  if (/(mission|today.s task|daily task|what should i do|daily goal)/.test(m)) {
    const mission = todayMission(business);
    return {
      text: [
        `Today's mission: ${mission.emoji} ${mission.title} — ${mission.points} growth points.`,
        '',
        mission.detail,
        '',
        'Complete it from the Today’s Mission card and your points and level tick up instantly.',
      ].join('\n'),
      actions: [
        { label: "Open Today's Mission", module: 'home' },
        { label: 'See my points & level', module: 'home' },
      ],
    };
  }

  if (/(competitor|compare|who else|market|rivals)/.test(m)) {
    const insights = competitorInsights(business);
    const top = insights.gaps[0];
    return {
      text: [
        `Competitor insights (premium): you rank #${insights.rank} of 4 vs ${insights.competitors.length} local ${insights.average.categoryLabel.toLowerCase()} competitors.`,
        '',
        `Market average: ${insights.average.score}/100 · ${insights.average.followers.toLocaleString()} followers · ${insights.average.rating}★`,
        '',
        `Biggest gap: ${top.label} (competitors are ${top.gap} ahead). ${top.tip}`,
      ].join('\n'),
      actions: [
        { label: 'Open Competitor Insights', module: 'analytics' },
        { label: 'Fix my weakest dimension', module: 'health' },
      ],
    };
  }

  if (/(notification|brief|morning|weather|remind|alert)/.test(m)) {
    const brief = buildMorningBrief(business);
    return {
      text: [
        `${brief.greeting}, here is your brief for today (${brief.weather.emoji} ${brief.weather.condition}, ${brief.weather.tempC}°C):`,
        '',
        `• Status: ${brief.statusEmoji} ${brief.statusLabel}`,
        `• ${brief.highlight}`,
        ...brief.notifications.slice(0, 3).map((n) => `• ${n.emoji} ${n.title}`),
        '',
        `You have ${brief.notifications.length} notices waiting in the AI Notifications centre.`,
      ].join('\n'),
      actions: [
        { label: 'Open AI Notifications', module: 'analytics' },
        { label: 'Check my status', module: 'card' },
      ],
    };
  }

  if (/(rewrite|improve|description|about us|bio)/.test(m)) {
    return {
      text: ['Here is a stronger description for your profile:', '', rewriteDescription(business)].join('\n'),
      actions: [
        { label: 'Keep refining in the AI Copywriter', module: 'copywriter' },
      ],
    };
  }

  if (/(hashtag|tags)/.test(m)) {
    return {
      text: [
        `Hashtags for your ${goal === 'weekend-promo' ? 'next' : ''} post:`,
        '',
        hashtagsFor(business, goal),
        '',
        'Mix 3-5 popular + 3-5 local tags. Keep them relevant — that is what actually gets you seen.',
      ].join('\n'),
      actions: [
        { label: 'Write the full caption', module: 'copywriter' },
      ],
    };
  }

  if (/(review|rating|reputation|feedback)/.test(m)) {
    return {
      text: [
        'Ratings are your #1 trust signal. Here is a gentle ask you can send to happy customers:',
        '',
        `“Hi! It's ${business.name} — thanks for choosing us. If you have a moment, a quick review means the world to a small business. Just search us on NowOpen Africa and tap the star.”`,
        '',
        'Tip: send this within an hour of the visit, while the good feeling is fresh.',
      ].join('\n'),
      actions: [
        { label: 'See all growth tips', module: 'health' },
      ],
    };
  }

  if (/(email|sms|broadcast|message my customers)/.test(m)) {
    return {
      text: [
        `Here is a short SMS you can send to saved customers:`,
        '',
        copyForGoal(business, goal, 'sms'),
        '',
        'Send it from your phone, or build the full WhatsApp/email version in the AI Copywriter.',
      ].join('\n'),
      actions: [
        { label: 'Full email + SMS versions', module: 'copywriter' },
      ],
    };
  }

  if (/(hours|open now|closing)/.test(m)) {
    return {
      text: business.hours
        ? `Your current hours: ${business.hours}. Keep them up to date in your card so customers always see the right times.`
        : 'You have not set opening hours yet — add them so customers know when to come.',
      actions: [{ label: 'Update hours in my card', module: 'card' }],
    };
  }

  if (/^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(m)) {
    return {
      text: [
        `Hey! I am your marketing assistant for ${business.name}.`,
        '',
        'Ask me anything like:',
        '• “Write an Instagram caption for a weekend offer”',
        '• “Plan me a 7-day campaign”',
        '• “What promotions should I run?”',
        '• “How do I improve my growth score?”',
        '• “Rewrite my description”',
      ].join('\n'),
      actions: [
        { label: 'Write a caption', module: 'copywriter' },
        { label: 'Promo ideas', module: 'promotions' },
        { label: 'Check my growth score', module: 'health' },
      ],
    };
  }

  return {
    text: [
      `I can help you market ${business.name} — captions, ads, campaigns, promos, pricing, hashtags and growth advice.`,
      '',
      'Try:',
      '• “Write a caption for my new product”',
      '• “Run a promo this weekend?”',
      '• “Plan a campaign”',
      '• “Improve my description”',
      '• “What is my growth score?”',
    ].join('\n'),
    actions: [
      { label: 'Write a caption', module: 'copywriter' },
      { label: 'Promo ideas', module: 'promotions' },
      { label: 'Check my growth score', module: 'health' },
    ],
  };
}
