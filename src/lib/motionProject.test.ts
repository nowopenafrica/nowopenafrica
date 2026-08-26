import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadMotionProjects, saveMotionProject, deleteMotionProject, getMotionProject,
  duplicateMotionProject, blankMotionProject, motionProjectFromTemplate,
  motionProjectFromPrompt, MOTION_PROJECTS_KEY,
  type MotionProject,
} from './motionProject';
import { MOTION_TEMPLATES, motionTemplateByKey } from '../data/motionTemplates';

function sampleProject(): MotionProject {
  return blankMotionProject('Vertical');
}

describe('motionProject — project model', () => {
  beforeEach(() => localStorage.clear());

  it('a blank project is a complete, editable MotionConfig', () => {
    const p = blankMotionProject('Landscape');
    expect(p.source).toBe('blank');
    expect(p.brief.aspect).toBe('Landscape');
    expect(p.brief.business.length).toBeGreaterThan(0);
    expect(p.brief.headline.length).toBeGreaterThan(0);
    expect(p.brief.subhead.length).toBeGreaterThan(0);
    expect(p.brief.cta.length).toBeGreaterThan(0);
    expect(p.brief.duration).toBe('medium');
    expect(p.palette).toHaveLength(3);
    expect(p.render.source).toBe('canvas');
    expect(p.render.tier).toBe('free');
  });

  it('a template project carries the template preset, palette and a unique id', () => {
    const t = motionTemplateByKey('aurora-glass') ?? MOTION_TEMPLATES[0];
    const a = motionProjectFromTemplate(t);
    const b = motionProjectFromTemplate(t);
    expect(a.templateKey).toBe(t.key);
    expect(a.name).toBe(t.name);
    // The preset wins on every field it defines...
    expect(a.brief).toMatchObject({ ...t.preset, business: 'NowOpen' });
    expect(a.palette).toEqual(t.palette);
    expect(a.id).not.toBe(b.id);
  });

  it('a template project still arrives with flyer content', () => {
    // A MotionTemplatePreset carries only the motion fields, so without the
    // defaults underneath it a business-flyer design template would render its
    // services column and contact strip empty — which reads as broken, not as
    // blank. Regression guard for that gap.
    const t = motionTemplateByKey('aurora-glass') ?? MOTION_TEMPLATES[0];
    const a = motionProjectFromTemplate(t);
    expect(a.brief.services?.length).toBeGreaterThan(0);
    expect(a.brief.contact?.length).toBeGreaterThan(0);
    expect(a.brief.stats?.length).toBeGreaterThan(0);
  });
});

describe('motionProject — persistence (nowopen_ prefixed)', () => {
  beforeEach(() => localStorage.clear());

  it('saves and reloads projects under the nowopen_ key', () => {
    const p = sampleProject();
    saveMotionProject(p);
    expect(localStorage.getItem(MOTION_PROJECTS_KEY)).toContain(p.id);
    expect(getMotionProject(p.id)).toEqual(p);
    expect(loadMotionProjects()).toHaveLength(1);
  });

  it('upserts by id — saving the same project never duplicates', () => {
    const p = sampleProject();
    saveMotionProject(p);
    saveMotionProject({ ...p, name: 'Edited' });
    const list = loadMotionProjects();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Edited');
  });

  it('duplicates a project with a new id and a draft status', () => {
    const p = motionProjectFromPrompt('Reel for a coffee shop opening next Friday');
    const copy = duplicateMotionProject(p);
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toContain('(copy)');
    expect(copy.status).toBe('draft');
    expect(copy.brief).toEqual(p.brief);
    expect(copy.palette).toEqual(p.palette);
  });

  it('deletes only the requested project', () => {
    const p1 = sampleProject();
    const p2 = blankMotionProject('Square');
    saveMotionProject(p1);
    saveMotionProject(p2);
    deleteMotionProject(p1.id);
    expect(getMotionProject(p1.id)).toBeNull();
    expect(getMotionProject(p2.id)).not.toBeNull();
  });

  it('ignores corrupt storage instead of crashing', () => {
    localStorage.setItem(MOTION_PROJECTS_KEY, 'not json at all');
    expect(loadMotionProjects()).toEqual([]);
  });

  it('normalises a legacy project that is missing brief fields', () => {
    const p = sampleProject();
    const { business: _business, ...restBrief } = p.brief;
    const legacy = { ...p, brief: { ...restBrief, subhead: '' } };
    localStorage.setItem(MOTION_PROJECTS_KEY, JSON.stringify([legacy]));

    const [loaded] = loadMotionProjects();
    expect(loaded.brief.business).toBe('NowOpen');
    expect(loaded.brief.subhead).toBe('Every business, open to the world');
  });
});

describe('motionProject — AI Director (local, deterministic)', () => {
  it('turns a 20% offer prompt into an offer project', () => {
    const a = motionProjectFromPrompt('Create a 15 second promotion for a Lagos restaurant offering 20% off this weekend.');
    const b = motionProjectFromPrompt('Create a 15 second promotion for a Lagos restaurant offering 20% off this weekend.');
    expect(a.id).toBe(b.id);
    expect(a.source).toBe('ai');
    expect(a.brief.business).toContain('Lagos');
    expect(a.brief.headline).toBe('20% OFF');
    expect(a.brief.cta).toBe('Claim the offer');
    expect(a.brief.subhead).toContain('weekend');
    expect(a.brief.logoEmoji).toBe('🍽️');
    expect(a.brief.aspect).toBe('Vertical');
    expect(a.brief.duration).toBe('medium');
  });

  it('detects a billboard as landscape and a grand opening as the headline', () => {
    const p = motionProjectFromPrompt('Billboard for Ember Hotel — grand opening, luxury rooms.');
    expect(p.brief.aspect).toBe('Landscape');
    expect(p.brief.headline).toBe('NOW OPEN');
    expect(p.brief.logoEmoji).toBe('🏨');
    expect(p.brief.business).toContain('Ember Hotel');
  });

  it('detects a countdown reel for a launch', () => {
    const p = motionProjectFromPrompt('Make a countdown reel for the app launch on Friday.');
    expect(p.brief.style).toBe('countdown');
    expect(p.brief.aspect).toBe('Vertical');
    expect(p.brief.headline).toBe('COMING SOON');
    expect(p.brief.cta).toBe('Get started');
  });

  it('maps long form to long duration and landscape sizes', () => {
    const p = motionProjectFromPrompt('A 20 second YouTube opener for a fashion boutique.');
    expect(p.brief.duration).toBe('long');
    expect(p.brief.aspect).toBe('Landscape');
    expect(p.brief.logoEmoji).toBe('🛍️');
  });

  it('scales up to extended and cinematic durations for longer briefs', () => {
    expect(motionProjectFromPrompt('A 30 second brand film for a restaurant.').brief.duration).toBe('extended');
    expect(motionProjectFromPrompt('A 40 second documentary opener for an agency.').brief.duration).toBe('cinematic');
  });

  it('falls back to NowOpen defaults for a vague prompt', () => {
    const p = motionProjectFromPrompt('Make it look cool');
    expect(p.brief.business).toBe('NowOpen');
    expect(p.brief.aspect).toBe('Vertical');
    expect(p.brief.style).toBe('motion-poster');
    expect(p.brief.cta.length).toBeGreaterThan(0);
  });
});
