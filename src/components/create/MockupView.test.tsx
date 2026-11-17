import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import { formatOf } from '../../lib/design/formats';
import { canvasOf } from '../../lib/create/templateDetail';
import { clipPathFor, matrix3dFor } from '../../lib/promote/surface';
import type { MockupScene } from '../../lib/create/mockup';

/* The real renderer is heavy; the placement around it is what is under test. */
vi.mock('../studio/TemplateSurface', () => ({
  default: ({ width, height }: { width: number; height: number }) => (
    <div data-testid="surface" data-w={width} data-h={height} />
  ),
}));

import MockupView, { MOCKUP_LABEL } from './MockupView';

const CARD = DESIGN_TEMPLATES.find((t) => t.key === 'card-minimal')!;
const FORMAT = formatOf(canvasOf(CARD).formatKey!)!;

const SCENE: MockupScene = {
  assetId: 'scene-1', url: 'https://x/board.jpg', ratio: FORMAT.w / FORMAT.h, formatKeys: [], label: 'Pavement board',
  quad: { tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.25 }, br: { x: 0.8, y: 0.65 }, bl: { x: 0.2, y: 0.7 } },
  width: 1600, height: 1000, title: 'A board on a pavement',
};

let widthSpy: PropertyDescriptor | undefined;
beforeEach(() => {
  widthSpy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
});
afterEach(() => {
  cleanup();
  if (widthSpy) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthSpy);
});

const mount = (scene = SCENE) => render(<MockupView scene={scene} template={CARD} styleKey="signature" brand="#2563eb" />);

describe('MockupView', () => {
  it('says "Mockup: illustration only", visibly and to assistive technology', () => {
    expect(MOCKUP_LABEL).toBe('Mockup: illustration only');
    mount();
    const label = screen.getByText('Mockup: illustration only');
    expect(label).toBeVisible();
    expect(label).not.toHaveAttribute('aria-hidden');
    /* The figure is named by it, so a screen reader announces the label with the picture. */
    expect(screen.getByRole('figure', { name: /Mockup: illustration only/ })).toBeInTheDocument();
  });

  it('takes the image alt text from the asset title, else "Mockup scene"', () => {
    mount();
    expect(screen.getByRole('img', { name: 'A board on a pavement' })).toHaveAttribute('src', SCENE.url);
    cleanup();
    mount({ ...SCENE, title: null });
    expect(screen.getByRole('img', { name: 'Mockup scene' })).toBeInTheDocument();
    cleanup();
    mount({ ...SCENE, title: '   ' });
    expect(screen.getByRole('img', { name: 'Mockup scene' })).toBeInTheDocument();
  });

  it('places the rendered surface with the homography and clips it to the quad', () => {
    mount();
    const art = screen.getByTestId('mockup-artwork');
    const w = Number(screen.getByTestId('surface').getAttribute('data-w'));
    const h = Number(screen.getByTestId('surface').getAttribute('data-h'));
    expect(art.style.transform).toBe(matrix3dFor(w, h, SCENE.quad, SCENE.width, SCENE.height));
    expect(art.style.transform).toMatch(/^matrix3d\(/);
    expect(art.parentElement!.style.clipPath).toBe(clipPathFor(SCENE.quad));
  });

  it('lays the artwork out at the design\'s own proportion: never stretched', () => {
    mount();
    const w = Number(screen.getByTestId('surface').getAttribute('data-w'));
    const h = Number(screen.getByTestId('surface').getAttribute('data-h'));
    expect(w / h).toBeCloseTo(FORMAT.w / FORMAT.h, 2);
  });

  it('keeps the scene image at its own proportion', () => {
    mount();
    const box = screen.getByRole('img').parentElement!;
    expect(box.style.aspectRatio.replace(/\s/g, '')).toBe('1600/1000');
  });

  it('draws no artwork for an unusable quad, but still labels the scene', () => {
    const flat = { tl: { x: 0.1, y: 0.1 }, tr: { x: 0.5, y: 0.1 }, br: { x: 0.9, y: 0.1 }, bl: { x: 0.3, y: 0.1 } };
    mount({ ...SCENE, quad: flat });
    expect(screen.queryByTestId('mockup-artwork')).toBeNull();
    expect(screen.getByText('Mockup: illustration only')).toBeInTheDocument();
  });
});
