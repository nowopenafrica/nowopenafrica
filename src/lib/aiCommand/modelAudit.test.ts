/**
 * Checking that the models we offer still exist.
 *
 * The assertion that matters is that UNVERIFIABLE is never reported as
 * retired. A provider with no key tells us nothing about its models, and
 * marking those retired would send an operator to remove working entries from
 * the dropdown on the strength of a missing environment variable.
 */

import { describe, it, expect } from 'vitest';

import {
  auditModels, auditSummary, providerOf, bareId, type ProviderCatalog,
} from './modelAudit';

const zen = (over: Partial<ProviderCatalog> = {}): ProviderCatalog => ({
  provider: 'zen',
  configured: true,
  reachable: true,
  models: ['deepseek-v4-pro', 'big-pickle'],
  ...over,
});

describe('attributing an id to a provider', () => {
  it('maps the UI prefix to the router name', () => {
    // The dropdown writes "opencode/", the router calls it "zen".
    expect(providerOf('opencode/deepseek-v4-pro')).toBe('zen');
    expect(providerOf('groq/llama-3.3-70b')).toBe('groq');
  });

  it('refuses to guess a provider for an unprefixed id', () => {
    expect(providerOf('deepseek-v4-pro')).toBeNull();
    expect(providerOf('/leading-slash')).toBeNull();
  });

  it('strips the prefix for comparison', () => {
    expect(bareId('opencode/deepseek-v4-pro')).toBe('deepseek-v4-pro');
    expect(bareId('no-prefix')).toBe('no-prefix');
  });
});

describe('unverifiable is not retired', () => {
  it('reports unknown when the provider has no key', () => {
    /*
     * THE ONE THAT MATTERS. A missing env var says nothing about whether a
     * model exists, and calling it retired would have an operator delete
     * working entries from the dropdown.
     */
    const rows = auditModels(['opencode/deepseek-v4-pro'], [zen({ configured: false, models: [] })]);
    expect(rows[0].verdict).toBe('unverifiable');
  });

  it('reports unknown when the catalogue could not be read', () => {
    const rows = auditModels(['opencode/deepseek-v4-pro'],
      [zen({ reachable: false, models: [], note: 'Catalogue request returned 503.' })]);
    expect(rows[0].verdict).toBe('unverifiable');
    expect(rows[0].detail).toMatch(/503/);
  });

  it('reports unknown for a provider that was never checked', () => {
    const rows = auditModels(['groq/llama-3.3-70b'], [zen()]);
    expect(rows[0].verdict).toBe('unverifiable');
  });
});

describe('it finds a retired id', () => {
  it('flags an id the provider answered about and does not list', () => {
    /*
     * The failure this exists for: llm.ts records Groq returning 404
     * model_not_found for the configured default on 2026-08-29, while the
     * health endpoint still read healthy.
     */
    const rows = auditModels(['opencode/laguna-s-2.1-free'], [zen()]);
    expect(rows[0].verdict).toBe('retired');
  });

  it('confirms an id the provider lists', () => {
    expect(auditModels(['opencode/big-pickle'], [zen()])[0].verdict).toBe('live');
  });

  it('accepts either spelling, because providers differ', () => {
    /*
     * OpenRouter echoes the prefix back, Groq does not. Comparing only one
     * way would report every model retired against one of them.
     */
    const prefixed = zen({ models: ['opencode/big-pickle'] });
    expect(auditModels(['opencode/big-pickle'], [prefixed])[0].verdict).toBe('live');
  });
});

describe('the summary an operator reads', () => {
  it('counts each verdict', () => {
    const rows = auditModels(
      ['opencode/big-pickle', 'opencode/gone', 'groq/unchecked'],
      [zen()],
    );
    expect(auditSummary(rows)).toEqual({ live: 1, retired: 1, unverifiable: 1 });
  });

  it('counts nothing for an empty list rather than throwing', () => {
    expect(auditSummary(auditModels([], [zen()]))).toEqual({ live: 0, retired: 0, unverifiable: 0 });
  });
});
