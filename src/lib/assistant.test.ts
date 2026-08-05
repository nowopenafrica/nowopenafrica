import { describe, it, expect } from 'vitest';
import { Business } from '../types';
import { assistantReply, suggestPromotions, campaignPlan, pricingSuggestions, rewriteDescription } from './assistant';

const biz = {
  id: '1',
  name: 'Meat Club',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  description: 'Grilled meats and more.',
  hours: '9am – 10pm',
  rating: 0,
  created_at: new Date().toISOString(),
} as unknown as Business;

describe('marketing assistant', () => {
  it('writes an Instagram caption that mentions the business', () => {
    const reply = assistantReply(biz, 'write an instagram caption for a weekend offer');
    expect(reply.text).toContain('Meat Club');
    expect(reply.actions.map((a) => a.module)).toContain('copywriter');
    expect(reply.actions.map((a) => a.module)).toContain('social');
  });

  it('suggests promotion ideas', () => {
    const reply = assistantReply(biz, 'what promotions should I run this weekend?');
    expect(reply.text.toLowerCase()).toContain('promotion');
    expect(reply.actions.map((a) => a.module)).toContain('promotions');
  });

  it('plans a 7-day campaign', () => {
    const reply = assistantReply(biz, 'plan me a 7 day campaign');
    expect(reply.text).toMatch(/day [1-7]/i);
    expect(reply.actions.map((a) => a.module)).toContain('planner');
  });

  it('reports the growth score when asked', () => {
    const reply = assistantReply(biz, 'how do I improve my growth score?');
    expect(reply.text).toContain('Growth Score');
    expect(reply.actions.map((a) => a.module)).toContain('home');
  });

  it('rewrites the description', () => {
    const reply = assistantReply(biz, 'rewrite my description');
    expect(reply.text).toContain('Meat Club');
  });

  it('greets and lists capabilities', () => {
    const reply = assistantReply(biz, 'hello');
    expect(reply.text).toContain('marketing assistant');
  });

  it('falls back to help for unknown questions', () => {
    const reply = assistantReply(biz, 'what is the meaning of life?');
    expect(reply.text).toContain('Try:');
  });

  it('returns actions that all map to real modules', () => {
    const modules = assistantReply(biz, 'help').actions.map((a) => a.module);
    expect(modules.length).toBeGreaterThan(0);
  });
});

describe('assistant helpers', () => {
  it('suggests several promotions', () => {
    expect(suggestPromotions().length).toBeGreaterThanOrEqual(5);
    for (const p of suggestPromotions()) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.detail.length).toBeGreaterThan(10);
    }
  });

  it('builds a campaign plan mentioning the business', () => {
    expect(campaignPlan(biz)).toContain('Meat Club');
  });

  it('gives pricing guidance', () => {
    expect(pricingSuggestions(biz)).toContain('Restaurant');
  });

  it('rewrites the description into a fuller profile copy', () => {
    const rewritten = rewriteDescription(biz);
    expect(rewritten).toContain('Meat Club');
    expect(rewritten).toContain('Lagos');
  });
});
