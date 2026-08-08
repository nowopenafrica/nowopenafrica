import { describe, it, expect } from 'vitest';
import {
  PRESS_KINDS, PRESS_STATUSES, PRESS_STATUS_LABELS,
  mapPressRow, formatPressDate, summarizePress, PRESS_SEED,
  type PressItem,
} from './press';

const org = '00000000-0000-4000-8000-00000000a001';

function item(over: Partial<PressItem> = {}): PressItem {
  return { id: 'p1', org_id: org, headline: 'Headline', outlet: '', kind: 'release', status: 'draft', url: '', summary: '', ...over };
}

describe('press lib', () => {
  it('exposes the kinds, statuses and status labels', () => {
    expect(PRESS_KINDS).toEqual(['release', 'coverage']);
    expect(PRESS_STATUSES).toEqual(['draft', 'scheduled', 'published']);
    expect(PRESS_STATUS_LABELS.published).toBe('Published');
    expect(PRESS_STATUS_LABELS.draft).toBe('Draft');
  });

  it('maps os_press rows, tolerating unknown kind and status', () => {
    const row = { id: 'r1', org_id: org, headline: 'H', outlet: 'TechCabal', kind: 'coverage', status: 'published', url: 'u', summary: 's' };
    expect(mapPressRow(row)).toMatchObject({ id: 'r1', kind: 'coverage', status: 'published' });
    expect(mapPressRow({ ...row, kind: 'advertorial', status: 'archived' })).toMatchObject({ kind: 'release', status: 'draft' });
  });

  it('formats press dates as month + year, tolerating missing dates', () => {
    expect(formatPressDate('2026-08-01T09:00:00Z')).toBe('Aug 2026');
    expect(formatPressDate(null)).toBe('Draft');
    expect(formatPressDate('not-a-date')).toBe('TBA');
  });

  it('summarizes the ledger by status and kind', () => {
    const s = summarizePress([
      item({ id: 'p1', status: 'published', kind: 'release' }),
      item({ id: 'p2', status: 'published', kind: 'coverage' }),
      item({ id: 'p3', status: 'draft', kind: 'release' }),
      item({ id: 'p4', status: 'scheduled', kind: 'coverage' }),
    ]);
    expect(s).toEqual({ total: 4, published: 2, draft: 1, scheduled: 1, releases: 2, coverage: 2 });
  });

  it('mirrors the three seeded stories, all published', () => {
    expect(PRESS_SEED).toHaveLength(3);
    expect(new Set(PRESS_SEED.map((p) => p.headline)).size).toBe(3);
    expect(PRESS_SEED.every((p) => p.status === 'published')).toBe(true);
    expect(PRESS_SEED.every((p) => p.org_id === org)).toBe(true);
  });
});
