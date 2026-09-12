import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_MODEL_GROUPS, DEFAULT_AI_MODEL, isZenModel, knownModel, loadPreferredModel, persistPreferredModel,
} from './models';

describe('aiCommand model registry', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('offers the free and curated groups with unique, known ids', () => {
    const labels = AI_MODEL_GROUPS.map((g) => g.label);
    expect(labels).toContain('Free');
    expect(labels).toContain('Curated (pay-as-you-go)');

    const ids = AI_MODEL_GROUPS.flatMap((g) => g.models.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_AI_MODEL);
    for (const id of ids) {
      expect(isZenModel(id)).toBe(true);
      expect(knownModel(id)).toBe(true);
    }
  });

  it('loadPreferredModel returns the default when nothing is stored', () => {
    expect(loadPreferredModel()).toBe(DEFAULT_AI_MODEL);
  });

  it('persists and reloads a known preference', () => {
    persistPreferredModel('opencode/north-mini-code-free');
    expect(loadPreferredModel()).toBe('opencode/north-mini-code-free');
  });

  it('ignores unknown ids on both save and load', () => {
    persistPreferredModel('opencode/not-real');
    expect(localStorage.getItem('nowopen_ai_command_model')).toBeNull();
    expect(loadPreferredModel()).toBe(DEFAULT_AI_MODEL);
  });
});