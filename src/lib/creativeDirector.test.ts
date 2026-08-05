import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  buildCreativeBrief, regenerateScene, directorPackText, directorReview,
  CREATIVE_DIRECTIONS, directionByKey, directionLetter,
  saveDirectorBrief, loadDirectorBriefs, getDirectorBrief, deleteDirectorBrief,
  buildDirectorBriefRecord, directorKey, type DirectorBriefSettings,
} from './creativeDirector';

const biz: Business = {
  id: 'biz-1',
  name: 'Meat Club',
  description: 'Smoked meats and grills.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  logo_url: 'https://img/logo.png',
  rating: 4.6,
};

describe('creativeDirector — creative brief', () => {
  it('builds a complete deterministic brief from a one-liner', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special with a discount on instagram', 'commercial');
    const b = buildCreativeBrief(biz, 'Weekend grill special with a discount on instagram', 'commercial');

    expect(a.objective.toLowerCase()).toContain('sales');
    expect(a.audience.toLowerCase()).toContain('lagos');
    expect(a.message).toContain('Meat Club');
    expect(a.offer.length).toBeGreaterThan(0);
    expect(a.storyline.length).toBeGreaterThan(0);
    expect(a.scenes.length).toBe(a.video.scenes.length);
    expect(a.script.split('\n').length).toBe(a.scenes.filter((s) => s.voiceover).length);
    expect(a.video.hook).toBe(a.hook);
    expect(a.hook).toBe(b.hook);
    expect(a.review.overall).toBe(b.review.overall);
    expect(a.directionLabel).toBe('Commercial');
  });

  it('every scene is enriched with camera, grading and motion', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special', 'cinematic');
    for (const s of a.scenes) {
      expect(s.camera.length).toBeGreaterThan(0);
      expect(s.grading.length).toBeGreaterThan(0);
      expect(s.motion.length).toBeGreaterThan(0);
      expect(s.direction.length).toBeGreaterThan(0);
      expect(s.seconds).toBeGreaterThan(0);
    }
    expect(a.scenes[a.scenes.length - 1].motion.toLowerCase()).toContain('logo');
  });

  it('pins the goal from the brief and carries it into the objective', () => {
    const a = buildCreativeBrief(biz, 'We want more table bookings this month', 'luxury');
    expect(a.plan.recommendation.goal).toBe('bookings');
    expect(a.objective.toLowerCase()).toContain('book');
  });
});

describe('creativeDirector — five directions', () => {
  it('exposes all five pitches with unique styles', () => {
    expect(CREATIVE_DIRECTIONS).toHaveLength(5);
    const labels = CREATIVE_DIRECTIONS.map((d) => d.label);
    expect(labels).toEqual(['Luxury', 'Cinematic', 'Funny', 'Emotional', 'Commercial']);
    const styles = new Set(CREATIVE_DIRECTIONS.map((d) => d.style));
    expect(styles.size).toBeGreaterThan(1);
    expect(CREATIVE_DIRECTIONS.map((d) => d.key).sort()).toEqual(
      ['cinematic', 'commercial', 'emotional', 'funny', 'luxury'],
    );
  });

  it('gives each version a letter and a distinct brief', () => {
    const letters = CREATIVE_DIRECTIONS.map((d) => directionLetter(d.key));
    expect(letters).toEqual(['A', 'B', 'C', 'D', 'E']);
    const briefs = CREATIVE_DIRECTIONS.map((d) =>
      buildCreativeBrief(biz, 'Promote my restaurant for the weekend', d.key));
    expect(new Set(briefs.map((b) => b.directionLabel)).size).toBe(5);
    expect(new Set(briefs.map((b) => b.video.music)).size).toBeGreaterThan(1);
  });

  it('directionByKey falls back to Luxury', () => {
    expect(directionByKey('luxury' as never).label).toBe('Luxury');
  });
});

describe('creativeDirector — director review', () => {
  it('scores everything within range and computes an overall', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special with a discount on instagram', 'funny');
    const r = a.review;
    for (const k of ['hookStrength', 'visualQuality', 'brandConsistency', 'customerAttention', 'cta'] as const) {
      expect(r[k]).toBeGreaterThanOrEqual(2);
      expect(r[k]).toBeLessThanOrEqual(9.9);
    }
    expect(r.overall).toBeGreaterThanOrEqual(2);
    expect(r.overall).toBeLessThanOrEqual(9.9);
    expect(r.suggestions.length).toBeGreaterThanOrEqual(5);
    expect(r.suggestions.length).toBeLessThanOrEqual(8);
  });

  it('a well-stocked profile with a phone earns a high brand/CTA score', () => {
    const r = directorReview(
      biz,
      buildCreativeBrief(biz, 'Weekend grill special', 'commercial').video,
      buildCreativeBrief(biz, 'Weekend grill special', 'commercial').scenes,
      100,
      true,
    );
    expect(r.brandConsistency).toBeGreaterThan(8);
    expect(r.cta).toBeGreaterThan(8);
  });
});

describe('creativeDirector — regenerate only one scene', () => {
  it('keeps every other scene identical', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special', 'cinematic');
    const replaced = regenerateScene(biz, a, 4, 1);

    expect(replaced.order).toBe(4);
    expect(a.scenes.map((s) => s.id)).toContain(replaced.id);
    for (const s of a.scenes) {
      if (s.order === 4) continue;
      const again = a.scenes.find((x) => x.id === s.id)!;
      expect(s).toEqual(again);
    }
    expect(replaced.voiceover.length).toBeGreaterThan(0);
  });

  it('regeneration is deterministic per attempt', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special', 'emotional');
    const r1 = regenerateScene(biz, a, 2, 3);
    const r2 = regenerateScene(biz, a, 2, 3);
    const r3 = regenerateScene(biz, a, 2, 4);
    expect(r1).toEqual(r2);
    expect(r1.order).toBe(2);
    expect(r1.camera).toBe(r2.camera);
    expect(r3.camera).not.toBe(r2.camera);
  });

  it('falls back gracefully for an out-of-range scene', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special', 'commercial');
    const r = regenerateScene(biz, a, 99, 1);
    expect(r.order).toBe(99);
    expect(r.seconds).toBeGreaterThan(0);
    expect(r.camera.length).toBeGreaterThan(0);
  });
});

describe('creativeDirector — pack export', () => {
  it('assembles the full brief handed to the generator', () => {
    const a = buildCreativeBrief(biz, 'Weekend grill special with a discount on instagram', 'commercial');
    const text = directorPackText(biz, a);

    expect(text).toContain('AI CREATIVE DIRECTOR — CREATIVE BRIEF');
    expect(text).toContain('Version E — Commercial');
    expect(text).toContain('STORYBOARD');
    expect(text).toContain(`Scene 1`);
    expect(text).toContain('SCRIPT');
    expect(text).toContain('CAPTION');
    expect(text).toContain('CREATIVE DIRECTOR REVIEW');
    expect(text).toContain('RENDER SETTINGS');
    expect(text.toLowerCase()).toContain('instagram');
    expect(text).toContain(a.hook);
    expect(text).toContain(a.cta);
    expect(text).toContain(String(a.review.overall));
  });

  it('honours manual overrides and drops them into the pack', () => {
    const a = buildCreativeBrief(biz, 'Promote my restaurant this weekend', 'funny');
    const text = directorPackText(biz, a, {
      quality: '4K',
      length: 60,
      format: 'MOV',
      aspect: 'Square',
      hook: 'Custom hook here',
      titles: 'neon',
      logoAnimation: false,
      media: [],
    });
    expect(text).toContain('Quality: 4K');
    expect(text).toContain('Length: 60s');
    expect(text).toContain('Container: MOV');
    expect(text).toContain('Aspect: Square');
    expect(text).toContain('Custom hook here');
    expect(text).toContain('Titles: neon · Logo animation: off · Callouts: off');
  });

  it('adds the season campaign block when the brief matches one', () => {
    const a = buildCreativeBrief(biz, 'Black Friday offer for my restaurant', 'commercial');
    const text = directorPackText(biz, a);
    expect(text).toContain('SEASON CAMPAIGN');
    expect(text).toContain('Black Friday');
  });
});

describe('creativeDirector — brief persistence alongside projects', () => {
  const settings: DirectorBriefSettings = {
    voiceover: 'female-nigerian',
    titles: 'apple',
    logoAnimation: true,
    callouts: true,
    transitionPref: 'Auto',
    quality: '1080p',
    length: 30,
    container: 'MP4',
    aspect: 'Vertical',
  };

  beforeEach(() => localStorage.clear());

  it('saves and reloads a brief keyed by project id', () => {
    const brief = buildCreativeBrief(biz, 'Weekend grill special on instagram', 'commercial');
    const record = buildDirectorBriefRecord('proj-1', biz.id, brief, settings);

    saveDirectorBrief(biz.id, record);

    expect(getDirectorBrief(biz.id, 'proj-1')).toEqual(record);
    expect(getDirectorBrief(biz.id, 'missing')).toBeNull();
    expect(loadDirectorBriefs(biz.id)).toHaveLength(1);
  });

  it('upserts by project id — never duplicates a brief', () => {
    const brief = buildCreativeBrief(biz, 'Weekend grill special on instagram', 'commercial');
    saveDirectorBrief(biz.id, buildDirectorBriefRecord('proj-1', biz.id, brief, settings));
    saveDirectorBrief(biz.id, buildDirectorBriefRecord('proj-1', biz.id, { ...brief, briefText: 'edited brief' }, settings));

    const list = loadDirectorBriefs(biz.id);
    expect(list).toHaveLength(1);
    expect(list[0].brief.briefText).toBe('edited brief');
  });

  it('stores the full director state so a reloaded project can restore the brain', () => {
    const brief = buildCreativeBrief(biz, 'Black Friday offer for my restaurant', 'funny');
    const record = buildDirectorBriefRecord('proj-2', biz.id, brief, settings);
    saveDirectorBrief(biz.id, record);

    const restored = getDirectorBrief(biz.id, 'proj-2');
    expect(restored).not.toBeNull();
    expect(restored!.brief.scenes).toHaveLength(brief.scenes.length);
    expect(restored!.brief.review.overall).toBe(brief.review.overall);
    expect(restored!.brief.direction).toBe('funny');
    expect(restored!.settings.aspect).toBe('Vertical');
    expect(restored!.projectId).toBe('proj-2');
  });

  it('keeps projects from different businesses isolated', () => {
    const brief = buildCreativeBrief(biz, 'Weekend grill special', 'luxury');
    saveDirectorBrief(biz.id, buildDirectorBriefRecord('p', biz.id, brief, settings));
    expect(loadDirectorBriefs('other-biz')).toHaveLength(0);
    expect(directorKey('other-biz')).not.toBe(directorKey(biz.id));
  });

  it('deletes only the requested brief', () => {
    const brief = buildCreativeBrief(biz, 'Weekend grill special', 'emotional');
    saveDirectorBrief(biz.id, buildDirectorBriefRecord('p1', biz.id, brief, settings));
    saveDirectorBrief(biz.id, buildDirectorBriefRecord('p2', biz.id, brief, settings));

    deleteDirectorBrief(biz.id, 'p1');

    expect(getDirectorBrief(biz.id, 'p1')).toBeNull();
    expect(getDirectorBrief(biz.id, 'p2')).not.toBeNull();
  });

  it('survives a round-trip through JSON like localStorage', () => {
    const brief = buildCreativeBrief(biz, 'Weekend grill special', 'cinematic');
    const record = buildDirectorBriefRecord('proj-9', biz.id, brief, settings);
    localStorage.setItem(directorKey(biz.id), JSON.stringify([record]));

    const loaded = loadDirectorBriefs(biz.id);
    expect(loaded[0].brief.video.title).toBe(brief.video.title);
    expect(loaded[0].brief.scenes[0].camera).toBe(brief.scenes[0].camera);
  });
});
