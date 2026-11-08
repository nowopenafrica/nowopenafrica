import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { DESIGN_TEMPLATES } from '../../lib/designTemplates';
import { canvasOf } from '../../lib/create/templateDetail';
import { formatOf } from '../../lib/design/formats';
import type { MockupScene } from '../../lib/create/mockup';

vi.mock('../studio/TemplateSurface', () => ({ default: () => <div data-testid="surface" /> }));

/* The scene list is the only thing the card reads; scripted per test. */
const pool = vi.hoisted(() => ({ scenes: [] as MockupScene[] }));
vi.mock('../../hooks/useMockupScenes', () => ({ useMockupScenes: () => pool.scenes }));

import TemplateCard from './TemplateCard';

const CARD = DESIGN_TEMPLATES.find((t) => t.key === 'card-minimal')!;
const F = formatOf(canvasOf(CARD).formatKey!)!;

const scene = (ratio: number): MockupScene => ({
  assetId: `s-${ratio}`, url: 'https://x/desk.jpg', ratio, formatKeys: [], label: 'Desk', width: 1600, height: 1000, title: 'A desk',
  quad: { tl: { x: 0.2, y: 0.2 }, tr: { x: 0.8, y: 0.25 }, br: { x: 0.8, y: 0.65 }, bl: { x: 0.2, y: 0.7 } },
});

let widthSpy: PropertyDescriptor | undefined;
beforeEach(() => {
  pool.scenes = [];
  widthSpy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 300 });
});
afterEach(() => {
  cleanup();
  if (widthSpy) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthSpy);
});

const mount = () => render(
  <MemoryRouter><TemplateCard template={CARD} today="2026-11-08" onEdit={() => {}} /></MemoryRouter>,
);

describe('TemplateCard: See it in place', () => {
  it('has no toggle with no scene (today)', () => {
    mount();
    expect(screen.queryByTestId('card-see-in-place')).toBeNull();
    expect(screen.queryByText(/mockup/i)).toBeNull();
  });

  it('has no toggle for an off-ratio scene', () => {
    pool.scenes = [scene((F.w / F.h) * 1.03)];
    mount();
    expect(screen.queryByTestId('card-see-in-place')).toBeNull();
  });

  it('has a toggle for a matching scene, and shows the labelled mockup only after it is pressed', () => {
    pool.scenes = [scene(F.w / F.h)];
    mount();
    const toggle = screen.getByRole('button', { name: /see it in place/i });
    expect(screen.queryByTestId('mockup-view')).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByTestId('mockup-view')).toBeInTheDocument();
    expect(screen.getByText('Mockup: illustration only')).toBeVisible();
    /* The toggle is a sibling of the card's link, not a button inside it. */
    expect(toggle.closest('a')).toBeNull();
  });
});
