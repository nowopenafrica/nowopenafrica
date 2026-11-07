import { describe, expect, it } from 'vitest';

import {
  isMissingTable, projectMeta, sortProjects, toProject, type BusinessProject,
} from './businessProjects';
import { EMPTY_DETAILS } from './projectStory';

const project = (extra: Partial<BusinessProject> = {}): BusinessProject => ({
  id: 'p1', business_id: 'b1', title: 'Job', summary: null, client: null,
  location: null, completed_on: null, cover_url: null, cover_video_url: null,
  category: null, images: [], link_url: null, tags: [], position: 0,
  published: true, featured: false, sections: [], details: EMPTY_DETAILS,
  results: [], seo_title: null, seo_description: null, slug: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: null,
  ...extra,
});

describe('a row from the database becomes something safe to render', () => {
  /*
   * A jsonb column defaults to '[]' but a hand-written row, an import or an
   * older migration can leave null — and `null.map` is a blank profile.
   */
  it('never hands back a null array', () => {
    const p = toProject({ id: 'x', business_id: 'b', title: 'T', images: null, tags: null });
    expect(p.images).toEqual([]);
    expect(p.tags).toEqual([]);
    expect(p.sections).toEqual([]);
    expect(p.results).toEqual([]);
  });

  it('drops images and tags that are not usable', () => {
    const p = toProject({
      id: 'x', business_id: 'b', title: 'T',
      images: ['https://cdn.example/a.png', 42, null, 'javascript:alert(1)', 'relative.png'],
      tags: ['x', {}, 7],
    });
    expect(p.images.map((media) => media.url)).toEqual(['https://cdn.example/a.png']);
    expect(p.tags).toEqual(['x']);
  });

  /*
   * Rows written before this feature stored bare URL strings. They are still in
   * the table and must keep working without a data migration.
   */
  it('upgrades a legacy string image to a media object', () => {
    const p = toProject({ id: 'x', business_id: 'b', title: 'T', images: ['https://cdn.example/a.jpg'] });
    expect(p.images).toEqual([
      { url: 'https://cdn.example/a.jpg', caption: null, alt: null, credit: null },
    ]);
  });

  it('treats a missing published flag as published', () => {
    expect(toProject({ id: 'x', business_id: 'b', title: 'T' }).published).toBe(true);
    expect(toProject({ id: 'x', business_id: 'b', title: 'T', published: false }).published).toBe(false);
  });
});

describe('the order work is shown in', () => {
  it('puts the owner\'s own order first', () => {
    const rows = [project({ id: 'c', position: 2 }), project({ id: 'a', position: 0 }), project({ id: 'b', position: 1 })];
    expect(sortProjects(rows).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to the newest finished work', () => {
    const rows = [
      project({ id: 'old', completed_on: '2021-03-01' }),
      project({ id: 'new', completed_on: '2026-02-01' }),
      project({ id: 'mid', completed_on: '2024-07-01' }),
    ];
    expect(sortProjects(rows).map((p) => p.id)).toEqual(['new', 'mid', 'old']);
  });

  /* Work with no date should not jump the queue ahead of dated work. */
  it('puts undated work last among its position', () => {
    const rows = [project({ id: 'none' }), project({ id: 'dated', completed_on: '2020-01-01' })];
    expect(sortProjects(rows).map((p) => p.id)).toEqual(['dated', 'none']);
  });

  it('does not mutate what it was given', () => {
    const rows = [project({ id: 'b', position: 1 }), project({ id: 'a', position: 0 })];
    const before = rows.map((p) => p.id);
    sortProjects(rows);
    expect(rows.map((p) => p.id)).toEqual(before);
  });
});

describe('empty is not the same as unavailable', () => {
  /*
   * The dangerous direction is public: if the table is not there yet, a
   * plain catch renders "no projects yet" on the profile of a builder with
   * thirty of them.
   */
  it('recognises a table that does not exist', () => {
    expect(isMissingTable('42P01')).toBe(true);
    expect(isMissingTable('PGRST205')).toBe(true);
  });

  it('does not mistake an ordinary failure for a missing table', () => {
    for (const code of ['42501', 'PGRST301', '', undefined, null]) {
      expect(isMissingTable(code), String(code)).toBe(false);
    }
  });
});

describe('the line under a title', () => {
  it('reads client, place and year', () => {
    expect(projectMeta(project({ client: 'Zenith Bank', location: 'Lekki', completed_on: '2025-08-14' })))
      .toBe('Zenith Bank · Lekki · 2025');
  });

  it('leaves out what was not supplied', () => {
    expect(projectMeta(project({ location: 'Ibadan' }))).toBe('Ibadan');
    expect(projectMeta(project())).toBe('');
  });

  /* A malformed date must not print "undefined" under somebody's work. */
  it('ignores a date it cannot read', () => {
    expect(projectMeta(project({ client: 'A', completed_on: 'soon' }))).toBe('A');
  });
});
