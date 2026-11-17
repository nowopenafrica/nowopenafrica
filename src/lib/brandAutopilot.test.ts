import { describe, expect, it } from 'vitest';
import {
  budgetVerdict, buildSystemPrompt, buildUserPrompt, GENERATION_MAX_TOKENS, lagosMonthStartUtc,
  parseGeneration, planWeek, validateBrief,
  type AutopilotBrief, type AutopilotProfile,
} from './brandAutopilot';
import { checkVariant, isBlocked } from './brandSocial';

const profile: AutopilotProfile = {
  positioning: 'Where African businesses can be discovered.',
  products: { business: 'Discover businesses.' },
  lines: ['AFRICA is NOWOPEN.'],
  main_cta: 'Add your business',
  pillars: [{ id: 'spotlights', label: 'Business spotlights', purpose: 'Make businesses feel seen' }, { id: 'education', label: 'Education' }, { id: 'founder', label: 'Founder story' }],
  audiences: [{ id: 'owners', label: 'African business owners' }],
  objectives: ['awareness', 'registrations'],
  honesty_rules: ['No invented statistics.'],
};
const active = ['x', 'facebook', 'threads', 'instagram', 'linkedin_company'];
const brief: AutopilotBrief = {
  pillar: 'education', audience: 'owners', objective: 'awareness',
  topic: 'Why being findable online matters', channels: ['x', 'facebook'],
};

describe('validateBrief', () => {
  it('accepts a complete brief', () => {
    expect(validateBrief(brief, profile, active)).toEqual([]);
  });

  it('refuses unknown pillar, audience and objective', () => {
    const out = validateBrief({ ...brief, pillar: 'nope', audience: 'nope', objective: 'nope' }, profile, active);
    expect(out).toHaveLength(3);
  });

  it('refuses a channel that is not active, a duplicate, and too many', () => {
    expect(validateBrief({ ...brief, channels: ['x', 'pinterest'] }, profile, active).join(' ')).toMatch(/not active: pinterest/);
    expect(validateBrief({ ...brief, channels: ['x', 'x'] }, profile, active).join(' ')).toMatch(/twice/);
    expect(validateBrief({ ...brief, channels: [] }, profile, active).join(' ')).toMatch(/at least one/);
    expect(validateBrief({ ...brief, channels: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, profile, active).join(' ')).toMatch(/at most 6/);
  });

  it('refuses an empty or oversized topic and a bad date', () => {
    expect(validateBrief({ ...brief, topic: '  hi ' }, profile, active)).toHaveLength(1);
    expect(validateBrief({ ...brief, topic: 'x'.repeat(401) }, profile, active)).toHaveLength(1);
    expect(validateBrief({ ...brief, plannedAt: 'tomorrow-ish' }, profile, active)).toHaveLength(1);
  });
});

describe('prompts', () => {
  it('the system prompt carries the honesty rules and the placeholder instruction', () => {
    const s = buildSystemPrompt(profile);
    expect(s).toMatch(/State no numbers/);
    expect(s).toMatch(/the majority of/);
    expect(s).toMatch(/\[bracket placeholder\]/);
    expect(s).toMatch(/Never write "List your business"/);
    expect(s).toContain('No invented statistics.');
    expect(s).toContain('AFRICA is NOWOPEN.');
  });

  it('the user prompt names each channel with its limit and lists recent posts to avoid', () => {
    const u = buildUserPrompt(brief, profile, [
      { id: 'x', label: 'X', maxChars: 280 },
      { id: 'instagram', label: 'Instagram', maxChars: 2200, requires: 'image_or_video', linkNotClickable: true },
    ], ['An older post about opening hours']);
    expect(u).toContain('"x" (X): at most 280 characters');
    expect(u).toContain('links are not clickable');
    expect(u).toContain('needs image or video');
    expect(u).toContain('An older post about opening hours');
    expect(u).toContain('Education');
  });
});

describe('parseGeneration', () => {
  const good = JSON.stringify({
    hook: 'Can people find you?', caption: 'Master caption.', creative_brief: 'A shop front.', cta: 'Add your business',
    variants: { x: 'Short for X.', facebook: 'Longer for Facebook.', tiktok: 'Not asked for.' },
  });

  it('reads a clean answer and drops channels that were not requested', () => {
    const r = parseGeneration(good, ['x', 'facebook']);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.post.variants)).toEqual(['x', 'facebook']);
      expect(r.post.creativeBrief).toBe('A shop front.');
    }
  });

  it('reads an answer wrapped in a code fence or chatter, with braces inside strings', () => {
    const wrapped = `Here you go:\n\`\`\`json\n${JSON.stringify({ caption: 'Use {curly} braces', variants: { x: 'ok }' } })}\n\`\`\`\nHope that helps {really}.`;
    const r = parseGeneration(wrapped, ['x']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.post.variants.x).toBe('ok }');
  });

  it('refuses a missing channel rather than copying the master caption', () => {
    const r = parseGeneration(good, ['x', 'threads']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/threads/);
  });

  it('refuses prose, broken JSON, and a missing caption', () => {
    expect(parseGeneration('Sorry, I cannot help with that.', ['x']).ok).toBe(false);
    expect(parseGeneration('{"caption": "x", "variants": {', ['x']).ok).toBe(false);
    expect(parseGeneration('{"variants": {"x": "hi"}}', ['x']).ok).toBe(false);
    expect(parseGeneration('{"caption": "c", "variants": ["x"]}', ['x']).ok).toBe(false);
  });

  it('a placeholder the model was told to leave is blocked by the existing checker', () => {
    const r = parseGeneration(JSON.stringify({ caption: 'c', variants: { x: 'Meet [business name], open now. Add your business.' } }), ['x']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(isBlocked(checkVariant({ channel: 'x', caption: r.post.variants.x }))).toBe(true);
  });
});

describe('budgetVerdict', () => {
  it('refuses when switched off, even with a limit', () => {
    expect(budgetVerdict({ enabled: false, monthlyTokenLimit: 1_000_000, usedTokens: 0 }).ok).toBe(false);
  });
  it('refuses when no limit is set: unset never means unlimited', () => {
    expect(budgetVerdict({ enabled: true, monthlyTokenLimit: 0, usedTokens: 0 }).ok).toBe(false);
  });
  it('refuses when what is left could not cover one call', () => {
    const limit = 100_000;
    expect(budgetVerdict({ enabled: true, monthlyTokenLimit: limit, usedTokens: limit - GENERATION_MAX_TOKENS }).ok).toBe(false);
    expect(budgetVerdict({ enabled: true, monthlyTokenLimit: limit, usedTokens: limit + 5 }).ok).toBe(false);
  });
  it('allows a call inside the limit and reports what is left', () => {
    expect(budgetVerdict({ enabled: true, monthlyTokenLimit: 100_000, usedTokens: 40_000 })).toEqual({ ok: true, remaining: 60_000 });
  });
});

describe('lagosMonthStartUtc', () => {
  it('is midnight Lagos on the 1st, which is 23:00 UTC the day before', () => {
    expect(lagosMonthStartUtc(new Date('2026-11-15T12:00:00Z'))).toBe('2026-10-31T23:00:00.000Z');
  });
  it('uses the Lagos month, not the UTC one, in the last hour of a UTC month', () => {
    expect(lagosMonthStartUtc(new Date('2026-11-30T23:30:00Z'))).toBe('2026-11-30T23:00:00.000Z');
  });
});

describe('planWeek', () => {
  it('gives seven days, rotating pillars with no repeat back to back', () => {
    const slots = planWeek('2026-11-16', ['a', 'b', 'c'], 1);
    expect(slots).toHaveLength(7);
    expect(slots[0]).toEqual({ day: '2026-11-16', time: '08:30', local: '2026-11-16T08:30', pillar: 'a' });
    expect(slots[6].day).toBe('2026-11-22');
    for (let i = 1; i < slots.length; i++) expect(slots[i].pillar).not.toBe(slots[i - 1].pillar);
  });
  it('crosses a month end and honours posts per day, capped at the slot times', () => {
    const slots = planWeek('2026-11-28', ['a', 'b'], 9);
    expect(slots).toHaveLength(21);
    expect(slots.map((s) => s.day)).toContain('2026-12-01');
    expect(slots.slice(0, 3).map((s) => s.time)).toEqual(['08:30', '13:00', '19:00']);
  });
  it('returns nothing for a bad date or no pillars', () => {
    expect(planWeek('16/11/2026', ['a'])).toEqual([]);
    expect(planWeek('2026-11-16', [])).toEqual([]);
  });
});
