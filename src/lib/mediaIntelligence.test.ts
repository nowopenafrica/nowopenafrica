import { describe, it, expect } from 'vitest';
import {
  firstPublishedUrl, mergePublishedGallery, mediaReviewPatch, canReview,
  MEDIA_STATUS_FLOW, MEDIA_STATUS_TERMINAL, ALLOWED_ASSET_TYPES,
  type MediaAssetRow,
} from './mediaIntelligence';

const asset = (over: Partial<MediaAssetRow>): MediaAssetRow => ({
  id: 'a1',
  business_id: 'b1',
  asset_type: 'gallery',
  caption: null,
  source_id: null,
  source_url: null,
  source_uri: 'https://cdn.example.com/pic.jpg',
  match_confidence: 0,
  rights_decision: 'conservative_default',
  licence: null,
  rights_owner: null,
  criticality: 'non_critical',
  moderation_status: 'pending',
  moderation_reason: null,
  status: 'discovered',
  takedown_requested_at: null,
  takedown_reason: null,
  created_at: '2026-09-11T00:00:00.000Z',
  reviewed_at: null,
  ...over,
});

describe('mediaIntelligence — review transitions', () => {
  it('approves and publishes a discovered asset through the lifecycle', () => {
    expect(mediaReviewPatch('approve', 'discovered', 'T1', 'u1', null))
      .toMatchObject({ status: 'approved', moderation_status: 'approved', reviewed_by: 'u1', reviewed_at: 'T1' });
    expect(mediaReviewPatch('publish', 'approved', 'T2', 'u1', null))
      .toMatchObject({ status: 'published', moderation_status: 'approved' });
  });

  it('bounces any action on a taken-down asset', () => {
    expect(mediaReviewPatch('publish', 'removed', 'T', 'u1', null)).toBeNull();
    expect(mediaReviewPatch('approve', 'removed', 'T', 'u1', null)).toBeNull();
    expect(mediaReviewPatch('takedown', 'removed', 'T', 'u1', null)).toBeNull();
    expect(canReview('publish', 'removed')).toBe(false);
  });

  it('records a rejection reason and a takedown honour', () => {
    expect(mediaReviewPatch('reject', 'match_confirmed', 'T', 'u1', 'no rights trace'))
      .toMatchObject({ status: 'rejected', moderation_reason: 'no rights trace' });
    expect(mediaReviewPatch('takedown', 'published', 'T', 'u2', 'owner asked'))
      .toMatchObject({ status: 'removed', takedown_requested_at: 'T', takedown_reason: 'owner asked' });
  });

  it('falls back to a sensible default reason for a bare rejection', () => {
    expect(mediaReviewPatch('reject', 'discovered', 'T', 'u1', '  '))
      .toMatchObject({ status: 'rejected', moderation_reason: 'Rejected in media review' });
  });
});

describe('mediaIntelligence — vocabulary', () => {
  it('walks the registry statuses in §16 order with terminal states', () => {
    expect([...MEDIA_STATUS_FLOW]).toEqual(['discovered', 'match_confirmed', 'approved', 'published']);
    expect([...MEDIA_STATUS_TERMINAL]).toEqual(['rejected', 'removed']);
    expect(ALLOWED_ASSET_TYPES).toContain('gallery');
    expect(ALLOWED_ASSET_TYPES).toContain('logo');
  });
});

describe('mediaIntelligence — public rendering', () => {
  const published = (u: string, t: string, over: Partial<MediaAssetRow> = {}) =>
    asset({ source_uri: u, asset_type: t, status: 'published', ...over });

  it('finds the first published URL for a type only', () => {
    const list = [
      published('https://c/logo.png', 'logo'),
      asset({ source_uri: 'https://c/draft.png', asset_type: 'logo' }),
    ];
    expect(firstPublishedUrl(list, 'logo')).toBe('https://c/logo.png');
    expect(firstPublishedUrl(list, 'cover')).toBeNull();
  });

  it('appends published gallery assets after owner media, deduped by URL', () => {
    const owner = [{ url: 'https://c/own.png', caption: 'by us', type: 'photo' as const }];
    const list = [
      published('https://c/own.png', 'gallery'),
      published('https://c/cdn/pic.jpg', 'gallery', { caption: 'found us' }),
      asset({ source_uri: 'https://c/draft.png', asset_type: 'gallery' }),
    ];
    const out = mergePublishedGallery(owner, list, (a) => ({ url: a.source_uri!, caption: a.caption ?? undefined, type: 'photo' as const }));
    expect(out.map((i) => i.url)).toEqual(['https://c/own.png', 'https://c/cdn/pic.jpg']);
  });

  it('never appends non-published or non-gallery assets', () => {
    const list = [
      asset({ source_uri: 'https://c/cover.png', asset_type: 'cover', status: 'published' }),
      asset({ source_uri: 'https://c/reject.png', asset_type: 'gallery', status: 'rejected' }),
    ];
    expect(mergePublishedGallery([], list, (a) => ({ url: a.source_uri! }))).toEqual([]);
  });
});