import { describe, it, expect } from 'vitest';

import {
  liveShareUrl, liveBadge, liveSubline, formatWhen,
  liveShareMessage, whatsappShareLink, liveIsIndexable,
  livePosterPath, livePosterUrl, liveWatchUrl,
} from './liveShare';

const base = {
  streamId: 'abc123',
  title: 'Friday market walkthrough',
  businessName: 'Mama Put Kitchen',
  status: 'live' as const,
  siteUrl: 'https://nowopenafrica.com',
};

describe('liveShareUrl', () => {
  it('builds a short, typeable link', () => {
    expect(liveShareUrl('abc123')).toBe('https://nowopenafrica.com/live/abc123');
  });

  it('does not double the slash when the site url has a trailing one', () => {
    expect(liveShareUrl('abc123', 'https://staging.example.com/')).toBe(
      'https://staging.example.com/live/abc123',
    );
  });
});

describe('liveBadge', () => {
  it('only says LIVE when the stream really is', () => {
    // A card claiming LIVE over a finished broadcast is the fastest way to lose
    // someone's trust in a notification.
    expect(liveBadge('live')).toBe('LIVE NOW');
    expect(liveBadge('scheduled')).not.toContain('LIVE NOW');
    expect(liveBadge('ended')).not.toContain('LIVE NOW');
  });
});

describe('liveSubline', () => {
  it('invites people in while the stream is on', () => {
    expect(liveSubline(base)).toContain('broadcasting now');
    expect(liveSubline(base)).toContain('Mama Put Kitchen');
  });

  it('hides a viewer count that would read as nobody came', () => {
    // 0 watching is worse than silence, and 1 is usually the owner's own
    // second device.
    expect(liveSubline({ ...base, viewers: 0 })).not.toContain('watching');
    expect(liveSubline({ ...base, viewers: 1 })).not.toContain('watching');
    expect(liveSubline({ ...base, viewers: 24 })).toContain('24 watching');
  });

  it('says when a scheduled stream starts, and copes when it cannot', () => {
    const dated = liveSubline({ ...base, status: 'scheduled', scheduledFor: '2026-09-01T18:00:00Z' });
    expect(dated).toMatch(/goes live/);
    const undated = liveSubline({ ...base, status: 'scheduled', scheduledFor: null });
    expect(undated).toContain('going live soon');
  });

  it('offers the replay rather than pretending it is still on', () => {
    expect(liveSubline({ ...base, status: 'ended' })).toContain('finished');
  });

  it('survives a business with no name', () => {
    expect(liveSubline({ ...base, businessName: '  ' })).toContain('A NowOpen business');
  });
});

describe('formatWhen', () => {
  it('drops a date it cannot read rather than printing Invalid Date', () => {
    expect(formatWhen('not a date')).toBeNull();
    expect(formatWhen(null)).toBeNull();
    expect(formatWhen(undefined)).toBeNull();
  });

  it('formats a real timestamp', () => {
    expect(formatWhen('2026-09-01T18:00:00Z')).toBeTruthy();
  });
});

describe('liveShareMessage', () => {
  it('puts the link last, on its own line', () => {
    // WhatsApp only unfurls a preview for the FINAL url in a message, and
    // trailing punctuation gets swallowed into the href. Both turn a rich card
    // back into a bare blue link.
    const msg = liveShareMessage(base);
    const lines = msg.split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    expect(last).toBe(liveShareUrl(base.streamId));
    expect(last).toMatch(/[a-z0-9]$/i);
  });

  it('leads differently depending on whether it is on, coming or over', () => {
    expect(liveShareMessage(base)).toContain('live now');
    expect(liveShareMessage({ ...base, status: 'scheduled' })).toContain('going live');
    expect(liveShareMessage({ ...base, status: 'ended' })).toContain('replay');
  });
});

describe('whatsappShareLink', () => {
  it('encodes the whole message, newlines included', () => {
    const link = whatsappShareLink(base);
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(link).toContain('%0A');
    expect(decodeURIComponent(link.split('text=')[1])).toBe(liveShareMessage(base));
  });
});

describe('liveIsIndexable', () => {
  it('indexes a live broadcast and a replay that exists', () => {
    expect(liveIsIndexable('live', false)).toBe(true);
    expect(liveIsIndexable('ended', true)).toBe(true);
  });

  it('refuses a scheduled stream and an ended one with nothing to watch', () => {
    // A page about a broadcast that never happened is a dead end, and letting
    // search engines keep those is how a domain fills with them.
    expect(liveIsIndexable('scheduled', false)).toBe(false);
    expect(liveIsIndexable('ended', false)).toBe(false);
  });
});

describe('livePosterUrl', () => {
  it('derives the poster from the stream id, no column needed', () => {
    expect(livePosterPath('abc123')).toBe('live/abc123-poster.jpg');
    expect(livePosterUrl('https://xyz.supabase.co', 'abc123')).toBe(
      'https://xyz.supabase.co/storage/v1/object/public/business-images/live/abc123-poster.jpg',
    );
  });

  it('returns null rather than a half-built url when the project url is missing', () => {
    // The share function runs without env vars in preview deploys; a string
    // like "/storage/v1/..." in og:image is worse than no tag at all.
    expect(livePosterUrl('', 'abc123')).toBeNull();
    expect(livePosterUrl('https://xyz.supabase.co', '')).toBeNull();
  });
});

describe('liveWatchUrl', () => {
  it('lands on the live tab with the viewer already opening', () => {
    expect(liveWatchUrl('https://nowopenafrica.com/mama-put', 'abc123'))
      .toBe('https://nowopenafrica.com/mama-put?tab=live&watch=abc123');
  });

  it('appends to a url that already carries a query', () => {
    expect(liveWatchUrl('https://nowopenafrica.com/b?ref=x', 'abc123'))
      .toBe('https://nowopenafrica.com/b?ref=x&tab=live&watch=abc123');
  });
});
