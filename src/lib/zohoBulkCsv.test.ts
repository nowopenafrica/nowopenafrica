import { describe, it, expect } from 'vitest';

import { buildZohoBulkCsv, csvCell, zohoBulkText, zohoBulkTime, ZOHO_BULK_MAX_ROWS, type BulkPostInput } from './zohoBulkCsv';

const NOW = new Date('2026-10-29T08:00:00Z'); // 09:00 Lagos

const post = (over: Partial<BulkPostInput> = {}): BulkPostInput => ({
  contentId: 'c1',
  code: 'NOA-SOC-0001',
  campaignSlug: 'always-on',
  plannedAt: '2026-10-30T08:30:00Z', // 09:30 Lagos next day
  mediaUrl: null,
  destinationUrl: 'https://www.nowopenafrica.com/add-business',
  variants: [{ channel: 'facebook', caption: 'Your business deserves to be found. Add your business.' }],
  ...over,
});

describe('the format Zoho asks for', () => {
  it('writes Lagos wall-clock time as MM/DD/YYYY HH:MM with leading zeros', () => {
    expect(zohoBulkTime('2026-01-05T07:05:00Z')).toBe('01/05/2026 08:05');
    expect(zohoBulkTime('2026-10-28T23:30:00Z')).toBe('10/29/2026 00:30');
  });

  it('writes line breaks as a literal \\n', () => {
    expect(zohoBulkText('One\nTwo\r\nThree')).toBe('One\\nTwo\\nThree');
  });

  it('quotes every cell and doubles inner quotes', () => {
    expect(csvCell('Say "hi", Lagos')).toBe('"Say ""hi"", Lagos"');
  });

  it('puts columns in Zoho’s order with a header row', () => {
    const { csv, rows } = buildZohoBulkCsv([post()], NOW);
    const [header, first] = csv.trim().split('\r\n');
    expect(header).toBe('"Schedule Time","Channels","Post Content","Link","Media","GMB Button Name","GMB Link"');
    expect(rows).toHaveLength(1);
    expect(first.startsWith('"10/30/2026 09:30","Facebook","Your business deserves to be found. Add your business.","https://www.nowopenafrica.com/add-business?utm_source=facebook')).toBe(true);
    expect(first).toContain('utm_content=NOA-SOC-0001');
  });

  it('uses Zoho’s channel names', () => {
    const { rows } = buildZohoBulkCsv([post({ variants: [
      { channel: 'x', caption: 'Discover businesses near you.' },
      { channel: 'linkedin_profile', caption: 'Add your business to NowOpen Africa today.' },
      { channel: 'threads', caption: 'Find what’s open in Lagos right now.' },
    ] })], NOW);
    expect(rows.map((r) => r.cells[1])).toEqual(['X', 'LinkedInProfile', 'Threads']);
  });
});

describe('rows Zoho would reject are left out, with the reason', () => {
  it('skips a post with no planned time', () => {
    const r = buildZohoBulkCsv([post({ plannedAt: null })], NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/No planned time/);
  });

  it('skips a post less than an hour ahead', () => {
    const r = buildZohoBulkCsv([post({ plannedAt: '2026-10-29T08:50:00Z' })], NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/at least an hour/);
  });

  it('skips WhatsApp, which the Bulk Scheduler does not take', () => {
    const r = buildZohoBulkCsv([post({ variants: [{ channel: 'whatsapp', caption: 'Add your business.' }] })], NOW);
    expect(r.skipped[0].reason).toMatch(/not a Zoho Bulk Scheduler channel/);
  });

  it('skips a channel whose caption the checks block', () => {
    const r = buildZohoBulkCsv([post({ variants: [{ channel: 'facebook', caption: 'List your business today.' }] })], NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/Add your business/);
  });

  it('skips Instagram when the media is not a jpg the file can carry', () => {
    const r = buildZohoBulkCsv([post({ mediaUrl: 'https://x.co/a.png', variants: [{ channel: 'instagram', caption: 'Discover more.' }] })], NOW);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped[0].reason).toMatch(/jpg/);
  });

  it('skips a second row with the same wording', () => {
    const r = buildZohoBulkCsv([post(), post({ contentId: 'c2', code: 'NOA-SOC-0002', plannedAt: '2026-10-31T08:30:00Z' })], NOW);
    expect(r.rows).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/duplicates/);
  });

  it('stops at Zoho’s per-file limit', () => {
    const many = Array.from({ length: ZOHO_BULK_MAX_ROWS + 2 }, (_, i) => post({
      contentId: `c${i}`, code: `NOA-SOC-${i}`, variants: [{ channel: 'facebook', caption: `Discover business number ${i} near you.` }],
    }));
    const r = buildZohoBulkCsv(many, NOW);
    expect(r.rows).toHaveLength(ZOHO_BULK_MAX_ROWS);
    expect(r.skipped).toHaveLength(2);
  });
});

describe('media', () => {
  it('carries a public jpg', () => {
    const r = buildZohoBulkCsv([post({ mediaUrl: 'https://cdn.x/post.jpg', variants: [{ channel: 'instagram', caption: 'Discover more.' }] })], NOW);
    expect(r.rows[0].cells[4]).toBe('https://cdn.x/post.jpg');
  });

  it('leaves no preview link on Instagram, where links do not click', () => {
    const r = buildZohoBulkCsv([post({ mediaUrl: 'https://cdn.x/post.jpg', variants: [{ channel: 'instagram', caption: 'Discover more.' }] })], NOW);
    expect(r.rows[0].cells[3]).toBe('');
  });

  it('notes a png on a channel that does not need media, and keeps the row', () => {
    const r = buildZohoBulkCsv([post({ mediaUrl: 'https://cdn.x/post.png' })], NOW);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].cells[4]).toBe('');
    expect(r.notes[0].reason).toMatch(/Attach this media/);
  });
});
