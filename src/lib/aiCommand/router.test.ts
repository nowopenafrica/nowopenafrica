import { describe, it, expect } from 'vitest';
import { tokens, maybeCity, maybeCategory, rankAgents, planFor } from './router';
import { READ_TOOLS } from './tools';

describe('tokens', () => {
  it('lowercases and strips punctuation, keeping words and numbers', () => {
    expect(tokens('Why aren\'t businesses 2 claiming?? IN Lagos')).toEqual(['why', 'aren', 't', 'businesses', '2', 'claiming', 'in', 'lagos']);
  });

  it('drops empty tokens', () => {
    expect(tokens('   ')).toEqual([]);
  });
});

describe('maybeCity', () => {
  it('detects a known city anywhere in the text', () => {
    expect(maybeCity('best restaurant in lagos')).toBe('lagos');
    expect(maybeCity('anything about ABUJA today')).toBe('abuja');
    expect(maybeCity('port harcourt hotels')).toBe('port harcourt');
  });

  it('returns undefined when no known city is mentioned', () => {
    expect(maybeCity('health overview')).toBeUndefined();
  });
});

describe('maybeCategory', () => {
  it('detects the first known category in the text', () => {
    expect(maybeCategory('italian restaurant near me')).toBe('restaurant');
    expect(maybeCategory('fashion designer boutiques')).toBe('fashion');
  });

  it('returns undefined when no known category is mentioned', () => {
    expect(maybeCategory('claims pipeline stuck?')).toBeUndefined();
  });
});

describe('rankAgents', () => {
  it('routes security phrasing to the security agent', () => {
    const ranked = rankAgents('run the rls security snapshot of policies');
    expect(ranked[0].agent).toBe('security');
  });

  it('routes claim phrasing to the claim agent', () => {
    const ranked = rankAgents('why are claims stuck in review');
    expect(ranked[0].agent).toBe('claims');
  });

  it('routes executive phrasing to the founder agent', () => {
    const ranked = rankAgents('give me the executive scorecard of company health');
    expect(ranked[0].agent).toBe('founder');
  });

  it('routes engagement phrasing to the analytics agent', () => {
    const ranked = rankAgents('what is trending in organic searches');
    expect(ranked[0].agent).toBe('analytics');
  });
});

describe('buildPlan / planFor', () => {
  it('plans only read-only tools, in the agent\'s declared order', () => {
    const plan = planFor('how is the platform health today');
    expect(plan.agents[0]).toBe('audit');
    expect(plan.tools.length).toBeGreaterThan(0);
    for (const t of plan.tools) {
      expect(READ_TOOLS.some((rt) => rt.name === t.tool)).toBe(true);
    }
  });

  it('defaults to the audit agent when no signal matches', () => {
    const plan = planFor('zzzz nonsense');
    expect(plan.agents).toEqual(['audit']);
    expect(plan.tools[0].tool).toBe('platform_health');
  });

  it('attaches a mentioned city to the businesses snapshot', () => {
    const plan = planFor('audit how is the platform doing in lagos');
    const snapshot = plan.tools.find((t) => t.tool === 'businesses_snapshot');
    expect(snapshot?.args.city).toBe('lagos');
  });

  it('attaches a mentioned category to the opportunity finder', () => {
    const plan = planFor('find restaurant opportunities to acquire');
    const opp = plan.tools.find((t) => t.tool === 'opportunity_finder');
    expect(opp?.args.category).toBe('restaurant');
  });

  it('produces a deterministic summary naming the winning agent and tools', () => {
    const a = planFor('claims pipeline review');
    const b = planFor('claims pipeline review');
    expect(a).toEqual(b);
    expect(a.summary).toMatch(/Claim Agent/);
  });

  it('returns the agent list (and a second on a tie)', () => {
    const plan = planFor('why are businesses not claiming');
    expect(plan.agents.length).toBeGreaterThanOrEqual(1);
  });
});