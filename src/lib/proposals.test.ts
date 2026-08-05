import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  Proposal, ProposalItem, PROPOSAL_STATUSES, PROPOSAL_VAT_RATE,
  proposalNumber, proposalTotals, formatMoney,
  suggestItems, proposalDocumentText, proposalBroadcastText,
  createProposal, proposalStatusLabel,
  loadProposals, saveProposals,
} from './proposals';

const biz = {
  id: '1',
  name: 'Meat Club',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  email: 'hello@meatclub.ng',
  address: '12 Marina, Lagos',
} as unknown as Business;

function items(): ProposalItem[] {
  return [
    { id: 'x', title: 'Catering package', description: 'Wedding set', qty: 2, unit: 'pkg', price: 50000 },
    { id: 'y', title: 'Delivery', description: 'Within Lagos', qty: 1, unit: 'trip', price: 5000 },
  ];
}

function prop(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 'p1',
    number: 'PR-2026-001',
    clientName: 'Ada',
    clientPhone: '080 1234 5678',
    clientEmail: 'ada@mail.com',
    validUntil: '2026-08-10',
    currency: '₦',
    items: items(),
    note: 'Prices valid for 7 days.',
    status: 'draft',
    createdAt: '2026-08-03T09:00:00.000Z',
    ...over,
  };
}

beforeEach(() => localStorage.clear());

describe('proposals — totals', () => {
  it('totals items and applies VAT', () => {
    const t = proposalTotals(items());
    expect(t.subtotal).toBe(105000);
    expect(t.vat).toBeCloseTo(105000 * PROPOSAL_VAT_RATE, 2);
    expect(t.total).toBeCloseTo(t.subtotal + t.vat, 2);
  });

  it('totals empty proposals to zero', () => {
    expect(proposalTotals([])).toEqual({ subtotal: 0, vat: 0, total: 0 });
  });

  it('formats money with the naira symbol', () => {
    expect(formatMoney(105000)).toContain('₦');
    expect(formatMoney(105000)).toContain('105,000');
  });
});

describe('proposals — content', () => {
  it('numbers proposals sequentially with the year', () => {
    expect(proposalNumber(0)).toMatch(/^PR-\d{4}-001$/);
    expect(proposalNumber(11)).toMatch(/^PR-\d{4}-012$/);
  });

  it('suggests a starter line item mentioning the business', () => {
    const s = suggestItems(biz);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].title).toContain('Meat Club');
  });

  it('renders the full document with client, totals and validity', () => {
    const doc = proposalDocumentText(prop(), biz);
    expect(doc).toContain('PR-2026-001');
    expect(doc).toContain('Ada');
    expect(doc).toContain('Catering package');
    expect(doc).toContain('VAT');
    expect(doc).toContain('TOTAL');
  });

  it('builds a WhatsApp broadcast with total and valid-until date', () => {
    const msg = proposalBroadcastText(prop(), biz);
    expect(msg).toContain('Meat Club');
    expect(msg).toContain('Ada');
    expect(msg).toContain('₦');
    expect(msg).toContain('Aug');
  });
});

describe('proposals — lifecycle & persistence', () => {
  it('creates a draft proposal with a future validity date', () => {
    const p = createProposal(0, { name: 'Tunde' });
    expect(p.status).toBe('draft');
    expect(p.clientName).toBe('Tunde');
    expect(p.validUntil > '2026-08-03').toBe(true);
  });

  it('labels every status', () => {
    for (const s of PROPOSAL_STATUSES) {
      expect(proposalStatusLabel(s.key)).toBe(s.label);
    }
  });

  it('saves and reloads proposals per business', () => {
    saveProposals('biz1', [prop()]);
    expect(loadProposals('biz1')).toHaveLength(1);
    expect(loadProposals('biz1')[0].number).toBe('PR-2026-001');
    expect(loadProposals('other')).toHaveLength(0);
  });
});
