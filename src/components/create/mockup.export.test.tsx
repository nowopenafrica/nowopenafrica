import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import type { MockupScene } from '../../lib/create/mockup';

/*
 * Spec §8: "An export holds only the template." The customiser's Download PNG
 * calls exportNodeToPng(frame.current), where `frame` is the div wrapping
 * the bare TemplateSurface. This pins, against the real customiser and a
 * spy on that call, that what it receives is that frame: never a MockupView,
 * nothing inside one, and nothing containing one.
 */
const exported = vi.hoisted(() => ({ nodes: [] as HTMLElement[] }));
vi.mock('../../lib/studio', async (orig) => ({
  ...(await orig<typeof import('../../lib/studio')>()),
  exportNodeToPng: vi.fn(async (node: HTMLElement) => { exported.nodes.push(node); return 'data:image/png;base64,AA=='; }),
  downloadUrl: vi.fn(),
}));
vi.mock('../../lib/telemetry', () => ({ track: () => {} }));

import TemplateCustomiser from './TemplateCustomiser';
import MockupView from './MockupView';
import { exportNodeToPng } from '../../lib/studio';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });
});
afterEach(() => { cleanup(); exported.nodes.length = 0; vi.clearAllMocks(); });

const TPL = DESIGN_TEMPLATES.find((t) => t.key === 'card-minimal')!;
const SCENE: MockupScene = {
  assetId: 's', url: 'https://x/desk.jpg', ratio: 1011 / 638, formatKeys: [], label: 'Desk', width: 1600, height: 1000, title: 'A desk',
  quad: { tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.25 }, br: { x: 0.8, y: 0.65 }, bl: { x: 0.2, y: 0.7 } },
};

describe('export separation', () => {
  it('hands exportNodeToPng the bare surface frame, with no mockup in or around it', async () => {
    /* A mockup of the SAME design is on screen at the same time. */
    const { container } = render(
      <MemoryRouter>
        <MockupView scene={SCENE} template={TPL} styleKey="signature" brand="#2563eb" />
        <TemplateCustomiser template={TPL} initialStyle="signature" initialBrand="#2563eb" onClose={() => {}} />
      </MemoryRouter>,
    );
    const mockup = container.querySelector('[data-testid="mockup-view"]')!;
    expect(mockup).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /download png/i }));
    await waitFor(() => expect(exportNodeToPng).toHaveBeenCalledTimes(1));

    const node = exported.nodes[0];
    /* It is the customiser's frame: it carries the design's export width. */
    expect(node.hasAttribute('data-export-width')).toBe(true);
    expect(node.textContent).not.toBe('');
    /* Nothing of the mockup is inside it, around it, or it. */
    expect(node.querySelector('[data-testid="mockup-view"], [data-testid="mockup-label"], [data-testid="mockup-artwork"], img[src="https://x/desk.jpg"]')).toBeNull();
    expect(node.closest('[data-testid="mockup-view"]')).toBeNull();
    expect(node.contains(mockup)).toBe(false);
    expect(mockup.contains(node)).toBe(false);
    expect(node.textContent).not.toMatch(/Mockup: illustration only/);
  });

  it('the customiser does not import any mockup code, so it cannot render one', () => {
    const src = readFileSync('src/components/create/TemplateCustomiser.tsx', 'utf8');
    expect(src).not.toMatch(/mockup/i);
  });
});
