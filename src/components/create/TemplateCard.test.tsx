import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { DESIGN_TEMPLATES, type DesignTemplate } from '../../lib/designTemplates';
import { FORMATS } from '../../lib/design/formats';
import { isListed } from '../../lib/create/needs';

/* The real renderer is heavy; only WHETHER it mounts matters here. */
vi.mock('../studio/TemplateSurface', () => ({
  default: () => <div data-testid="surface" />,
}));

import TemplateCard, { TemplateCardSkeleton } from './TemplateCard';

const LISTED = DESIGN_TEMPLATES.filter(isListed);
const CARD = LISTED.find((t) => t.key === 'card-minimal')!;

/* jsdom lays nothing out: give the preview box a width so its scale is measured. */
let widthSpy: PropertyDescriptor | undefined;
beforeEach(() => {
  widthSpy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 200 });
});
afterEach(() => {
  cleanup();
  if (widthSpy) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthSpy);
  delete (window as { IntersectionObserver?: unknown }).IntersectionObserver;
});

const mount = (tpl: DesignTemplate, onEdit = vi.fn()) => render(
  <MemoryRouter><TemplateCard template={tpl} today="2026-11-08" onEdit={onEdit} /></MemoryRouter>,
);

describe('TemplateCard', () => {
  it('shows the name, the subcategory, the format and one line', () => {
    mount(CARD);
    const card = screen.getByTestId('template-card');
    expect(card).toHaveTextContent(CARD.label);
    expect(card).toHaveTextContent('Business card');
    expect(card).toHaveTextContent(FORMATS['business-card'].label);
    const line = screen.getByTestId('card-line');
    expect(line).toHaveTextContent(CARD.desc);
    expect(line.className).toMatch(/truncate/);
  });

  it('shows the direction only when one is set', () => {
    mount(CARD);
    expect(screen.queryByTestId('card-direction')).toBeNull();
    cleanup();
    mount({ ...CARD, direction: 'editorial' });
    expect(screen.getByTestId('card-direction')).toHaveTextContent('Editorial');
  });

  it('carries "Editable" (C7 passes) and never "Print-ready" or "Platform size" today', () => {
    mount(CARD);
    const badges = screen.getAllByTestId('card-badge').map((b) => b.textContent);
    expect(badges).toEqual(['Editable']);
    expect(screen.getByTestId('template-card').textContent).not.toMatch(/print-ready|platform size/i);
  });

  it('links to the detail page and keeps the Edit button', () => {
    const onEdit = vi.fn();
    mount(CARD, onEdit);
    expect(screen.getByRole('link', { name: /View/ })).toHaveAttribute('href', `/media/templates/${CARD.key}`);
    const edit = screen.getByRole('button', { name: `Edit ${CARD.label}` });
    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledWith(CARD);
    expect(edit.className).toMatch(/min-h-\[44px\]/);
  });

  it('mounts the renderer only once the card is in view', () => {
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
    (window as { IntersectionObserver?: unknown }).IntersectionObserver = class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { fire = cb; }
      observe() {}
      disconnect() {}
      unobserve() {}
    };
    mount(CARD);
    expect(screen.queryByTestId('surface')).toBeNull();
    act(() => fire?.([{ isIntersecting: true }]));
    expect(screen.getByTestId('surface')).toBeInTheDocument();
  });
});

describe('TemplateCardSkeleton', () => {
  it('is a busy placeholder with no text a visitor could mistake for a design', () => {
    render(<TemplateCardSkeleton />);
    const s = screen.getByTestId('card-skeleton');
    expect(s).toHaveAttribute('aria-hidden', 'true');
    expect(s.className).toMatch(/animate-pulse/);
    expect(s.textContent).toBe('');
  });
});
