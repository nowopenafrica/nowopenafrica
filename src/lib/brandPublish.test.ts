import { describe, expect, it } from 'vitest';
import { backoffMinutes, classifyGraphError, facebookRequest, formatProblem, formatsFor, isDue, looksLikeOurPost, MAX_PUBLISH_ATTEMPTS, providerForChannel, type DueInput } from './brandPublish';

const now = new Date('2026-11-15T12:05:00Z');
const base: DueInput = {
  plannedAt: '2026-11-15T12:00:00Z', now, graceMinutes: 120, contentStatus: 'approved', approvedBy: 'u1',
  dispatchStatus: 'pending', attempts: 0, nextAttemptAt: null, lastError: null,
};

describe('isDue', () => {
  it('publishes an approved post whose time has just passed', () => {
    expect(isDue(base)).toEqual({ due: true });
  });
  it('also publishes the direct channel of a post whose Zoho channels were handed over', () => {
    expect(isDue({ ...base, contentStatus: 'sent' }).due).toBe(true);
  });
  it('never publishes without approval or an approver', () => {
    for (const s of ['draft', 'in_review', 'rejected', 'cancelled', 'failed', 'sending']) {
      expect(isDue({ ...base, contentStatus: s })).toEqual({ due: false, reason: 'not_approved' });
    }
    expect(isDue({ ...base, approvedBy: null })).toEqual({ due: false, reason: 'not_approved' });
  });
  it('waits for the planned time and refuses a stale post', () => {
    expect(isDue({ ...base, plannedAt: '2026-11-15T12:30:00Z' })).toEqual({ due: false, reason: 'not_yet' });
    expect(isDue({ ...base, plannedAt: '2026-11-15T09:00:00Z' })).toEqual({ due: false, reason: 'too_late' });
    expect(isDue({ ...base, plannedAt: null })).toEqual({ due: false, reason: 'no_time' });
  });
  it('never touches a channel that is done, in flight or uncertain', () => {
    expect(isDue({ ...base, dispatchStatus: 'sent' }).due).toBe(false);
    expect(isDue({ ...base, dispatchStatus: 'sending' }).due).toBe(false);
    expect(isDue({ ...base, dispatchStatus: 'failed', lastError: 'UNCERTAIN: timeout', nextAttemptAt: '2026-11-15T12:00:00Z' })).toEqual({ due: false, reason: 'uncertain' });
  });
  it('retries only when a retry was scheduled, and only after it is due', () => {
    expect(isDue({ ...base, dispatchStatus: 'failed', attempts: 1, nextAttemptAt: null })).toEqual({ due: false, reason: 'gave_up' });
    expect(isDue({ ...base, dispatchStatus: 'failed', attempts: 1, nextAttemptAt: '2026-11-15T12:10:00Z' })).toEqual({ due: false, reason: 'backing_off' });
    expect(isDue({ ...base, dispatchStatus: 'failed', attempts: 1, nextAttemptAt: '2026-11-15T12:04:00Z' }).due).toBe(true);
    expect(isDue({ ...base, dispatchStatus: 'failed', attempts: MAX_PUBLISH_ATTEMPTS, nextAttemptAt: '2026-11-15T12:04:00Z' })).toEqual({ due: false, reason: 'gave_up' });
  });
});

describe('facebookRequest', () => {
  it('text post: link in the field and in the text', () => {
    const r = facebookRequest('Hello', 'https://www.nowopenafrica.com/?utm_source=facebook', null, null);
    expect(r.edge).toBe('feed');
    expect(r.params.link).toBe('https://www.nowopenafrica.com/?utm_source=facebook');
    expect(r.params.message).toBe('Hello\n\nhttps://www.nowopenafrica.com/?utm_source=facebook');
    expect(r.params.published).toBe('true');
  });
  it('does not paste the link twice', () => {
    expect(facebookRequest('See https://x.test/a', 'https://x.test/a', null, null).params.message).toBe('See https://x.test/a');
  });
  it('image and video go to their own edges', () => {
    expect(facebookRequest('Hi', null, 'https://cdn/a.jpg', 'image')).toEqual({ edge: 'photos', params: { url: 'https://cdn/a.jpg', caption: 'Hi', published: 'true' } });
    expect(facebookRequest('Hi', null, 'https://cdn/a.mp4', 'video').edge).toBe('videos');
  });
  it('can make an unpublished test post', () => {
    expect(facebookRequest('test', null, null, null, false).params.published).toBe('false');
  });
});

describe('classifyGraphError', () => {
  it('a dead token or missing permission means reconnect', () => {
    expect(classifyGraphError(400, { code: 190 })).toBe('auth');
    expect(classifyGraphError(400, { code: 10 })).toBe('auth');
    expect(classifyGraphError(403, {})).toBe('auth');
  });
  it('rate limits and outages are retried', () => {
    expect(classifyGraphError(400, { code: 4 })).toBe('retry');
    expect(classifyGraphError(400, { code: 32 })).toBe('retry');
    expect(classifyGraphError(500, {})).toBe('retry');
    expect(classifyGraphError(400, { code: 100, is_transient: true })).toBe('retry');
    expect(classifyGraphError(0, null)).toBe('retry');
  });
  it('a refused post is not retried', () => {
    expect(classifyGraphError(400, { code: 100 })).toBe('permanent');
    expect(classifyGraphError(400, { code: 506 })).toBe('permanent');
  });
  it('backs off 5, 20, 80 minutes', () => {
    expect([1, 2, 3].map(backoffMinutes)).toEqual([5, 20, 80]);
  });
});

describe('formatProblem', () => {
  const img = 'https://cdn/a.jpg', img2 = 'https://cdn/b.png', vid = 'https://cdn/a.mp4';
  it('lists formats per channel; others only post', () => {
    expect(formatsFor('instagram')).toEqual(['post', 'carousel', 'reel', 'story']);
    expect(formatsFor('linkedin_company')).toEqual(['post']);
    expect(formatProblem('x', 'reel', [vid])).toMatch(/cannot take a reel/);
  });
  it('reels need exactly one video', () => {
    expect(formatProblem('instagram', 'reel', [vid])).toBeNull();
    expect(formatProblem('facebook', 'reel', [img])).toMatch(/one video/);
    expect(formatProblem('instagram', 'reel', [vid, vid])).toMatch(/one video/);
  });
  it('stories need exactly one image or video', () => {
    expect(formatProblem('instagram', 'story', [img])).toBeNull();
    expect(formatProblem('facebook', 'story', [vid])).toBeNull();
    expect(formatProblem('facebook', 'story', [])).toMatch(/exactly one/);
  });
  it('carousels need 2 to 10 items', () => {
    expect(formatProblem('instagram', 'carousel', [img, img2])).toBeNull();
    expect(formatProblem('instagram', 'carousel', [img])).toMatch(/2 to 10/);
    expect(formatProblem('instagram', 'carousel', Array(11).fill(img))).toMatch(/2 to 10/);
  });
  it('an Instagram post needs an image; a Facebook post can be text', () => {
    expect(formatProblem('instagram', 'post', [])).toMatch(/needs one image/);
    expect(formatProblem('instagram', 'post', [vid])).toMatch(/Use Reel/);
    expect(formatProblem('facebook', 'post', [])).toBeNull();
    expect(formatProblem('facebook', 'post', [img, img2])).toMatch(/Use Carousel/);
  });
  it('TikTok and YouTube need one video; X and LinkedIn take text or one image', () => {
    expect(formatProblem('tiktok', 'reel', [vid])).toBeNull();
    expect(formatProblem('tiktok', 'post', [vid])).toMatch(/cannot take a post/);
    expect(formatProblem('tiktok', 'reel', [img])).toMatch(/one video/);
    expect(formatProblem('youtube', 'reel', [vid])).toBeNull();
    expect(formatProblem('youtube', 'post', [vid])).toBeNull();
    expect(formatProblem('youtube', 'post', [img])).toMatch(/one video file/);
    expect(formatProblem('x', 'post', [])).toBeNull();
    expect(formatProblem('x', 'post', [img])).toBeNull();
    expect(formatProblem('linkedin_company', 'post', [vid])).toMatch(/through Zoho/);
  });
  it('maps channels to the account they publish with', () => {
    expect(providerForChannel('linkedin_company')).toBe('linkedin');
    expect(providerForChannel('linkedin_profile')).toBe('linkedin');
    expect(providerForChannel('youtube')).toBe('youtube');
    expect(providerForChannel('facebook')).toBeNull();
  });
  it('refuses links that are not media files', () => {
    expect(formatProblem('facebook', 'story', ['https://cdn/page.html'])).toMatch(/not a recognised/);
  });
});

describe('looksLikeOurPost', () => {
  const ours = 'Hungry at 9pm? Need a pharmacy on a Sunday? NowOpen Africa has an Open now page. #NowOpenAfrica';
  it('recognises our post even with a link appended', () => {
    expect(looksLikeOurPost(ours, `${ours}\n\nhttps://www.nowopenafrica.com/?utm_source=facebook`)).toBe(true);
  });
  it('does not confuse a different post on the same theme', () => {
    expect(looksLikeOurPost(ours, 'Looking for something close by? Tap Use my location on NowOpen Africa. #NowOpenAfrica')).toBe(false);
    expect(looksLikeOurPost(ours, '')).toBe(false);
  });
});
