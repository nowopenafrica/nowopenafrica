import { describe, it, expect } from 'vitest';
import { copyForGoal, copyPack, hashtagsFor, COPY_GOALS, COPY_PLATFORMS } from './copywriter';

const biz = {
  name: 'Meat Club',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  description: 'Grilled meats and more.',
  hours: '9am – 10pm',
};

describe('copywriter', () => {
  it('generates copy that mentions the business', () => {
    const text = copyForGoal(biz, 'grand-opening', 'instagram');
    expect(text).toContain('Meat Club');
    expect(text).toContain('Restaurant');
  });

  it('builds safe hashtags including the brand hashtag', () => {
    const tags = hashtagsFor(biz, 'flash-sale').split(' ').filter(Boolean);
    expect(tags).toContain('NowOpenAfrica');
    expect(tags.join(' ')).not.toMatch(/[^\s#A-Za-z0-9]/);
  });

  it('writes SEO copy with keywords', () => {
    const seo = copyForGoal(biz, 'grand-opening', 'seo');
    expect(seo).toContain('Lagos');
    expect(seo).toContain('Restaurant');
  });

  it('writes an SMS within the 160-char limit', () => {
    const sms = copyForGoal(biz, 'flash-sale', 'sms');
    expect(sms).toContain('Meat Club');
    expect(sms).toContain('STOP to opt out');
    expect(sms.length).toBeLessThanOrEqual(160);
  });

  it('returns one item per platform for a copy pack', () => {
    const pack = copyPack(biz, 'event');
    expect(pack.map((p) => p.platform)).toEqual(COPY_PLATFORMS.map((p) => p.key));
    expect(pack.every((p) => p.text.length > 20)).toBe(true);
  });

  it('has a goal for every entry in the goal list', () => {
    for (const g of COPY_GOALS) {
      expect(copyForGoal(biz, g.key, 'instagram')).toContain('Meat Club');
    }
  });
});
