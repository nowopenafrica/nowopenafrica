import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

/**
 * The first code here that can message somebody who did not ask to hear from us.
 *
 * Two things are tested: that the sender cannot run by accident, and that the
 * way out works. The second matters more — a cold email whose unsubscribe is
 * broken is worse than one never sent, because the recipient believes they
 * have stopped it.
 */

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('../lib/seo', () => ({ applySeo: () => () => {} }));

import Unsubscribe from '../pages/Unsubscribe';

const SENDER = readFileSync('supabase/functions/claimreach-send/index.ts', 'utf8');

const draw = (token = 'camp:email:abc') =>
  render(
    <MemoryRouter initialEntries={[`/unsubscribe?t=${token}`]}>
      <Unsubscribe />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
});

describe('the sender cannot run by accident', () => {
  it('requires BOTH kill switches, read from the database each run', () => {
    // One switch is easy to leave flipped; a switch cached in the caller is
    // not a switch at all.
    expect(SENDER).toMatch(/REQUIRED_FLAGS = \[[^\]]*claim_outreach[^\]]*email_outreach_enabled[^\]]*\]/);
    expect(SENDER).toMatch(/from\("feature_flags"\)/);
  });

  it('refuses when no provider is configured', () => {
    /*
     * Reserving a batch we cannot deliver would leave rows queued for ever and
     * spend the daily cap on messages nobody received.
     */
    expect(SENDER).toMatch(/if \(!resendKey\)/);
  });

  it('defaults to a dry run, so sending must be asked for', () => {
    expect(SENDER).toMatch(/dryRun = body\?\.dryRun !== false/);
  });

  it('releases what a dry run reserved', () => {
    // Otherwise a rehearsal consumes the real cap and the frequency window for
    // businesses nobody contacted.
    expect(SENDER).toMatch(/if \(dryRun\)[\s\S]{0,400}?\.delete\(\)/);
  });

  it('never accepts a caller-supplied recipient list', () => {
    /*
     * The console's plan is a description made seconds ago. Recipients come
     * only from claimreach_claim_batch, which re-checks suppression,
     * provenance and frequency under a row lock.
     */
    expect(SENDER).toMatch(/rpc\("claimreach_claim_batch"/);
    expect(SENDER).not.toMatch(/body\?\.(recipients|contacts|emails)/);
  });

  it('caps a single invocation however much the caller asks for', () => {
    expect(SENDER).toMatch(/HARD_BATCH_CEILING = \d+/);
    expect(SENDER).toMatch(/Math\.min\(HARD_BATCH_CEILING/);
  });
});

describe('every message carries a working way out', () => {
  it('sets List-Unsubscribe so a mail client can offer it natively', () => {
    // Most recipients reach for the client's own button before a body link.
    expect(SENDER).toMatch(/"List-Unsubscribe":/);
    expect(SENDER).toMatch(/List-Unsubscribe=One-Click/);
  });

  it('puts an unsubscribe link in both the text and html parts', () => {
    expect(SENDER).toMatch(/const unsub = /);
    expect(SENDER.match(/\$\{unsub\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe('the unsubscribe page', () => {
  it('acts on arrival rather than asking again', async () => {
    /*
     * Somebody clicking "stop contacting me" has already decided. A
     * confirmation step is a dark pattern, and it breaks the One-Click
     * unsubscribe the message advertises.
     */
    draw();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('claimreach_unsubscribe', { p_token: 'camp:email:abc' }));
  });

  it('confirms in plain words, and says it does not expire', async () => {
    draw();
    await waitFor(() => expect(screen.getByText(/will not hear from us again/i)).toBeTruthy());
    expect(screen.getByText(/does not expire/i)).toBeTruthy();
  });

  it('reports the same thing for a token it has never seen', async () => {
    /*
     * The RPC returns true for an unknown token on purpose. A page that
     * distinguished real from fake would tell anyone who can guess whether an
     * address is on file.
     */
    draw('not-a-real-token');
    await waitFor(() => expect(screen.getByText(/will not hear from us again/i)).toBeTruthy());
  });

  it('does NOT claim success when the request failed', async () => {
    /*
     * The one case that must not be smoothed over. Telling somebody they are
     * unsubscribed and then emailing them again is a lie we would have told.
     */
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    draw();
    await waitFor(() => expect(screen.getByText(/did not go through/i)).toBeTruthy());
    expect(screen.queryByText(/will not hear from us again/i)).toBeNull();
  });

  it('says the listing stays, so unsubscribing is not a threat', async () => {
    draw();
    await waitFor(() => expect(screen.getByText(/listing stays on NowOpen/i)).toBeTruthy());
  });
});
