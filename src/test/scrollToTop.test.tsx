import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScrollToTop from '../components/ScrollToTop';

/*
 * A hash target that moves after the first scroll (the lazy Promote hub
 * grows above #preview as placements load) must be followed, until the
 * visitor takes over.
 */
describe('ScrollToTop pinning', () => {
  let top = 0;
  let scrolls = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    top = 0; scrolls = 0;
    const el = document.createElement('div');
    el.id = 'preview';
    el.scrollIntoView = () => { scrolls += 1; top = 0; };
    el.getBoundingClientRect = () => ({ top } as DOMRect);
    document.body.appendChild(el);
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  });
  afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.useRealTimers(); });

  const mount = (url: string) => render(<MemoryRouter initialEntries={[url]}><ScrollToTop /></MemoryRouter>);

  it('re-scrolls when the target moves after the first scroll', () => {
    mount('/adverts#preview');
    expect(scrolls).toBe(1);
    top = 4900; // content grew above it
    vi.advanceTimersByTime(100);
    expect(scrolls).toBe(2);
    expect(top).toBe(0);
  });

  it('stops re-scrolling on user input', () => {
    mount('/adverts#preview');
    window.dispatchEvent(new Event('wheel'));
    top = 4900;
    vi.advanceTimersByTime(200);
    expect(scrolls).toBe(1);
  });

  it('stops pinning after the window closes', () => {
    mount('/adverts#preview');
    vi.advanceTimersByTime(2600);
    top = 4900;
    vi.advanceTimersByTime(200);
    expect(scrolls).toBe(1);
  });

  it('stops pinning when the page scrolls without the pin (a scrollbar drag)', () => {
    const setY = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
    setY(0);
    try {
      mount('/adverts#preview');
      expect(scrolls).toBe(1);
      setY(800); // dragged: no wheel, touch, key or pointer event
      vi.advanceTimersByTime(100);
      top = 4900;
      vi.advanceTimersByTime(200);
      expect(scrolls).toBe(1);
    } finally {
      setY(0);
    }
  });

  it('a pin-caused scroll does not count as the visitor scrolling', () => {
    const setY = (y: number) => Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
    setY(0);
    const el = document.getElementById('preview')!;
    // The pin's own scroll moves the window; that must not release it.
    el.scrollIntoView = () => { scrolls += 1; top = 0; setY(scrolls * 1000); };
    try {
      mount('/adverts#preview');
      top = 4900;
      vi.advanceTimersByTime(100);
      expect(scrolls).toBe(2);
      top = 4900;
      vi.advanceTimersByTime(100);
      expect(scrolls).toBe(3);
    } finally {
      setY(0);
    }
  });

  it('without a hash still scrolls to the top', () => {
    mount('/adverts');
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(scrolls).toBe(0);
  });
});
