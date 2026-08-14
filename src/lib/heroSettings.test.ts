import { describe, it, expect } from 'vitest';
import {
  parseHeroSettings, heroBackground, DEFAULT_HERO, NOWOPEN_GRADIENT,
} from './heroSettings';

describe('parseHeroSettings', () => {
  it('defaults to video on with no colour override', () => {
    expect(DEFAULT_HERO).toEqual({ videoEnabled: true, bannerColor: null });
  });

  it('treats anything unreadable as the default rather than throwing', () => {
    // The row is jsonb and hand-editable in the Supabase dashboard, so bad
    // shapes are a realistic input, not a hypothetical one.
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(parseHeroSettings(bad)).toEqual(DEFAULT_HERO);
    }
  });

  it('only turns video off when explicitly false', () => {
    expect(parseHeroSettings({}).videoEnabled).toBe(true);
    expect(parseHeroSettings({ videoEnabled: false }).videoEnabled).toBe(false);
    expect(parseHeroSettings({ videoEnabled: true }).videoEnabled).toBe(true);
  });

  it('normalises a blank colour to null, so "unchanged" stays unchanged', () => {
    expect(parseHeroSettings({ bannerColor: '   ' }).bannerColor).toBeNull();
    expect(parseHeroSettings({ bannerColor: '' }).bannerColor).toBeNull();
    expect(parseHeroSettings({ bannerColor: 7 }).bannerColor).toBeNull();
    expect(parseHeroSettings({ bannerColor: ' #ff0000 ' }).bannerColor).toBe('#ff0000');
  });
});

describe('heroBackground', () => {
  it('keeps the NowOpen gradient when nothing has been changed', () => {
    expect(heroBackground(DEFAULT_HERO)).toBe(NOWOPEN_GRADIENT);
  });

  it('uses the chosen colour once video is off', () => {
    expect(heroBackground({ videoEnabled: false, bannerColor: '#0f172a' })).toBe('#0f172a');
  });

  it('still shows the gradient when video is off but no colour was picked', () => {
    expect(heroBackground({ videoEnabled: false, bannerColor: null })).toBe(NOWOPEN_GRADIENT);
  });

  it('ignores a colour while the video is on, since it could never be seen', () => {
    expect(heroBackground({ videoEnabled: true, bannerColor: '#ff0000' })).toBe(NOWOPEN_GRADIENT);
  });

  it('never returns an empty background, whatever the input', () => {
    // A blank here would paint the hero transparent and drop white-on-white text.
    for (const s of [DEFAULT_HERO, { videoEnabled: false, bannerColor: null }, { videoEnabled: false, bannerColor: '#000' }]) {
      expect(heroBackground(s).length).toBeGreaterThan(0);
    }
  });
});
