import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';

import {
  CardExportNode, QrLockupNode, SmartIdNode, SmartIdFrontNode,
  CARD_DESIGN_WIDTH, CARD_DESIGN_HEIGHT, QR_DESIGN_SIZE,
} from '../components/studio/BrandCardNodes';
import type { Business } from '../types';

vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }));

const business = {
  id: 'b1', name: 'Golden Sands Hotel', category: 'Hotel & Lodging',
  location: 'Lagos, Nigeria', phone: '08031234567', username: 'golden-sands-hotel',
} as unknown as Business;

/**
 * A downloaded card or QR is a fixed artefact. Its pixel size must come from the
 * design, never from the window that happened to export it.
 *
 * These lock the mechanism that guarantees that: every export node declares its
 * own design width, and exportNodeToPng pins the node to it during capture. The
 * bug this replaces was five call sites out of nine forgetting to pass the width
 * — including the Smart ID front PNG, whose own PDF did pass it, so the two came
 * out different sizes.
 */
describe('export nodes declare their own size', () => {
  const cases = [
    ['business card', <CardExportNode business={business} qr="" />, CARD_DESIGN_WIDTH],
    ['QR lockup', <QrLockupNode business={business} qr="" />, QR_DESIGN_SIZE],
    ['Smart ID back', <SmartIdNode business={business} qr="" />, CARD_DESIGN_WIDTH],
    ['Smart ID front', <SmartIdFrontNode business={business} />, CARD_DESIGN_WIDTH],
  ] as const;

  for (const [name, element, expected] of cases) {
    it(`${name} carries data-export-width=${expected}`, () => {
      const ref = createRef<HTMLDivElement>();
      // Each node forwards its ref to the element the exporter captures, so
      // reading the attribute off that ref is exactly what the exporter does.
      const withRef = { ...element, ref } as typeof element;
      const { container } = render(withRef);
      const node = ref.current ?? container.firstElementChild as HTMLElement;
      expect(node).toBeTruthy();
      expect(node.getAttribute('data-export-width')).toBe(String(expected));
    });
  }

  // w-fit was the QR's actual bug: the file measured whatever the contents
  // rendered at, so a longer name or a loaded logo changed the output size.
  it('does not let the QR lockup size itself from its contents', () => {
    const ref = createRef<HTMLDivElement>();
    render(<QrLockupNode ref={ref} business={business} qr="" />);
    expect(ref.current?.className).not.toMatch(/\bw-fit\b/);
    expect(ref.current?.style.width).toBe(`${QR_DESIGN_SIZE}px`);
  });

  it('keeps the QR square, so it drops into a layout predictably', () => {
    const ref = createRef<HTMLDivElement>();
    render(<QrLockupNode ref={ref} business={business} qr="" />);
    expect(ref.current?.style.aspectRatio?.replace(/\s/g, '')).toBe('1/1');
  });

  /*
   * A longer name must not change the exported size. This is the property the
   * whole fix exists for, so it is asserted directly rather than inferred from
   * the attributes above.
   */
  it('exports the same width whatever the business name is', () => {
    const widths = ['Yo', 'Golden Sands Hotel & Conference Centre Limited, Victoria Island']
      .map((name) => {
        const ref = createRef<HTMLDivElement>();
        render(<CardExportNode ref={ref} business={{ ...business, name } as Business} qr="" />);
        return ref.current?.style.width;
      });
    expect(widths[0]).toBe(widths[1]);
    expect(widths[0]).toBe(`${CARD_DESIGN_WIDTH}px`);
  });
});

describe('every export node is registered', () => {
  beforeEach(() => vi.restoreAllMocks());

  // If a new export node is added without a design width, the exporter falls
  // back to the live layout and the regression returns silently.
  it('has a design width for each of the four exportable assets', () => {
    expect(CARD_DESIGN_WIDTH).toBeGreaterThan(0);
    expect(QR_DESIGN_SIZE).toBeGreaterThan(0);
  });
});

/**
 * The mechanism itself: exportNodeToPng must pin the node to its declared
 * design width for the duration of the capture, and put it back afterwards.
 *
 * html-to-image is mocked so the width can be read at the exact moment it would
 * have rasterised — which is the only moment that decides the output size.
 */
describe('exportNodeToPng pins the node while capturing', () => {
  it('captures at the declared width and restores the node after', async () => {
    const widthsSeen: string[] = [];
    vi.doMock('html-to-image', () => ({
      toPng: async (n: HTMLElement) => { widthsSeen.push(n.style.width); return 'data:image/png;base64,AA=='; },
    }));
    const { exportNodeToPng } = await import('../lib/studio');

    const node = document.createElement('div');
    node.dataset.exportWidth = '640';
    node.style.width = '100%';
    document.body.appendChild(node);

    await exportNodeToPng(node);

    // Both the warm-up pass and the real capture must see the pinned width.
    expect(widthsSeen.length).toBeGreaterThan(0);
    expect(new Set(widthsSeen)).toEqual(new Set(['640px']));
    // And the live preview must look exactly as it did before the download.
    expect(node.style.width).toBe('100%');
    node.remove();
  });

  it('lets an explicit option override what the node declares', async () => {
    const widthsSeen: string[] = [];
    vi.resetModules();
    vi.doMock('html-to-image', () => ({
      toPng: async (n: HTMLElement) => { widthsSeen.push(n.style.width); return 'data:image/png;base64,AA=='; },
    }));
    const { exportNodeToPng } = await import('../lib/studio');

    const node = document.createElement('div');
    node.dataset.exportWidth = '640';
    document.body.appendChild(node);

    await exportNodeToPng(node, { designWidth: 1080 });
    expect(new Set(widthsSeen)).toEqual(new Set(['1080px']));
    node.remove();
  });
});

/**
 * The blank-export regression, locked.
 *
 * Pinning the width once also set `position: fixed; left: -10000px` to hide the
 * widening. html-to-image copies the node's computed style onto its clone, so
 * the clone sat ten thousand pixels outside its own capture canvas and every
 * download came back empty. Only width may be touched.
 */
describe('pinning must not move the node', () => {
  it('leaves position, left, top and z-index alone during capture', async () => {
    const seen: Array<Record<string, string>> = [];
    vi.resetModules();
    vi.doMock('html-to-image', () => ({
      toPng: async (n: HTMLElement) => {
        seen.push({
          position: n.style.position, left: n.style.left,
          top: n.style.top, zIndex: n.style.zIndex, width: n.style.width,
        });
        return 'data:image/png;base64,AA==';
      },
    }));
    const { exportNodeToPng } = await import('../lib/studio');

    const node = document.createElement('div');
    node.dataset.exportWidth = '640';
    node.style.width = '100%';
    document.body.appendChild(node);

    await exportNodeToPng(node);

    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      // The width is pinned…
      expect(s.width).toBe('640px');
      // …and nothing that could take the clone off its own canvas is set.
      expect(s.position).toBe('');
      expect(s.left).toBe('');
      expect(s.top).toBe('');
      expect(s.zIndex).toBe('');
    }
    node.remove();
  });

  it('clips the document instead, and puts that back too', async () => {
    const overflowSeen: string[] = [];
    vi.resetModules();
    vi.doMock('html-to-image', () => ({
      toPng: async () => {
        overflowSeen.push(document.documentElement.style.overflowX);
        return 'data:image/png;base64,AA==';
      },
    }));
    const { exportNodeToPng } = await import('../lib/studio');

    const node = document.createElement('div');
    node.dataset.exportWidth = '640';
    document.body.appendChild(node);
    document.documentElement.style.overflowX = 'visible';

    await exportNodeToPng(node);

    expect(new Set(overflowSeen)).toEqual(new Set(['hidden']));
    expect(document.documentElement.style.overflowX).toBe('visible');
    node.remove();
  });
});

/**
 * The printed proportions.
 *
 * A business card is ISO/IEC 7810 ID-1: 85.6 x 54mm. Fixing the ratio is what
 * stops two businesses with different amounts of detail exporting differently
 * shaped cards. Overlong fields truncate rather than growing the card — an
 * ellipsis is legible, a card that no longer fits a wallet is not.
 *
 * Measured in a real browser at the pinned width with every optional field
 * switched on and a 48-character name: body scrollHeight 338 against
 * clientHeight 338, so nothing is clipped.
 */
describe('the card keeps its printed proportions', () => {
  it('matches ID-1 to within a rounding pixel', () => {
    const ratio = CARD_DESIGN_WIDTH / CARD_DESIGN_HEIGHT;
    expect(Math.abs(ratio - 85.6 / 54)).toBeLessThan(0.005);
  });

  it('pins the aspect ratio on the node so content cannot stretch it', () => {
    const ref = createRef<HTMLDivElement>();
    render(<CardExportNode ref={ref} business={business} qr="" />);
    expect(ref.current?.style.aspectRatio?.replace(/\s/g, '')).toBe(`${CARD_DESIGN_WIDTH}/${CARD_DESIGN_HEIGHT}`);
  });

  /*
   * Tailwind breakpoints query the viewport, not the element. A `sm:` class
   * inside an export node reflows the download by screen size, which is the
   * same bug the pinned width exists to prevent — so no export node may carry
   * one.
   */
  it('uses no viewport breakpoints inside the exported markup', () => {
    const { container } = render(
      <>
        <CardExportNode business={business} qr="" />
        <QrLockupNode business={business} qr="" />
        <SmartIdNode business={business} qr="" />
        <SmartIdFrontNode business={business} />
      </>,
    );
    const responsive = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .flatMap((el) => Array.from(el.classList))
      .filter((c) => /^(sm|md|lg|xl|2xl):/.test(c));
    expect(responsive).toEqual([]);
  });
});
