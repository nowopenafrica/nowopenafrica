import { describe, it, expect } from 'vitest';

import {
  checkVariant, countChars, findNearDuplicates, formatLagos, isBlocked, isSensitive,
  lagosDay, lagosLocalToUtc, mediaKind, postsThatDay, similarity, trackedUrl, utcToLagosLocal,
} from './brandSocial';

const codes = (c: ReturnType<typeof checkVariant>) => c.map((x) => x.code);

describe('what may never be sent', () => {
  it('blocks a caption longer than the network allows', () => {
    const c = checkVariant({ channel: 'x', caption: 'a'.repeat(281) });
    expect(codes(c)).toContain('too_long');
    expect(isBlocked(c)).toBe(true);
  });

  it('counts an X link as 23 characters, however long it is', () => {
    const long = 'https://www.nowopenafrica.com/add-business?utm_source=x&utm_medium=social&utm_campaign=nov3';
    expect(countChars('x', `Add your business ${long}`)).toBe('Add your business '.length + 23);
    expect(countChars('threads', long)).toBe(long.length);
  });

  it('blocks Instagram without a finished image or video', () => {
    expect(codes(checkVariant({ channel: 'instagram', caption: 'Discover more.' }))).toContain('needs_media');
    expect(codes(checkVariant({ channel: 'instagram', caption: 'Discover more.', mediaUrl: 'https://x.co/a.png' }))).not.toContain('needs_media');
  });

  it('blocks TikTok and YouTube without a video, even with an image', () => {
    expect(codes(checkVariant({ channel: 'tiktok', caption: 'Discover.', mediaUrl: 'https://x.co/a.jpg' }))).toContain('needs_video');
    expect(codes(checkVariant({ channel: 'youtube', caption: 'Discover.', mediaUrl: 'https://x.co/a.mp4' }))).not.toContain('needs_video');
  });

  it('blocks a media link that is not an image or video file', () => {
    expect(codes(checkVariant({ channel: 'facebook', caption: 'Discover.', mediaUrl: 'https://x.co/page' }))).toContain('media_unknown');
  });

  it('blocks an unfilled [placeholder]', () => {
    expect(codes(checkVariant({ channel: 'facebook', caption: 'Meet [Business name] in Lagos. Discover them.' }))).toContain('placeholder');
  });

  it('blocks the retired "List your business" call to action', () => {
    const c = checkVariant({ channel: 'facebook', caption: 'List your business today.' });
    expect(codes(c)).toContain('old_cta');
    expect(codes(checkVariant({ channel: 'facebook', caption: 'Add your business today.' }))).not.toContain('old_cta');
  });

  it('blocks more than 30 Instagram hashtags', () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ');
    expect(codes(checkVariant({ channel: 'instagram', caption: `Discover. ${tags}`, mediaUrl: 'https://x.co/a.png' }))).toContain('too_many_hashtags');
  });
});

describe('claims that need a person, never automation', () => {
  it.each([
    ['Over 5,000 businesses already listed. Discover them.', 'number_claim'],
    ['Engagement up 40% this month.', 'percent_claim'],
    ["Africa's leading discovery platform.", 'superlative'],
    ['The majority of customers begin their buying journey online.', 'crowd_claim'],
    ['Millions of Africans search for services every day.', 'crowd_claim'],
    ['In partnership with a major bank.', 'partner_claim'],
    ['Plans from ₦5,000 a month.', 'price_claim'],
    ['“NowOpen changed how customers find my shop” said Ada.', 'testimonial'],
    ['Booking is now live for every business.', 'announcement'],
  ])('flags %s', (caption, code) => {
    const c = checkVariant({ channel: 'facebook', caption });
    expect(codes(c)).toContain(code);
    expect(isSensitive(c)).toBe(true);
  });

  it('leaves an ordinary, honest post alone', () => {
    const c = checkVariant({ channel: 'facebook', caption: 'Your business deserves to be found. Add your business to NowOpen Africa.' });
    expect(c).toEqual([]);
  });
});

describe('gentle warnings', () => {
  it('notes a post with no call to action or link', () => {
    expect(codes(checkVariant({ channel: 'facebook', caption: 'Lagos at dawn.' }))).toContain('no_cta');
  });
  it('notes a link pasted into an Instagram caption', () => {
    expect(codes(checkVariant({ channel: 'instagram', caption: 'See https://www.nowopenafrica.com', mediaUrl: 'https://x.co/a.png' }))).toContain('link_not_clickable');
  });
});

describe('tracked links', () => {
  it('tags our own links and sends them to the canonical www host', () => {
    const u = new URL(trackedUrl('https://nowopenafrica.com/add-business', 'instagram', 'nov3-unveiling', 'NOA-SOC-0007')!);
    expect(u.hostname).toBe('www.nowopenafrica.com');
    expect(u.searchParams.get('utm_source')).toBe('instagram');
    expect(u.searchParams.get('utm_medium')).toBe('social');
    expect(u.searchParams.get('utm_campaign')).toBe('nov3-unveiling');
    expect(u.searchParams.get('utm_content')).toBe('NOA-SOC-0007');
  });
  it('accepts a path on our site', () => {
    expect(trackedUrl('/discover', 'x', 'always-on', 'NOA-SOC-0001')).toMatch(/^https:\/\/www\.nowopenafrica\.com\/discover\?utm_source=x/);
  });
  it('leaves other sites untouched', () => {
    expect(trackedUrl('https://example.com/a', 'x', 'c', 'k')).toBe('https://example.com/a');
  });
  it('returns nothing when there is no link', () => {
    expect(trackedUrl(null, 'x', 'c', 'k')).toBeNull();
  });
});

describe('Lagos time', () => {
  it('places 23:30 UTC on the next Lagos day', () => {
    expect(lagosDay('2026-10-28T23:30:00Z')).toBe('2026-10-29');
  });
  it('round-trips a typed Lagos time', () => {
    const utc = lagosLocalToUtc('2026-10-29T09:30');
    expect(utc).toBe('2026-10-29T08:30:00.000Z');
    expect(utcToLagosLocal(utc)).toBe('2026-10-29T09:30');
  });
  it('rejects a malformed time', () => {
    expect(lagosLocalToUtc('tomorrow')).toBeNull();
  });
  it('formats for screens in Lagos time', () => {
    expect(formatLagos('2026-10-29T08:30:00Z')).toMatch(/09:30/);
    expect(formatLagos(null)).toBe('Not set');
  });
});

describe('duplicates and the daily ceiling', () => {
  const cal = [
    { id: 'a', channel: 'instagram' as const, at: '2026-10-29T09:00:00Z', caption: 'Your business deserves to be found. Add your business today.' },
    { id: 'b', channel: 'instagram' as const, at: '2026-10-29T15:00:00Z', caption: 'Meet the tailors of Yaba.' },
    { id: 'c', channel: 'x' as const, at: '2026-10-29T09:00:00Z', caption: 'Your business deserves to be found. Add your business today.' },
  ];
  it('scores identical wording as 1 and unrelated wording near 0', () => {
    expect(similarity('Add your business today', 'Add your business today')).toBe(1);
    expect(similarity('Add your business today', 'Meet the tailors of Yaba')).toBeLessThan(0.2);
  });
  it('finds a near-identical post on the same channel only', () => {
    const cand = { id: 'n', channel: 'instagram' as const, at: '2026-11-02T09:00:00Z', caption: 'Your business deserves to be found! Add your business today' };
    expect(findNearDuplicates(cand, cal).map((e) => e.id)).toEqual(['a']);
  });
  it('ignores the same words more than 14 days apart', () => {
    const cand = { id: 'n', channel: 'instagram' as const, at: '2026-12-01T09:00:00Z', caption: cal[0].caption };
    expect(findNearDuplicates(cand, cal)).toEqual([]);
  });
  it('counts posts on the same channel and Lagos day', () => {
    expect(postsThatDay({ id: 'n', channel: 'instagram', at: '2026-10-29T20:00:00Z', caption: 'x' }, cal)).toBe(2);
  });
});

describe('media kind', () => {
  it('reads the file type, ignoring query strings', () => {
    expect(mediaKind('https://cdn.x/a.MP4?token=1')).toBe('video');
    expect(mediaKind('https://cdn.x/a.webp')).toBe('image');
    expect(mediaKind('https://cdn.x/a')).toBeNull();
  });
});
