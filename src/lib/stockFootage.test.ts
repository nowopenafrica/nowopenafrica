import { describe, it, expect, beforeEach } from 'vitest';
import {
  orientationForAspect, footageQueryForScene, bestMp4ForAspect, pickClipForScene,
  getStockApiKey, hasStockApiKey, setStockApiKey, resolveFootage,
  type StockClip, type PexelsVideoFile,
} from './stockFootage';
import { VIDEO_INDUSTRIES, industryByKey } from './videoCreator';
import type { DirectorScene } from './creativeDirector';

const industry = industryByKey('restaurant');

function scene(over: Partial<DirectorScene> = {}): DirectorScene {
  return {
    id: 's1',
    order: 1,
    seconds: 4,
    text: 'Smoked to perfection',
    direction: 'Wide shot of the kitchen at peak service.',
    camera: 'Punch-in zoom',
    voiceover: 'Fresh off the grill.',
    transition: 'Cut',
    grading: 'Crisp',
    motion: 'Bold titles',
    ...over,
  };
}

function clip(over: Partial<StockClip> = {}): StockClip {
  return {
    id: 1,
    url: 'https://videos.pexels.com/video-files/1.mp4',
    preview: 'https://images.pexels.com/1.jpg',
    width: 1080,
    height: 1920,
    duration: 12,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('stockFootage — orientation', () => {
  it('maps render aspects to Pexels orientations', () => {
    expect(orientationForAspect('Vertical')).toBe('portrait');
    expect(orientationForAspect('Landscape')).toBe('landscape');
    expect(orientationForAspect('Square')).toBe('square');
  });
});

describe('stockFootage — query planning', () => {
  it('builds a deterministic query from the industry stock phrases', () => {
    const a = footageQueryForScene(industry, scene(), 0, 'Commercial');
    const b = footageQueryForScene(industry, scene(), 0, 'Commercial');
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(industry.stock.some((s) => a.includes(s))).toBe(true);
  });

  it('varies across scenes from the same brief', () => {
    const q0 = footageQueryForScene(industry, scene({ id: 's0', order: 1 }), 0, 'Commercial');
    const q1 = footageQueryForScene(industry, scene({ id: 's1', order: 2 }), 1, 'Commercial');
    expect(q0).not.toBe(q1);
  });

  it('falls back to the setting phrase when an industry has no stock list', () => {
    const bare = { ...industry, stock: [] };
    const q = footageQueryForScene(bare, scene(), 0, 'Commercial');
    expect(q.length).toBeGreaterThan(0);
  });
});

describe('stockFootage — file selection', () => {
  it('prefers mp4 files matching the target orientation', () => {
    const mixed: PexelsVideoFile[] = [
      { id: 1, quality: 'hd', file_type: 'video/mp4', width: 1920, height: 1080, link: 'https://videos.pexels.com/landscape.mp4' },
      { id: 2, quality: 'hd', file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://videos.pexels.com/portrait.mp4' },
    ];
    expect(bestMp4ForAspect(mixed, 'Vertical')).toBe('https://videos.pexels.com/portrait.mp4');
    expect(bestMp4ForAspect(mixed, 'Landscape')).toBe('https://videos.pexels.com/landscape.mp4');
  });

  it('ignores hls and non-mp4 entries and falls back to any mp4', () => {
    const mixed: PexelsVideoFile[] = [
      { id: 1, quality: 'hls', file_type: 'video/mp4', width: 1080, height: 1920, link: 'https://videos.pexels.com/hls.mp4' },
      { id: 2, quality: 'sd', file_type: 'application/x-mpegURL', width: 0, height: 0, link: 'https://videos.pexels.com/playlist.m3u8' },
      { id: 3, quality: 'hd', file_type: 'video/mp4', width: 1280, height: 720, link: 'https://videos.pexels.com/sd.mp4' },
    ];
    expect(bestMp4ForAspect(mixed, 'Vertical')).toBe('https://videos.pexels.com/sd.mp4');
  });

  it('returns an empty string when nothing is usable', () => {
    expect(bestMp4ForAspect([], 'Vertical')).toBe('');
    expect(bestMp4ForAspect([{ id: 1, quality: 'hd', file_type: 'video/webm', width: 1080, height: 1920, link: 'x' }], 'Vertical')).toBe('');
  });
});

describe('stockFootage — deterministic clip pick', () => {
  it('picks the same clip for the same scene', () => {
    const clips = [clip({ id: 1 }), clip({ id: 2 }), clip({ id: 3 })];
    expect(pickClipForScene(clips, scene(), 0)).toBe(pickClipForScene(clips, scene(), 0));
  });

  it('throws when there are no clips', () => {
    expect(() => pickClipForScene([], scene(), 0)).toThrow();
  });
});

describe('stockFootage — API key', () => {
  it('persists a pasted key to localStorage', () => {
    expect(hasStockApiKey()).toBe(false);
    setStockApiKey('pexels-abc-123');
    expect(hasStockApiKey()).toBe(true);
    expect(getStockApiKey()).toBe('pexels-abc-123');
  });

  it('treats a blank key as missing', () => {
    setStockApiKey('   ');
    expect(hasStockApiKey()).toBe(false);
  });
});

describe('stockFootage — resolve', () => {
  it('returns an empty map without a key instead of fetching', async () => {
    const map = await resolveFootage({ industry, scenes: [scene()], directionLabel: 'Commercial', aspect: 'Vertical' });
    expect(map).toEqual({});
  });
});

describe('stockFootage — industry fixtures', () => {
  it('every industry ships curated stock phrases for filming', () => {
    for (const ind of VIDEO_INDUSTRIES) {
      expect(ind.stock.length).toBeGreaterThanOrEqual(3);
    }
  });
});
