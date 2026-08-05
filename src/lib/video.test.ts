import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  REEL_FORMATS, generateReel, totalDuration, voiceoverText,
  captionText, shotListText, hashtagsFor,
  loadReels, saveReels,
} from './video';

const biz = { id: '1', name: 'Meat Club', description: 'Smoked meats.', category: 'Restaurant', phone: '+234 800 123 4567' } as unknown as Business;

beforeEach(() => localStorage.clear());

describe('video — script generation', () => {
  it('builds a 15s reel with five 3s scenes', () => {
    const reel = generateReel(biz, '15s Reel');
    expect(reel.scenes).toHaveLength(5);
    expect(totalDuration(reel)).toBe(15);
    expect(reel.scenes.every((s) => s.duration === 3)).toBe(true);
    expect(reel.scenes.every((s) => s.caption && s.direction && s.voiceover)).toBe(true);
  });

  it('varies scene counts and totals by format', () => {
    const showcase = generateReel(biz, 'Product Showcase');
    expect(showcase.scenes).toHaveLength(6);
    expect(totalDuration(showcase)).toBe(18);
    const story = generateReel(biz, 'Story');
    expect(story.scenes).toHaveLength(4);
    expect(totalDuration(story)).toBe(12);
  });

  it('references the business in value and CTA scenes', () => {
    const promo = generateReel(biz, 'Promo Video');
    const voices = voiceoverText(promo);
    expect(voices).toContain('Meat Club');
    expect(promo.hook).toContain('offer');
  });

  it('keeps format metadata coherent', () => {
    expect(REEL_FORMATS.map((f) => f.key)).toContain('15s Reel');
    const reel = generateReel(biz, '15s Reel');
    const meta = REEL_FORMATS.find((f) => f.key === reel.format);
    expect(meta?.total).toBe(15);
  });
});

describe('video — captions & export', () => {
  it('writes a caption with hashtags', () => {
    const reel = generateReel(biz, '15s Reel');
    const caption = captionText(reel);
    expect(caption).toContain(reel.caption);
    expect(caption).toContain('#NowOpenAfrica');
    expect(caption).toContain('#NigerianFood');
  });

  it('suggests hashtags by category with a fallback', () => {
    expect(hashtagsFor('Restaurant')).toContain('#TastyNigeria');
    expect(hashtagsFor('Anything')).toContain('#SupportLocal');
  });

  it('produces a readable shot list', () => {
    const reel = generateReel(biz, 'Story');
    const list = shotListText(reel);
    expect(list).toContain('[3s]');
    expect(list).toContain('🎬');
  });

  it('persists scripts per business', () => {
    const a = generateReel(biz, '15s Reel');
    const b = generateReel(biz, 'Promo Video');
    saveReels('biz1', [a, b]);
    expect(loadReels('biz1')).toHaveLength(2);
    expect(loadReels('biz1')[0].format).toBe('15s Reel');
    expect(loadReels('other')).toHaveLength(0);
  });
});
