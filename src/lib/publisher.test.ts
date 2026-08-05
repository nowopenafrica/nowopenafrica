import { describe, it, expect, beforeEach } from 'vitest';
import {
  SOCIAL_CHANNELS, PublishJob, PublisherState,
  channelLabel, channelShort, channelHome, connectedCount,
  nextDue, allDue, upcomingCount, publishedCount, scheduleLabel,
  createJob, toggleChannel, connectChannel, disconnectChannel,
  channelHandle, loadPublisher, savePublisher,
} from './publisher';

const job = (over: Partial<PublishJob>): PublishJob => ({
  id: 'j1',
  title: 'Weekend special',
  caption: 'Big deal this weekend',
  hashtags: '#WeekendDeals',
  scheduledAt: '2026-01-10T09:00:00',
  channels: ['instagram'],
  status: 'scheduled',
  createdAt: '2026-01-01T00:00:00',
  ...over,
});

describe('publisher', () => {
  beforeEach(() => localStorage.clear());

  it('labels every channel and has a home link', () => {
    for (const c of SOCIAL_CHANNELS) {
      expect(channelLabel(c.key)).toBe(c.label);
      expect(channelShort(c.key)).toBe(c.short);
      expect(channelHome(c.key)).toMatch(/^https:\/\//);
    }
  });

  it('finds the earliest due scheduled job', () => {
    const jobs = [
      job({ id: 'a', scheduledAt: '2026-01-10T10:00:00' }),
      job({ id: 'b', scheduledAt: '2026-01-10T08:00:00' }),
      job({ id: 'c', scheduledAt: '2026-01-12T08:00:00' }),
      job({ id: 'd', scheduledAt: '2026-01-09T08:00:00', status: 'published' }),
    ];
    const now = new Date('2026-01-11T00:00:00');
    expect(nextDue(jobs, now)?.id).toBe('b');
    expect(upcomingCount(jobs)).toBe(3);
    expect(publishedCount(jobs)).toBe(1);
  });

  it('returns null when nothing is due', () => {
    const jobs = [job({ scheduledAt: '2026-01-12T08:00:00' })];
    expect(nextDue(jobs, new Date('2026-01-11T00:00:00'))).toBeNull();
  });

  it('toggles a channel connection without touching others', () => {
    let state: PublisherState = { channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: false })), jobs: [] };
    state = toggleChannel(state, 'instagram');
    expect(state.channels.find((c) => c.key === 'instagram')?.connected).toBe(true);
    expect(connectedCount(state)).toBe(1);
    state = toggleChannel(state, 'instagram');
    expect(state.channels.find((c) => c.key === 'instagram')?.connected).toBe(false);
    expect(connectedCount(state)).toBe(0);
  });

  it('round-trips through localStorage and defaults cleanly', () => {
    const state: PublisherState = {
      channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: c.key === 'x' })),
      jobs: [job({})],
    };
    savePublisher('biz-1', state);
    const loaded = loadPublisher('biz-1');
    expect(loaded.jobs).toHaveLength(1);
    expect(loaded.jobs[0].status).toBe('scheduled');
    expect(loaded.channels.find((c) => c.key === 'x')?.connected).toBe(true);
    expect(loadPublisher('missing').jobs).toEqual([]);
    expect(loadPublisher('missing').channels).toHaveLength(SOCIAL_CHANNELS.length);
  });

  it('creates a scheduled job with a readable label', () => {
    const j = createJob({ title: 'Hi', caption: '', hashtags: '', scheduledAt: '2026-01-10T09:00:00', channels: ['facebook', 'threads'] });
    expect(j.status).toBe('scheduled');
    expect(j.channels).toEqual(['facebook', 'threads']);
    expect(scheduleLabel(j.scheduledAt)).toContain('2026');
  });

  it('snapshots the connected handles onto the job for publish-time links', () => {
    const j = createJob({
      title: 'Hi', caption: '', hashtags: '', scheduledAt: '2026-01-10T09:00:00',
      channels: ['instagram', 'x'],
      channelHandles: { instagram: 'cafe', x: 'cafe' },
    });
    expect(j.channelHandles).toEqual({ instagram: 'cafe', x: 'cafe' });
    expect(channelHome('instagram', j.channelHandles?.instagram)).toBe('https://www.instagram.com/cafe/');
    expect(channelHome('x', j.channelHandles?.x)).toBe('https://x.com/cafe');
    const plain = createJob({ title: 'Hi', caption: '', hashtags: '', scheduledAt: '2026-01-10T09:00:00', channels: ['x'] });
    expect(plain.channelHandles).toBeUndefined();
  });

  it('carries attached image and video media through the queue', () => {
    const img = createJob({ title: 'Photo post', caption: '', hashtags: '', scheduledAt: '2026-01-10T09:00:00', channels: ['instagram'], media: { name: 'offer.png', url: 'data:image/png;base64,AAAA', type: 'image' } });
    expect(img.media?.name).toBe('offer.png');
    expect(img.media?.type).toBe('image');
    expect(img.media?.url).toMatch(/^data:image\//);

    const vid = createJob({ title: 'Reel', caption: '', hashtags: '', scheduledAt: '2026-01-10T09:00:00', channels: ['tiktok'], media: { name: 'clip.mp4', url: 'data:video/mp4;base64,BBBB', type: 'video' } });
    expect(vid.media?.type).toBe('video');
    expect(vid.media?.url).toMatch(/^data:video\//);

    savePublisher('biz-1', { channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: false })), jobs: [vid] });
    expect(loadPublisher('biz-1').jobs[0].media).toEqual(vid.media);
  });

  it('creates a job without media when none is attached', () => {
    const j = createJob({ title: 'Text only', caption: 'Words', hashtags: '', scheduledAt: '2026-01-10T09:00:00', channels: ['x'] });
    expect(j.media).toBeUndefined();
  });

  it('connects a channel with a normalised handle', () => {
    let state: PublisherState = { channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: false })), jobs: [] };
    state = connectChannel(state, 'instagram', '@MyCafe');
    expect(state.channels.find((c) => c.key === 'instagram')?.connected).toBe(true);
    expect(channelHandle(state, 'instagram')).toBe('MyCafe');
    state = connectChannel(state, 'instagram', '');
    expect(state.channels.find((c) => c.key === 'instagram')?.handle).toBeUndefined();
  });

  it('disconnects a channel and drops its handle', () => {
    let state: PublisherState = { channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: false })), jobs: [] };
    state = connectChannel(state, 'x', 'BizHandle');
    state = disconnectChannel(state, 'x');
    expect(state.channels.find((c) => c.key === 'x')?.connected).toBe(false);
    expect(channelHandle(state, 'x')).toBeUndefined();
  });

  it('links published posts to the connected account handle', () => {
    expect(channelHome('instagram', '@cafe')).toBe('https://www.instagram.com/cafe/');
    expect(channelHome('tiktok', 'cafe')).toBe('https://www.tiktok.com/@cafe');
    expect(channelHome('x', '@cafe')).toBe('https://x.com/cafe');
    expect(channelHome('instagram')).toBe('https://www.instagram.com/');
    expect(channelHome('gmb', 'cafe')).toBe('https://www.google.com/business/');
  });

  it('lists every due job and lets nextDue pick the earliest', () => {
    const jobs = [
      job({ id: 'a', scheduledAt: '2026-01-10T10:00:00' }),
      job({ id: 'b', scheduledAt: '2026-01-10T08:00:00' }),
      job({ id: 'c', scheduledAt: '2026-01-12T08:00:00' }),
    ];
    const now = new Date('2026-01-11T00:00:00');
    expect(allDue(jobs, now).map((j) => j.id)).toEqual(['b', 'a']);
    expect(nextDue(jobs, now)?.id).toBe('b');
  });

  it('round-trips a connected handle through localStorage', () => {
    const state: PublisherState = {
      channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: false, handle: undefined })),
      jobs: [],
    };
    const connected = connectChannel(state, 'facebook', 'Acme Page');
    savePublisher('biz-1', connected);
    const loaded = loadPublisher('biz-1');
    expect(channelHandle(loaded, 'facebook')).toBe('Acme Page');
    expect(loaded.channels.find((c) => c.key === 'facebook')?.connected).toBe(true);
  });
});
