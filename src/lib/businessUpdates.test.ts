import { describe, it, expect } from 'vitest';

import {
  UPDATE_TYPES, UPDATE_TOPIC, PUBLISHER_ROLES, UPDATE_LIFETIME_MS, MAX_MEDIA, SIGNED_URL_MAX_TTL_S,
  MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_MS, classifyMediaFile, updateMediaPath, ownerGroup, updateTimeLabel,
  postedAgoLabel, isInAppPath, rankHappening,
  deriveUpdateState, validateUpdateDraft, signedUrlTtlSeconds, updateShareLink,
  type UpdateDraftInput, type UpdateLifecycleRow,
} from './businessUpdates';
import { ALL_TOPICS } from './keeps';

const T = new Date('2026-11-01T10:00:00.000Z');
const at = (ms: number) => new Date(T.getTime() + ms);
const HOUR = 3_600_000;

const live = (over: Partial<UpdateLifecycleRow> = {}): UpdateLifecycleRow => ({
  published_at: T.toISOString(),
  expires_at: at(UPDATE_LIFETIME_MS).toISOString(),
  ended_at: null,
  moderation_status: 'ok',
  ...over,
});

describe('deriveUpdateState', () => {
  it('is active from the moment it goes live', () => {
    expect(deriveUpdateState(live(), T)).toBe('active');
  });
  it('is still active one millisecond before 24h', () => {
    expect(deriveUpdateState(live(), at(UPDATE_LIFETIME_MS - 1))).toBe('active');
  });
  it('ended at exactly 24h', () => {
    expect(deriveUpdateState(live(), at(UPDATE_LIFETIME_MS))).toBe('ended');
  });
  it('is scheduled before its time', () => {
    expect(deriveUpdateState(live(), at(-1))).toBe('scheduled');
  });
  it('is a draft with no publish time', () => {
    expect(deriveUpdateState(live({ published_at: null, expires_at: null }), T)).toBe('draft');
  });
  it('is ended once ended early', () => {
    expect(deriveUpdateState(live({ ended_at: at(HOUR).toISOString() }), at(2 * HOUR))).toBe('ended');
  });
  it('is hidden even inside its window', () => {
    expect(deriveUpdateState(live({ moderation_status: 'hidden' }), at(HOUR))).toBe('hidden');
  });
});

const draft = (over: Partial<UpdateDraftInput> = {}): UpdateDraftInput => ({
  type: 'announcement',
  title: '',
  body: 'Closed Monday for the holiday',
  mediaCount: 0,
  offerId: null,
  ctaLabel: null,
  ctaUrl: null,
  publishAt: null,
  ...over,
});

describe('validateUpdateDraft', () => {
  it('accepts a text-only announcement', () => {
    expect(validateUpdateDraft(draft(), T)).toEqual([]);
  });
  it('needs text, a photo or a video', () => {
    expect(validateUpdateDraft(draft({ body: '' }), T)).toContain('Add some text, a photo or a video.');
  });
  it('accepts media with no text', () => {
    expect(validateUpdateDraft(draft({ body: '', mediaCount: 1 }), T)).toEqual([]);
  });
  it('limits the title to 80 characters', () => {
    expect(validateUpdateDraft(draft({ title: 'x'.repeat(81) }), T)).toContain('Title can be up to 80 characters.');
  });
  it('limits the text to 500 characters', () => {
    expect(validateUpdateDraft(draft({ body: 'x'.repeat(501) }), T)).toContain('Text can be up to 500 characters.');
  });
  it('limits media to 10', () => {
    expect(validateUpdateDraft(draft({ mediaCount: 11 }), T)).toContain('Up to 10 photos or videos.');
  });
  it('needs an offer for an offer update', () => {
    expect(validateUpdateDraft(draft({ type: 'offer' }), T)).toContain('Choose the offer this update is about.');
    expect(validateUpdateDraft(draft({ type: 'offer', offerId: 'o1' }), T)).toEqual([]);
  });
  it('allows only https:// or internal links', () => {
    const msg = 'Links must start with https:// or /.';
    expect(validateUpdateDraft(draft({ ctaLabel: 'Go', ctaUrl: 'javascript:x' }), T)).toContain(msg);
    expect(validateUpdateDraft(draft({ ctaLabel: 'Go', ctaUrl: 'http://x' }), T)).toContain(msg);
    expect(validateUpdateDraft(draft({ ctaLabel: 'Go', ctaUrl: '/abc' }), T)).toEqual([]);
    expect(validateUpdateDraft(draft({ ctaLabel: 'Go', ctaUrl: 'https://x.y' }), T)).toEqual([]);
  });
  it('limits the button label to 30 characters', () => {
    expect(validateUpdateDraft(draft({ ctaLabel: 'x'.repeat(31), ctaUrl: '/a' }), T))
      .toContain('Button text can be up to 30 characters.');
  });
  it('schedules up to 14 days ahead', () => {
    expect(validateUpdateDraft(draft({ publishAt: at(14 * 24 * HOUR + 60_000) }), T)).toContain('Schedule up to 14 days ahead.');
    expect(validateUpdateDraft(draft({ publishAt: at(14 * 24 * HOUR) }), T)).toEqual([]);
  });
  it('refuses a time that has passed, beyond five minutes of clock skew', () => {
    expect(validateUpdateDraft(draft({ publishAt: at(-6 * 60_000) }), T)).toContain('That time has already passed.');
    expect(validateUpdateDraft(draft({ publishAt: at(-4 * 60_000) }), T)).toEqual([]);
  });
});

describe('signedUrlTtlSeconds', () => {
  it('caps at ten minutes', () => {
    expect(signedUrlTtlSeconds(at(2 * HOUR).toISOString(), T)).toBe(SIGNED_URL_MAX_TTL_S);
    expect(SIGNED_URL_MAX_TTL_S).toBe(600);
  });
  it('never outlives the update', () => {
    expect(signedUrlTtlSeconds(at(59_400).toISOString(), T)).toBe(59);
  });
  it('is zero once over', () => {
    expect(signedUrlTtlSeconds(at(-1).toISOString(), T)).toBe(0);
  });
});

describe('types, topics and roles', () => {
  it('maps every type to a real keep topic', () => {
    expect(UPDATE_TYPES.map((t) => t.key).sort()).toEqual(Object.keys(UPDATE_TOPIC).sort());
    for (const topic of Object.values(UPDATE_TOPIC)) expect(ALL_TOPICS).toContain(topic);
    expect(UPDATE_TOPIC.offer).toBe('promotions');
    expect(UPDATE_TOPIC.new_service).toBe('products');
    expect(UPDATE_TOPIC.event).toBe('events');
    expect(UPDATE_TOPIC.recent_work).toBe('announcements');
  });
  it('lets the content roles publish', () => {
    expect([...PUBLISHER_ROLES]).toEqual(['manager', 'marketing', 'content_editor']);
    expect(MAX_MEDIA).toBe(10);
  });
  it('shares a link that opens the update on the profile', () => {
    expect(updateShareLink('mama-put', 'abc')).toBe('/mama-put?update=abc');
  });
});

describe('classifyMediaFile', () => {
  const MB = 1024 * 1024;
  it('accepts the photo and video types the bucket allows', () => {
    expect(classifyMediaFile({ type: 'image/jpeg', size: MB })).toEqual({ kind: 'image' });
    expect(classifyMediaFile({ type: 'image/webp', size: MB })).toEqual({ kind: 'image' });
    expect(classifyMediaFile({ type: 'video/mp4', size: MB, durationMs: 1000 })).toEqual({ kind: 'video' });
  });
  it('refuses other types', () => {
    expect(classifyMediaFile({ type: 'image/heic', size: MB })).toEqual({ error: 'Choose a photo or a video.' });
    expect(classifyMediaFile({ type: 'application/pdf', size: MB })).toEqual({ error: 'Choose a photo or a video.' });
  });
  it('limits photos to 10 MB', () => {
    expect(classifyMediaFile({ type: 'image/png', size: MAX_IMAGE_BYTES })).toEqual({ kind: 'image' });
    expect(classifyMediaFile({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 }))
      .toEqual({ error: 'That photo is over 10 MB. Try a smaller one.' });
  });
  it('limits videos to 50 MB and 60 seconds', () => {
    expect(classifyMediaFile({ type: 'video/webm', size: MAX_VIDEO_BYTES + 1, durationMs: 1000 }))
      .toEqual({ error: 'That video is over 50 MB. Try a shorter clip.' });
    expect(classifyMediaFile({ type: 'video/mp4', size: MB, durationMs: MAX_VIDEO_MS })).toEqual({ kind: 'video' });
    expect(classifyMediaFile({ type: 'video/mp4', size: MB, durationMs: MAX_VIDEO_MS + 1 }))
      .toEqual({ error: 'Videos can be up to 60 seconds.' });
  });
});

describe('updateMediaPath', () => {
  it('builds <business>/<update>/<file>.<ext>', () => {
    expect(updateMediaPath('b1', 'u1', 'f1', 'JPG')).toBe('b1/u1/f1.jpg');
  });
  it('never lets the extension add a folder', () => {
    expect(updateMediaPath('b1', 'u1', 'f1', 'we/ird')).toBe('b1/u1/f1.bin');
  });
});

describe('ownerGroup', () => {
  it('sorts each state into a dashboard tab', () => {
    expect(ownerGroup('active')).toBe('active');
    expect(ownerGroup('draft')).toBe('upcoming');
    expect(ownerGroup('scheduled')).toBe('upcoming');
    expect(ownerGroup('ended')).toBe('archive');
    expect(ownerGroup('hidden')).toBe('archive');
  });
});

describe('updateTimeLabel', () => {
  // Local wall-clock dates, so the test reads the same in every time zone.
  const now = new Date(2026, 10, 1, 9, 0);
  const row = (published: Date | null, over: Partial<UpdateLifecycleRow> = {}): UpdateLifecycleRow => ({
    published_at: published ? published.toISOString() : null,
    expires_at: published ? new Date(published.getTime() + UPDATE_LIFETIME_MS).toISOString() : null,
    ended_at: null,
    moderation_status: 'ok',
    ...over,
  });
  it('says when a live update ends', () => {
    expect(updateTimeLabel(row(new Date(2026, 9, 31, 18, 40)), now)).toBe('Ends 6:40 pm');
    expect(updateTimeLabel(row(new Date(2026, 10, 1, 8, 5)), now)).toBe('Ends tomorrow 8:05 am');
  });
  it('says when a scheduled update goes live', () => {
    expect(updateTimeLabel(row(new Date(2026, 10, 1, 12, 0)), now)).toBe('Goes live 12:00 pm');
    expect(updateTimeLabel(row(new Date(2026, 10, 2, 9, 0)), now)).toBe('Goes live tomorrow 9:00 am');
    expect(updateTimeLabel(row(new Date(2026, 10, 5, 0, 30)), now)).toBe('Goes live 5 Nov 2026, 12:30 am');
  });
  it('names drafts, ended and hidden updates', () => {
    expect(updateTimeLabel(row(null), now)).toBe('Draft');
    expect(updateTimeLabel(row(new Date(2026, 9, 30, 8, 0)), now)).toBe('Ended');
    expect(updateTimeLabel(row(new Date(2026, 10, 1, 8, 0), { moderation_status: 'hidden' }), now)).toBe('Hidden by NowOpen');
  });
});

describe('classifyMediaFile, fix pass', () => {
  it('refuses a video whose length cannot be read, rather than letting it through uncapped', () => {
    expect(classifyMediaFile({ type: 'video/webm', size: 1024, durationMs: null }))
      .toEqual({ error: "We couldn't read this video's length. Try an MP4 from your phone's camera." });
  });
});

describe('postedAgoLabel', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  it('reads naturally at each scale', () => {
    expect(postedAgoLabel(ago(59_000), now)).toBe('Just now');
    expect(postedAgoLabel(ago(60_000), now)).toBe('1 min ago');
    expect(postedAgoLabel(ago(59 * 60_000), now)).toBe('59 min ago');
    expect(postedAgoLabel(ago(3_600_000), now)).toBe('1h ago');
    expect(postedAgoLabel(ago(23 * 3_600_000 + 59 * 60_000), now)).toBe('23h ago');
    expect(postedAgoLabel(ago(24 * 3_600_000), now)).toBe('1 day ago');
  });
  it('never says a negative time for a clock running behind', () => {
    expect(postedAgoLabel(ago(-30_000), now)).toBe('Just now');
  });
});

describe('button links, fix pass', () => {
  it('refuses protocol-relative and backslash links that would leave NowOpen', () => {
    const base = { type: 'announcement' as const, title: '', body: 'x', mediaCount: 0, offerId: null, ctaLabel: 'Go', publishAt: null };
    const msg = 'Links must start with https:// or /.';
    expect(validateUpdateDraft({ ...base, ctaUrl: '//evil.example' })).toContain(msg);
    expect(validateUpdateDraft({ ...base, ctaUrl: '/\\evil.example' })).toContain(msg);
    expect(validateUpdateDraft({ ...base, ctaUrl: '/menu' })).toEqual([]);
  });

  it('knows an in-app path from anything else', () => {
    expect(isInAppPath('/menu?tab=x')).toBe(true);
    expect(isInAppPath('//evil.example')).toBe(false);
    expect(isInAppPath('/\\evil.example')).toBe(false);
    expect(isInAppPath('https://x.y')).toBe(false);
  });
});

describe('rankHappening', () => {
  const now = new Date('2026-11-15T12:30:00.000Z');
  const it_ = (id: string, minsAgo: number, over: { location?: string; category?: string } = {}) => ({
    id,
    update: { published_at: new Date(now.getTime() - minsAgo * 60_000).toISOString() },
    business: { id: `b-${id}`, location: over.location ?? 'Abuja', category: over.category ?? 'Salon' },
  });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  const ctx = (kept: string[] = [], place = '', category = '') => ({ keptIds: new Set(kept), place, category });

  it('is newest first when nothing else applies', () => {
    expect(ids(rankHappening([it_('old', 50), it_('new', 5)], ctx(), now))).toEqual(['new', 'old']);
  });

  it('puts kept businesses first within the same hour', () => {
    // 12:25 and 12:05 are the same clock hour.
    expect(ids(rankHappening([it_('stranger', 5), it_('kept', 25)], ctx(['b-kept']), now))).toEqual(['kept', 'stranger']);
  });

  it('never lifts a kept update above a newer hour', () => {
    expect(ids(rankHappening([it_('fresh', 10), it_('kept', 120)], ctx(['b-kept']), now))).toEqual(['fresh', 'kept']);
  });

  it('prefers the place, then the category, typed by the visitor', () => {
    const items = [it_('none', 1), it_('cat', 2, { category: 'Bakery' }), it_('place', 3, { location: 'Lekki, Lagos' })];
    expect(ids(rankHappening(items, ctx([], 'lekki', 'Bakery'), now))).toEqual(['place', 'cat', 'none']);
  });

  it('does not change the order of the items it was given', () => {
    const items = [it_('a', 50), it_('b', 5)];
    rankHappening(items, ctx(), now);
    expect(ids(items)).toEqual(['a', 'b']);
  });
});

