import { describe, expect, it } from 'vitest';
import { planReturnPath, readPlanReturn, withPlanReturn } from './planReturn';

const LINE = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const CAMP = 'A1B2C3D4-0000-4000-8000-123456789ABC';

describe('readPlanReturn', () => {
  it('reads a valid pair', () => {
    const p = new URLSearchParams({ plan_line: LINE, plan: CAMP });
    expect(readPlanReturn(p)).toEqual({ lineId: LINE, campaignId: CAMP });
  });
  it('is null when either is missing', () => {
    expect(readPlanReturn(new URLSearchParams({ plan_line: LINE }))).toBeNull();
    expect(readPlanReturn(new URLSearchParams({ plan: CAMP }))).toBeNull();
    expect(readPlanReturn(new URLSearchParams())).toBeNull();
  });
  it('is null when either is not a UUID', () => {
    expect(readPlanReturn(new URLSearchParams({ plan_line: 'abc', plan: CAMP }))).toBeNull();
    expect(readPlanReturn(new URLSearchParams({ plan_line: LINE, plan: `${CAMP}x` }))).toBeNull();
    expect(readPlanReturn(new URLSearchParams({ plan_line: LINE, plan: '../../admin' }))).toBeNull();
  });
});

describe('planReturnPath', () => {
  it('points at the plan', () => {
    expect(planReturnPath(CAMP)).toBe(`/advertise/plan/${CAMP}`);
  });
});

describe('withPlanReturn', () => {
  it('keeps plan_line and plan on the studio address', () => {
    const p = new URLSearchParams({ template: 'x', plan_line: LINE, plan: CAMP });
    expect(withPlanReturn('/media/studio/abc', p)).toBe(`/media/studio/abc?plan_line=${LINE}&plan=${CAMP}`);
  });
  it('adds nothing when there is no valid pair', () => {
    expect(withPlanReturn('/media/studio/abc', new URLSearchParams({ template: 'x' }))).toBe('/media/studio/abc');
  });
});
