import { describe, it, expect } from 'vitest';
import {
  SYNC_FAMILIES, DEFAULT_APPROVAL_THRESHOLD,
  fieldFamily, flagForFamily, flagForField, postureMessage,
} from './syncPreferences';

describe('syncPreferences — field family mapping mirrors the SQL applier', () => {
  it('routes opening_hours to hours and image fields to images', () => {
    expect(fieldFamily('opening_hours')).toBe('hours');
    expect(fieldFamily('logo_url')).toBe('images');
    expect(fieldFamily('image_url')).toBe('images');
  });

  it('treats every other writable field as discovery', () => {
    for (const field of [
      'description', 'category', 'address', 'location', 'phone', 'whatsapp', 'email',
      'website', 'tagline', 'about', 'story', 'mission', 'vision', 'subcategory',
      'business_type', 'employees', 'service_area', 'timezone', 'founded_year',
      'social_links',
    ]) {
      expect(fieldFamily(field), field).toBe('discovery');
    }
  });

  it('exposes the exact flags the applier reads, in the safe order', () => {
    expect(SYNC_FAMILIES.map((f) => f.flag)).toEqual([
      'auto_apply_hours', 'auto_apply_source_images', 'auto_apply_discovery_fields',
    ]);
    expect(flagForFamily('images')).toBe('auto_apply_source_images');
    expect(flagForField('opening_hours')).toBe('auto_apply_hours');
    expect(flagForField('address')).toBe('auto_apply_discovery_fields');
  });
});

describe('syncPreferences — threshold default', () => {
  it('keeps the safety bar the migration seeds (80)', () => {
    expect(DEFAULT_APPROVAL_THRESHOLD).toBe(80);
  });
});

describe('syncPreferences — honest posture copy', () => {
  const base = {
    sync_enabled: true, auto_apply_hours: false,
    auto_apply_source_images: false, auto_apply_discovery_fields: false,
  };

  it('says enrichment is off when the master switch is down', () => {
    expect(postureMessage({ ...base, sync_enabled: false })).toMatch(/off/);
  });

  it('says everything is ask-first at defaults', () => {
    expect(postureMessage(base)).toMatch(/review first/);
  });

  it('names the families that were switched on', () => {
    const msg = postureMessage({ ...base, auto_apply_hours: true, auto_apply_source_images: true });
    expect(msg).toMatch(/opening hours/);
    expect(msg).toMatch(/logo & cover images/);
  });
});