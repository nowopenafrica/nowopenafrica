/**
 * Keeping an Instagram gallery current without duplicating it.
 *
 * The assertions that matter are about identity. This sync runs on a
 * schedule, so if the same post is not recognised as the same post, every
 * poll adds it again — and a real business's listing fills with a dozen
 * copies of one photograph. Raw string comparison fails that immediately,
 * because Instagram returns the same media under several URL spellings.
 */

import { describe, it, expect } from 'vitest';

import { permalinkKey, newPermalinks, galleryRow, PERMALINK_RE } from './instagramGallery';

describe('a post is the same post however its link is written', () => {
  it('sees through trailing slashes, www and tracking parameters', () => {
    const spellings = [
      'https://www.instagram.com/p/CxYzAbC123/',
      'https://instagram.com/p/CxYzAbC123',
      'https://www.instagram.com/p/CxYzAbC123/?igsh=MWxyZg%3D%3D',
      'http://instagram.com/p/CxYzAbC123/',
    ];
    const keys = spellings.map(permalinkKey);
    expect(new Set(keys).size, `these are one post: ${keys.join(' | ')}`).toBe(1);
  });

  it('treats /p/ and /reel/ of one shortcode as one piece of media', () => {
    // Instagram serves a reel under both routes; they are not two posts.
    expect(permalinkKey('https://www.instagram.com/reel/ABC123/'))
      .toBe(permalinkKey('https://www.instagram.com/p/ABC123/'));
  });

  it('does not confuse two different posts', () => {
    expect(permalinkKey('https://www.instagram.com/p/AAA111/'))
      .not.toBe(permalinkKey('https://www.instagram.com/p/BBB222/'));
  });
});

describe('it refuses anything that is not a post', () => {
  it('rejects links that would render as an empty iframe', () => {
    /*
     * A profile or story URL in the gallery is a blank box on a real
     * business's listing. The trigger that writes these rows filters on the
     * same expression.
     */
    for (const url of [
      'https://www.instagram.com/adafabrics/',
      'https://www.instagram.com/stories/adafabrics/123/',
      'https://www.instagram.com/explore/tags/lagos/',
      'https://example.com/p/ABC123/',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(permalinkKey(url), String(url)).toBeNull();
    }
  });

  it('matches the expression the database trigger uses', () => {
    expect(PERMALINK_RE.test('https://www.instagram.com/tv/ABC123/')).toBe(true);
    expect(PERMALINK_RE.test('https://www.instagram.com/adafabrics/')).toBe(false);
  });
});

describe('only genuinely new posts are added', () => {
  const existing = [
    'https://www.instagram.com/p/OLD111/',
    'https://www.instagram.com/p/OLD222/?igsh=x',
  ];

  it('adds a post the gallery does not hold', () => {
    const out = newPermalinks(['https://www.instagram.com/p/NEW999/'], existing);
    expect(out).toEqual(['https://www.instagram.com/p/NEW999/']);
  });

  it('adds nothing when every post is already there, however spelled', () => {
    /*
     * The failure that would matter most: a poll every twenty minutes, each
     * one re-adding twelve posts, forever.
     */
    const fetched = [
      'https://instagram.com/p/OLD111',          // no www, no trailing slash
      'https://www.instagram.com/reel/OLD222/',  // different route, same media
    ];
    expect(newPermalinks(fetched, existing)).toEqual([]);
  });

  it('collapses repeats inside one response', () => {
    const fetched = [
      'https://www.instagram.com/p/NEW999/',
      'https://instagram.com/p/NEW999',
    ];
    expect(newPermalinks(fetched, existing)).toHaveLength(1);
  });

  it('keeps the order Meta returned, which is newest first', () => {
    const fetched = [
      'https://www.instagram.com/p/N3/',
      'https://www.instagram.com/p/N2/',
      'https://www.instagram.com/p/N1/',
    ];
    expect(newPermalinks(fetched, []).map((u) => permalinkKey(u))).toEqual(['n3', 'n2', 'n1']);
  });

  it('ignores junk on either side rather than throwing', () => {
    expect(newPermalinks(
      [null, '', 'https://www.instagram.com/adafabrics/', 'https://www.instagram.com/p/OK1/'],
      [null, '', 'not a url'],
    )).toEqual(['https://www.instagram.com/p/OK1/']);
  });

  it('adds nothing when Instagram returned nothing', () => {
    // An account with no posts is not a reason to change the gallery.
    expect(newPermalinks([], existing)).toEqual([]);
  });
});

describe('the row it writes', () => {
  const row = galleryRow('biz-1', '  https://www.instagram.com/p/ABC123/  ');

  it('stores the permalink, never a copied media file', () => {
    /*
     * Meta's media_url is a signed CDN address that expires within days, and
     * the terms do not permit re-hosting. A permalink renders through Meta's
     * own iframe: always current, always attributed, nothing of theirs on our
     * servers.
     */
    expect(row.image_url).toBe('https://www.instagram.com/p/ABC123/');
    expect(row.source_url).toBe(row.image_url);
    expect(JSON.stringify(row)).not.toMatch(/cdninstagram|fbcdn/);
  });

  it('copies no caption', () => {
    // The embed shows the account's own words, live.
    expect(row.caption).toBeNull();
  });

  it('declares the same provenance the publish trigger does', () => {
    expect(row.content_status).toBe('source_derived');
    expect(row.source_type).toBe('instagram');
    expect(row.source_name).toBe('Instagram');
    expect(row.requires_confirmation).toBe(true);
  });
});
