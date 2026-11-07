/**
 * Gallery tiles for platform links.
 *
 * Instagram posts arrive here in bulk — up to twelve per listing, carried from
 * a business's own feed when a candidate is approved — so what these tiles
 * show is most of what a gallery shows.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import EmbedThumb from '../components/EmbedThumb';

afterEach(cleanup);

const IG = 'https://www.instagram.com/reel/DePAXwAoUMC/';

describe('an Instagram tile shows the real post', () => {
  it('renders Meta\'s embed rather than a grey placeholder', () => {
    /*
     * The alternative was storing Meta's media_url, which is a signed address
     * that expires within days and may not be re-hosted — a saved thumbnail
     * would be a broken image on a real business's listing inside a week.
     */
    const { container } = render(<EmbedThumb url={IG} alt="a reel" />);
    const frame = container.querySelector('iframe');
    expect(frame, 'no iframe rendered for an Instagram post').not.toBeNull();
    expect(frame!.getAttribute('src')).toBe('https://www.instagram.com/reel/DePAXwAoUMC/embed');
  });

  it('keeps the tile inert so a tap opens the lightbox', () => {
    /*
     * A live embed underneath would swallow the click and send the visitor to
     * Instagram instead of opening our own viewer.
     */
    const { container } = render(<EmbedThumb url={IG} alt="a reel" />);
    expect(container.querySelector('iframe')!.className).toMatch(/pointer-events-none/);
  });

  it('loads lazily and asks the frame for nothing it does not need', () => {
    const { container } = render(<EmbedThumb url={IG} alt="a reel" />);
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('loading')).toBe('lazy');
    expect(frame.getAttribute('sandbox')).toBeTruthy();
    expect(frame.getAttribute('referrerPolicy') ?? frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('still says where it came from', () => {
    render(<EmbedThumb url={IG} alt="a reel" />);
    expect(screen.getByText(/instagram/i)).toBeInTheDocument();
  });
});

describe('platforms without a derivable still keep the honest placeholder', () => {
  it('does not invent an iframe for TikTok', () => {
    /*
     * TikTok needs an oEmbed call we do not make. "TikTok" under a play icon
     * is honest about not having the picture; a guessed URL that 404s is not.
     * Instagram is the exception because its embed needs no key and no review.
     */
    const { container } = render(
      <EmbedThumb url="https://www.tiktok.com/@someone/video/123" alt="x" />,
    );
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('prefers a cheap still over an iframe where one exists', () => {
    // YouTube publishes a derivable thumbnail; an image beats a player.
    const { container } = render(
      <EmbedThumb url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" alt="x" />,
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});
