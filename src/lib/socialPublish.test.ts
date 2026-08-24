import { describe, it, expect } from 'vitest';
import { channelModeFor, type Capabilities } from './socialPublish';

// What a channel claims it can do is the one thing an owner cannot verify for
// themselves — they only find out weeks later that nothing was posted. These
// lock in that we never overstate a channel, and never understate one either.

const caps = (configured: Record<string, boolean>, supported: string[]): Capabilities => ({
  configured,
  supported,
  origin: 'https://nowopenafrica.com',
});

describe('channelModeFor', () => {
  it('is live only when a provider exists AND its credentials are set', () => {
    const c = caps({ instagram: true, facebook: false }, ['instagram', 'facebook', 'linkedin', 'x', 'tiktok']);
    expect(channelModeFor('instagram', c)).toBe('live');
  });

  it('is setup — never live — for a provider with no developer app', () => {
    const c = caps({ instagram: true, facebook: false }, ['instagram', 'facebook', 'linkedin', 'x', 'tiktok']);
    // facebook has a provider but no credentials, so it cannot post. Offering
    // a Connect button here is what let an owner think it was working.
    expect(channelModeFor('facebook', c)).toBe('setup');
    // Absent from `configured` entirely is the same situation.
    expect(channelModeFor('linkedin', c)).toBe('setup');
  });

  it('is manual for channels with no provider at all', () => {
    const c = caps({ instagram: true }, ['instagram', 'facebook', 'linkedin', 'x', 'tiktok']);
    for (const key of ['whatsapp-status', 'nowopen', 'gmb', 'pinterest', 'threads']) {
      expect(channelModeFor(key, c)).toBe('manual');
    }
  });

  it('is unknown — not manual — before the service has answered', () => {
    // The old fallback treated "we could not ask" as "cannot post", which told
    // an owner Instagram was reminder-only when the service was merely down.
    expect(channelModeFor('instagram', null)).toBe('unknown');
    expect(channelModeFor('pinterest', null)).toBe('unknown');
  });

  it('never reports live for an unsupported channel, whatever configured says', () => {
    // A stray `configured` entry must not promote a channel that has no
    // provider behind it.
    const c = caps({ pinterest: true }, ['instagram']);
    expect(channelModeFor('pinterest', c)).toBe('manual');
  });
});
