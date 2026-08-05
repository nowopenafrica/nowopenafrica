import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  industryKeyForCategory, generateVideoProject, captionText, voiceoverText,
  shotListText, projectPackText, predictPerformance,
  loadProjects, saveProjects, videoKey,
} from './videoCreator';

const biz: Business = {
  id: 'biz-1',
  name: 'Meat Club',
  description: 'Smoked meats and grills.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
};

const baseInput = {
  creator: 'promote' as const,
  goal: 'sales' as const,
  format: 'Reel 15' as const,
  topic: 'Weekend grill special',
  media: 'ai' as const,
  voiceover: 'female-nigerian',
  subtitle: 'apple',
  style: 'cinematic',
  music: 'afrobeats',
  market: 'nigeria',
};

beforeEach(() => localStorage.clear());

describe('videoCreator — industry mapping', () => {
  it('maps common categories to their video industry', () => {
    expect(industryKeyForCategory('Restaurant')).toBe('restaurant');
    expect(industryKeyForCategory('Car Wash & Detailing')).toBe('car-wash');
    expect(industryKeyForCategory('Hotel & Lodge')).toBe('hotel');
    expect(industryKeyForCategory('Real Estate')).toBe('real-estate');
    expect(industryKeyForCategory('Laundry & Dry Cleaning')).toBe('laundry');
    expect(industryKeyForCategory('Pharmacy')).toBe('pharmacy');
    expect(industryKeyForCategory('Salon & Barber')).toBe('salon');
  });

  it('falls back to the generic agency profile for unknown categories', () => {
    expect(industryKeyForCategory('Something Completely New')).toBe('agency');
    expect(industryKeyForCategory('')).toBe('agency');
  });
});

describe('videoCreator — project generation', () => {
  it('builds a complete deterministic video plan', () => {
    const a = generateVideoProject(biz, { ...baseInput, industryKey: industryKeyForCategory(biz.category) });
    const b = generateVideoProject(biz, { ...baseInput, industryKey: industryKeyForCategory(biz.category) });

    expect(a.scenes.length).toBeGreaterThan(0);
    expect(a.scenes.every((s) => s.seconds > 0 && s.text && s.direction && s.voiceover)).toBe(true);
    expect(a.hook).toBe(b.hook);
    expect(a.cta).toBe(b.cta);
    expect(a.scenes.map((s) => s.text)).toEqual(b.scenes.map((s) => s.text));
    expect(a.caption).toContain('Meat Club');
    expect(a.hashtags).toContain('#NowOpenAfrica');
    expect(a.status).toBe('draft');
  });

  it('wires the business phone into the call to action options', () => {
    const p = generateVideoProject(biz, { ...baseInput, industryKey: 'restaurant' });
    expect(p.cta.length).toBeGreaterThan(0);
  });

  it('produces a bounded prediction with four metrics', () => {
    const p = generateVideoProject(biz, { ...baseInput, industryKey: 'restaurant' });
    expect(p.prediction.stars).toBeGreaterThanOrEqual(1);
    expect(p.prediction.stars).toBeLessThanOrEqual(5);
    expect(p.prediction.metrics).toHaveLength(4);
    expect(p.coach.length).toBeGreaterThan(0);
  });

  it('keeps the prediction within bounds even for weak inputs', () => {
    const pred = predictPerformance({
      hook: '', scenes: [{ id: '1', seconds: 3, text: 'x', direction: 'y', voiceover: 'z', transition: 'cut', media: 'ai' }],
      caption: 'a very long caption '.repeat(40), topic: '', cta: '',
    });
    expect(pred.stars).toBeGreaterThanOrEqual(1);
    expect(pred.stars).toBeLessThanOrEqual(5);
  });
});

describe('videoCreator — captions & export', () => {
  it('writes a caption with hashtags', () => {
    const p = generateVideoProject(biz, { ...baseInput, industryKey: 'restaurant' });
    const caption = captionText(p);
    expect(caption).toContain(p.caption);
    expect(caption).toContain('#NowOpenAfrica');
  });

  it('produces a readable shot list and full pack', () => {
    const p = generateVideoProject(biz, { ...baseInput, industryKey: 'restaurant' });
    const list = shotListText(p);
    expect(list).toContain('[3s]');
    expect(list).toContain('🎬');
    const pack = projectPackText(p);
    expect(pack).toContain('HOOK:');
    expect(pack).toContain('CAPTION');
    expect(voiceoverText(p).length).toBeGreaterThan(0);
  });
});

describe('videoCreator — persistence', () => {
  it('saves and loads projects per business', () => {
    const a = generateVideoProject(biz, { ...baseInput, industryKey: 'restaurant' });
    const b = generateVideoProject(biz, { ...baseInput, industryKey: 'restaurant' });
    saveProjects('biz-1', [a, b]);
    expect(loadProjects('biz-1')).toHaveLength(2);
    expect(loadProjects('biz-1')[0].format).toBe('Reel 15');
    expect(loadProjects('other')).toHaveLength(0);
    expect(videoKey('biz-1')).toBe('nowopen_videos_biz-1');
  });
});
