import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import SmartImg from '../components/SmartImg';

/*
 * The sites this swap touches all draw remote pictures — Pexels demos, operators'
 * hotlinked CDs, hostel posters — any of which can die after the URL was stored.
 * A dead URL must never draw the browser's broken-image box on a public page; it
 * either falls back to a second source once, or renders a styled placeholder.
 */

describe('SmartImg', () => {
  it('renders a placeholder, not a broken-image box, when there is no src', () => {
    render(<SmartImg src={null} alt="" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(document.querySelector('div[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('renders a plain img when the src exists', () => {
    render(<SmartImg src="https://example.com/a.jpg" alt="a" />);
    const img = screen.getByRole('img', { name: 'a' }) as HTMLImageElement;
    expect(img.src).toBe('https://example.com/a.jpg');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('falls back to the second source exactly once when the first fails', () => {
    const onError = vi.fn();
    render(
      <SmartImg
        src="https://example.com/dead.jpg"
        fallback="https://example.com/fallback.jpg"
        alt="b"
        onError={onError}
      />,
    );
    const img = screen.getByRole('img', { name: 'b' }) as HTMLImageElement;
    fireEvent.error(img);
    expect((screen.getByRole('img', { name: 'b' }) as HTMLImageElement).src).toBe(
      'https://example.com/fallback.jpg',
    );
    expect(onError).not.toHaveBeenCalled();
  });

  it('renders a placeholder and fires the caller onError once both sources fail', () => {
    const onError = vi.fn();
    render(
      <SmartImg
        src="https://example.com/dead.jpg"
        fallback="https://example.com/dead2.jpg"
        alt="c"
        onError={onError}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: 'c' }));
    fireEvent.error(screen.getByRole('img', { name: 'c' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});