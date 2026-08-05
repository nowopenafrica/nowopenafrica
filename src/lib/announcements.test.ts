import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  Announcement,
  ANNOUNCEMENT_TYPES, announcementLabel,
  announcementDraft, announcementPreview, createAnnouncement,
  loadAnnouncements, saveAnnouncements,
} from './announcements';

const biz = {
  id: '1',
  name: 'Meat Club',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  hours: '9am – 10pm',
} as unknown as Business;

beforeEach(() => localStorage.clear());

describe('announcements — drafting', () => {
  it('pre-writes every announcement type from the profile', () => {
    for (const t of ANNOUNCEMENT_TYPES) {
      const d = announcementDraft(biz, t.key);
      expect(d.title.length).toBeGreaterThan(3);
      expect(d.body.length).toBeGreaterThan(3);
    }
  });

  it('mentions the business name in the draft', () => {
    const d = announcementDraft(biz, 'new-branch');
    expect(d.title).toContain('Meat Club');
  });

  it('creates a complete, editable announcement', () => {
    const a = createAnnouncement(biz, 'hiring', { title: 'We need a chef', body: 'Join our kitchen team.', date: '2026-08-05', pinned: true });
    expect(a.type).toBe('hiring');
    expect(a.title).toBe('We need a chef');
    expect(a.body).toBe('Join our kitchen team.');
    expect(a.date).toBe('2026-08-05');
    expect(a.pinned).toBe(true);
    expect(a.publishedAt).toBeNull();
    expect(a.id.length).toBeGreaterThan(3);
  });

  it('falls back to the drafted text when fields are empty', () => {
    const a = createAnnouncement(biz, 'thank-you');
    expect(a.body.length).toBeGreaterThan(3);
  });
});

describe('announcements — preview & persistence', () => {
  it('formats the announcement like a profile post with a sign-off', () => {
    const a = createAnnouncement(biz, 'new-product', { title: 'New platter', body: 'Try our new platter.', date: '2026-08-01' });
    const text = announcementPreview(biz, a);
    expect(text).toContain('New platter');
    expect(text).toContain('Try our new platter.');
    expect(text).toContain('Meat Club');
  });

  it('labels every type', () => {
    for (const t of ANNOUNCEMENT_TYPES) {
      expect(announcementLabel(t.key)).toContain(t.label);
    }
  });

  it('saves and reloads announcements per business', () => {
    const a = createAnnouncement(biz, 'closure');
    saveAnnouncements('biz1', [a]);
    expect(loadAnnouncements('biz1')).toHaveLength(1);
    expect((loadAnnouncements('biz1')[0] as Announcement).type).toBe('closure');
    expect(loadAnnouncements('other')).toHaveLength(0);
  });
});
