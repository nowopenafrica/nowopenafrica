import { describe, it, expect } from 'vitest';
import {
  ADMIN_SECTIONS, ADMIN_GROUPS, sectionById,
  commandCenterStats, aiRecommendations, scanPipelineLocal, growthModuleToSection,
  type CommandRaw,
} from './adminCreator';

const raw: CommandRaw = {
  users: [
    { created_at: new Date().toISOString(), plan_status: 'trialing' },
    { created_at: '2026-01-01T10:00:00Z' },
  ],
  businesses: [
    { verified: true, created_at: new Date().toISOString(), category: 'Restaurant' },
    { verified: false, created_at: '2026-01-01T10:00:00Z', category: 'Fashion' },
    { verified: true, created_at: '2026-01-01T10:00:00Z', category: 'Beauty' },
  ],
  payments: [
    { status: 'paid', amount_local: 5000, currency: 'NGN', created_at: new Date().toISOString() },
    { status: 'paid', amount_local: 2500, currency: 'NGN', created_at: '2026-01-01T10:00:00Z' },
    { status: 'pending', amount_local: 1000, currency: 'NGN', created_at: new Date().toISOString() },
  ],
  verificationDocs: [{ status: 'pending' }, { status: 'approved' }],
  registrations: [{ status: 'open' }],
  enquiries: [{ id: 'e1' }],
  waitlist: [{ invited: true }, { invited: false }],
  scheduledPosts: 4,
  publishedPosts: 12,
  videoQueue: 2,
  campaigns: 3,
  uptime: 99.9,
};

describe('adminCreator — section map', () => {
  it('covers all 24 roadmap sections across the seven groups', () => {
    expect(ADMIN_SECTIONS).toHaveLength(24);
    expect(new Set(ADMIN_SECTIONS.map((s) => s.id)).size).toBe(24);
    ADMIN_GROUPS.forEach((g) => expect(ADMIN_SECTIONS.some((s) => s.group === g)).toBe(true));
  });

  it('ships every department live', () => {
    expect(ADMIN_SECTIONS.every((s) => s.status === 'live')).toBe(true);
    expect(ADMIN_SECTIONS.filter((s) => s.status === 'soon').length).toBe(0);
    expect(sectionById('command')?.status).toBe('live');
    expect(sectionById('social')?.status).toBe('live');
    expect(sectionById('founder')?.status).toBe('live');
    expect(sectionById('knowledge')?.status).toBe('live');
  });

  it('routes Studio modules to their department, others to null', () => {
    expect(growthModuleToSection('copywriter')).toBe('content-factory');
    expect(growthModuleToSection('planner')).toBe('social');
    expect(growthModuleToSection('assistant')).toBe('brand-director');
    expect(growthModuleToSection('loyalty')).toBeNull();
  });

  it('looks sections up by id safely', () => {
    expect(sectionById('nope')).toBeUndefined();
  });
});

describe('adminCreator — command center stats', () => {
  it('aggregates platform counts and today metrics', () => {
    const s = commandCenterStats(raw);
    expect(s.totalBusinesses).toBe(3);
    expect(s.businessesToday).toBe(1);
    expect(s.verifiedBusinesses).toBe(2);
    expect(s.totalUsers).toBe(2);
    expect(s.usersToday).toBe(1);
    expect(s.topCategory).toBe('Restaurant');
  });

  it('sums only paid revenue from today', () => {
    const s = commandCenterStats(raw);
    expect(s.paidPayments).toBe(2);
    expect(s.revenueToday).toBe(5000);
  });

  it('counts every open approval queue', () => {
    const s = commandCenterStats(raw);
    expect(s.pendingApprovals).toBe(1 + 1 + 1 + 1);
  });

  it('carries internal content pipeline numbers through', () => {
    const s = commandCenterStats(raw);
    expect(s.scheduledPosts).toBe(4);
    expect(s.publishedPosts).toBe(12);
    expect(s.videoQueue).toBe(2);
    expect(s.campaigns).toBe(3);
    expect(s.openSupport).toBe(1);
    expect(s.uptime).toBe(99.9);
  });
});

describe('adminCreator — local pipeline scanner', () => {
  const store = (entries: Record<string, string>) => ({
    getItem: (key: string) => (key in entries ? entries[key] : null),
  });

  it('counts scheduled and published jobs across publisher stores', () => {
    const r = scanPipelineLocal(store({
      nowopen_publisher_b1: JSON.stringify({ jobs: [
        { status: 'scheduled' }, { status: 'scheduled' }, { status: 'published' },
      ] }),
      nowopen_publisher_b2: JSON.stringify({ jobs: [{ status: 'published' }] }),
      unrelated_key: '{"jobs":[{ "status": "published" }]}',
    }).getItem, ['nowopen_publisher_b1', 'nowopen_publisher_b2', 'unrelated_key']);
    expect(r.scheduledPosts).toBe(2);
    expect(r.publishedPosts).toBe(2);
  });

  it('counts video projects still in the production queue', () => {
    const r = scanPipelineLocal(store({
      nowopen_videos_b1: JSON.stringify([
        { status: 'draft' }, { status: 'rendering' }, { status: 'published' },
      ]),
      nowopen_videos_b2: JSON.stringify([{ status: 'draft' }]),
    }).getItem, ['nowopen_videos_b1', 'nowopen_videos_b2']);
    expect(r.videoQueue).toBe(3);
  });

  it('counts campaign arrays and ignores corrupt entries', () => {
    const r = scanPipelineLocal(store({
      nowopen_campaigns_b1: JSON.stringify([{ id: 'a' }, { id: 'b' }]),
      nowopen_campaigns_b2: JSON.stringify([{ id: 'c' }]),
      nowopen_publisher_broken: '{not json',
    }).getItem, ['nowopen_campaigns_b1', 'nowopen_campaigns_b2', 'nowopen_publisher_broken']);
    expect(r.campaigns).toBe(3);
    expect(r.scheduledPosts).toBe(0);
  });
});

describe('adminCreator — AI briefing', () => {
  it('writes a data-driven briefing', () => {
    const lines = aiRecommendations(commandCenterStats(raw), new Date());
    expect(lines.join('\n')).toContain('onboarded today');
    expect(lines.join('\n')).toContain('Revenue today: ₦5,000');
    expect(lines.join('\n')).toContain('approval');
    expect(lines.join('\n')).toContain('Restaurant is trending');
  });

  it('stays sensible on an empty day', () => {
    const empty = commandCenterStats({
      users: [], businesses: [], payments: [], verificationDocs: [],
      registrations: [], enquiries: [], waitlist: [],
      scheduledPosts: 0, publishedPosts: 0, videoQueue: 0, campaigns: 0, uptime: 99.9,
    });
    const lines = aiRecommendations(empty, new Date('2026-08-07T12:00:00Z'));
    const text = lines.join('\n');
    expect(text).toContain('No new businesses yet today');
    expect(text).toContain('No paid orders yet today');
    expect(text).toContain('Approval queue is clear');
  });
});
