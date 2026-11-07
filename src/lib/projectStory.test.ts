import { describe, expect, it } from 'vitest';

import {
  externalUrl, isDirectVideo, normalizeDetails, normalizeMediaList, normalizeResults,
  normalizeSections, projectCover, projectHref, projectSlug, safeUrl, slugify,
  text, videoPlatform, EMPTY_DETAILS,
} from './projectStory';

/*
 * This module is the boundary between what an owner typed and what a public
 * page renders. Everything below is about that boundary holding: unknown
 * types dropped, text capped, and no URL that can execute.
 */

describe('a URL that will be put in src or href', () => {
  it('accepts http, https and our own root-relative paths', () => {
    expect(safeUrl('https://cdn.example/a.jpg')).toBe('https://cdn.example/a.jpg');
    expect(safeUrl('/uploads/a.jpg')).toBe('/uploads/a.jpg');
  });

  /*
   * The four that matter. `javascript:` runs script, `data:` can carry HTML,
   * `//host` silently becomes a request off our domain, and a bare relative
   * path resolves against whatever page happens to be open.
   */
  it('refuses javascript, data, protocol-relative and bare paths', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//evil.example/a.jpg',
      'relative/a.jpg',
      '',
      null,
      42,
    ]) {
      expect(safeUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('an outbound link', () => {
  it('gives a bare domain https', () => {
    expect(externalUrl('example.com/work')).toBe('https://example.com/work');
  });

  it('still refuses script URLs dressed as a domain', () => {
    expect(externalUrl('javascript:alert(1)')).toBeNull();
    expect(externalUrl('/work/here')).toBeNull();
  });
});

describe('media', () => {
  it('keeps captions, alt text and credit', () => {
    const [media] = normalizeMediaList([
      { url: 'https://cdn.example/a.jpg', caption: 'A room', alt: 'Sunlit room', credit: 'A. Photographer' },
    ]);
    expect(media).toEqual({
      url: 'https://cdn.example/a.jpg',
      caption: 'A room',
      alt: 'Sunlit room',
      credit: 'A. Photographer',
    });
  });

  it('drops rows with no safe URL rather than rendering an empty image', () => {
    expect(normalizeMediaList([{ url: 'javascript:x' }, { caption: 'no url' }, null])).toEqual([]);
  });

  it('caps the list so one row cannot make a page unbounded', () => {
    const many = Array.from({ length: 60 }, (_, i) => `https://cdn.example/${i}.jpg`);
    expect(normalizeMediaList(many).length).toBeLessThan(60);
  });
});

describe('story sections', () => {
  it('drops a type it does not know', () => {
    const sections = normalizeSections([
      { type: 'script', body: 'alert(1)' },
      { type: 'text', body: 'A real paragraph' },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe('text');
  });

  it('drops a section that has nothing to show', () => {
    expect(normalizeSections([{ type: 'text', body: '   ' }])).toEqual([]);
    expect(normalizeSections([{ type: 'image', media: { url: '' } }])).toEqual([]);
    expect(normalizeSections([{ type: 'gallery', images: [] }])).toEqual([]);
  });

  it('keeps order — the sequence is the story', () => {
    const sections = normalizeSections([
      { type: 'text', body: 'First' },
      { type: 'quote', quote: 'Second' },
      { type: 'text', body: 'Third' },
    ]);
    expect(sections.map((section) => section.type)).toEqual(['text', 'quote', 'text']);
  });

  it('gives every section an id, so React keys and reordering are stable', () => {
    const sections = normalizeSections([{ type: 'text', body: 'A' }, { type: 'text', body: 'B' }]);
    expect(sections[0].id).not.toBe(sections[1].id);
  });

  it('refuses an unsafe video URL', () => {
    const [section] = normalizeSections([{ type: 'video', url: 'javascript:alert(1)', caption: 'x' }]);
    expect(section).toBeUndefined();
  });

  it('caps a paragraph rather than trusting its length', () => {
    const long = 'a'.repeat(20000);
    const [section] = normalizeSections([{ type: 'text', body: long }]);
    expect(section.type).toBe('text');
    if (section.type === 'text') expect(section.body.length).toBeLessThan(20000);
  });
});

describe('details and results', () => {
  it('returns an empty object, not null, for garbage', () => {
    expect(normalizeDetails(null)).toEqual(EMPTY_DETAILS);
    expect(normalizeDetails('nope')).toEqual(EMPTY_DETAILS);
  });

  it('keeps only the fields it knows', () => {
    const details = normalizeDetails({ industry: 'Fashion', injected: '<script>' });
    expect(details.industry).toBe('Fashion');
    expect(Object.keys(details)).not.toContain('injected');
  });

  it('drops a result row with neither a label nor a value', () => {
    expect(normalizeResults([{ label: '', value: '' }, { label: 'Reach', value: '2.1M' }]))
      .toEqual([{ label: 'Reach', value: '2.1M' }]);
  });
});

describe('text', () => {
  it('trims, normalises line endings and caps', () => {
    expect(text('  hello\r\nworld  ', 100)).toBe('hello\nworld');
    expect(text('abcdef', 3)).toBe('abc');
    expect(text(null)).toBe('');
  });
});

describe('slugs', () => {
  it('makes a readable slug', () => {
    expect(slugify('Kalahari Spring Campaign')).toBe('kalahari-spring-campaign');
    expect(slugify('  Café — Réouverture!  ')).toBe('cafe-reouverture');
  });

  it('appends part of the id so two projects with one title do not collide', () => {
    const a = projectSlug('Wedding suit', 'aaaaaaaa-1111-2222-3333-444444444444');
    const b = projectSlug('Wedding suit', 'bbbbbbbb-1111-2222-3333-555555555555');
    expect(a).not.toBe(b);
    expect(a).toBe('wedding-suit-444444');
  });

  it('still produces something usable for an untitled draft', () => {
    expect(projectSlug('!!!', 'abcdef12-3456-7890-abcd-ef1234567890')).toBe('project-567890');
  });
});

describe('where a project lives', () => {
  it('uses the slug when there is one', () => {
    expect(projectHref({ id: 'x', slug: 'my-project-a1b2c3' })).toBe('/work/my-project-a1b2c3');
  });

  it('falls back to the id for rows that predate slugs', () => {
    expect(projectHref({ id: 'abc-123', slug: null })).toBe('/work/abc-123');
  });

  it('encodes the segment', () => {
    expect(projectHref({ id: 'x', slug: 'a b/c' })).toBe('/work/a%20b%2Fc');
  });
});

describe('the cover', () => {
  it('prefers the chosen cover, then the first image', () => {
    const image = { url: 'https://cdn.example/a.jpg', caption: null, alt: null, credit: null };
    expect(projectCover({ cover_url: 'https://cdn.example/cover.jpg', images: [image] }))
      .toBe('https://cdn.example/cover.jpg');
    expect(projectCover({ cover_url: null, images: [image] })).toBe('https://cdn.example/a.jpg');
    expect(projectCover({ cover_url: null, images: [] })).toBeNull();
  });
});

describe('video', () => {
  it('knows a file a <video> can play', () => {
    expect(isDirectVideo('https://cdn.example/clip.mp4')).toBe(true);
    expect(isDirectVideo('https://www.youtube.com/watch?v=abc')).toBe(false);
  });

  it('names the platform a link belongs to', () => {
    expect(videoPlatform('https://vimeo.com/123')).toBe('Vimeo');
    expect(videoPlatform('https://www.youtube.com/watch?v=abc')).toBe('YouTube');
  });
});
