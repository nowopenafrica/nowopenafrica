import { describe, it, expect } from 'vitest';
import { classifyAsset, decideImageRights, decideAssetAction } from './image';

describe('classifyAsset', () => {
  it('prefers the source hint', () => {
    expect(classifyAsset('https://s.com/a.jpg', 'logo')).toBe('logo');
  });
  it('falls back to path conventions', () => {
    expect(classifyAsset('https://s.com/favicon.png')).toBe('logo');
    expect(classifyAsset('https://s.com/cover.jpg')).toBe('cover');
    expect(classifyAsset('https://s.com/img/photo-1.jpg')).toBe('gallery');
  });
});

describe('decideImageRights', () => {
  it('licenses a permissive, attribution-requiring licence', () => {
    const r = decideImageRights({ licence: 'CC BY 4.0', attribution: 'A. Photographer' });
    expect(r.rights_decision).toBe('licensed');
    expect(r.rights_owner).toBe('A. Photographer');
  });

  it('accepts CC0 with no attribution', () => {
    const r = decideImageRights({ licence: 'CC0', attribution: 'nobody' });
    expect(r.rights_decision).toBe('licensed');
    expect(r.rights_owner).toBeNull();
  });

  it('defaults to conservative when no verifiable licence', () => {
    const r = decideImageRights({ licence: null });
    expect(r.rights_decision).toBe('conservative_default');
  });
});

describe('decideAssetAction', () => {
  const candidate = {
    url: 'https://photos.example.com/logo.jpg',
    hint: 'logo' as const,
    signals: ['name:exact', 'domain:example.com'],
    rights: decideImageRights({ licence: 'CC0' }),
  };

  it('records a licensed, well-signalled logo as match_confirmed', () => {
    const action = decideAssetAction({ business: { name: 'Example Co' }, existing: [], candidate });
    expect(action.action).toBe('record');
    expect(action.targetStatus).toBe('match_confirmed');
    expect(action.match_confidence).toBeGreaterThanOrEqual(60);
  });

  it('drops an asset that was already taken down', () => {
    const existing = [{
      asset_type: 'logo', source_uri: candidate.url, status: 'removed', match_confidence: 0,
      matching_signal: {}, keywords: [], criticality: 'non_critical', moderation_status: 'pending',
      keep_url_only: true, created_at: 'x', updated_at: 'x',
    }] as unknown as import('./types').BusinessMediaAsset[];
    const action = decideAssetAction({ business: { name: 'Example Co' }, existing, candidate });
    expect(action.action).toBe('reject');
    expect(action.reason).toMatch(/taken down/);
  });

  it('caps the record at discovered when rights are unverified', () => {
    const unlicensed = { ...candidate, rights: decideImageRights({ licence: null }) };
    const action = decideAssetAction({ business: { name: 'Example Co' }, existing: [], candidate: unlicensed });
    expect(action.action).toBe('record');
    expect(action.targetStatus).toBe('discovered');
  });

  it('rejects a URL with no signals at all', () => {
    const weak = { ...candidate, signals: [] };
    const action = decideAssetAction({ business: { name: 'Example Co' }, existing: [], candidate: weak });
    expect(action.action).toBe('reject');
  });
});