import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, type DesignTemplate, type SlotRole } from '../designTemplates';
import { FORMATS, type Format } from '../design/formats';
import { isListed } from './needs';
import { BADGE_LABELS, cardBadges, cardFacts } from './templateCard';

const LISTED = DESIGN_TEMPLATES.filter(isListed);
const TODAY = '2026-11-08';
const CARD = LISTED.find((t) => t.key === 'card-minimal')!;

describe('cardFacts', () => {
  it('names the design, its subcategory, its format and one line', () => {
    const f = cardFacts(CARD);
    expect(f.name).toBe(CARD.label);
    expect(f.subcategory).toBe('Business card');
    expect(f.format).toBe(FORMATS['business-card'].label);
    expect(f.line).toBe(CARD.desc);
    expect(f.direction).toBeNull();
  });

  it('names the direction only when one is set', () => {
    expect(cardFacts({ ...CARD, direction: 'luxury' }).direction).toBe('Luxury');
  });

  it('keeps the one line to one line', () => {
    expect(cardFacts({ ...CARD, desc: 'First line\nsecond line' }).line).toBe('First line second line');
  });
});

describe('cardBadges', () => {
  it('has no "Print-ready" badge in P2, under any input', () => {
    expect(Object.values(BADGE_LABELS).join(' ')).not.toMatch(/print/i);
    for (const t of LISTED) expect(cardBadges(t, TODAY).map((b) => BADGE_LABELS[b]).join(' ')).not.toMatch(/print/i);
  });

  it('says "Editable" only when C7 passes', () => {
    expect(cardBadges(CARD, TODAY)).toContain('editable');
    const uneditable: DesignTemplate = {
      ...CARD,
      slots: [...CARD.slots, { ...CARD.slots[0], role: 'tagline' as SlotRole }],
    };
    expect(cardBadges(uneditable, TODAY)).not.toContain('editable');
  });

  it('never says "Platform size" today: no format is verified', () => {
    for (const t of LISTED) expect(cardBadges(t, TODAY), t.key).not.toContain('platform-size');
  });

  it('says "Platform size" only while the format\'s verification is current', () => {
    const post = LISTED.find((t) => t.key === 'app-download')!;
    const verified: Format = { ...FORMATS['instagram-post'], verifiedAt: '2026-10-01' };
    expect(cardBadges(post, TODAY, verified)).toContain('platform-size');
    const stale: Format = { ...FORMATS['instagram-post'], verifiedAt: '2025-01-01' };
    expect(cardBadges(post, TODAY, stale)).not.toContain('platform-size');
    expect(cardBadges(post, TODAY, null)).not.toContain('platform-size');
  });
});
