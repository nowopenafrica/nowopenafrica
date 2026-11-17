import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VideoEmbedFrame from '../components/VideoEmbedFrame';

const frame = (container: HTMLElement) => container.querySelector('iframe');

describe('VideoEmbedFrame', () => {
  it('plays a YouTube link through the no-cookie player', () => {
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/dQw4w9WgXcQ" />);
    expect(frame(container)?.getAttribute('src'))
      .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('uses a portrait frame for TikTok and a widescreen one for YouTube', () => {
    // Reels are shot vertically; letterboxing them would waste most of the tile.
    const { container: tiktok } = render(
      <VideoEmbedFrame url="https://www.tiktok.com/@x/video/7212345678901234567" />,
    );
    expect(tiktok.querySelector('.aspect-\\[9\\/16\\]')).not.toBeNull();

    const { container: yt } = render(<VideoEmbedFrame url="https://youtu.be/abc" />);
    expect(yt.querySelector('.aspect-video')).not.toBeNull();
  });

  it('credits the platform and links to the original', () => {
    render(<VideoEmbedFrame url="https://www.instagram.com/reel/Cabc123/" />);
    const link = screen.getByRole('link', { name: /Watch on Instagram/i });
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/reel/Cabc123/');
    // Third-party destination: don't leak the referrer or pass link equity.
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('nofollow');
  });

  it('can hide attribution for a compact tile', () => {
    render(<VideoEmbedFrame url="https://youtu.be/abc" showAttribution={false} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not let an embedded page reach into this document', () => {
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/abc" />);
    const allow = frame(container)?.getAttribute('allow') || '';
    expect(allow).not.toContain('same-origin');
    expect(frame(container)?.getAttribute('referrerPolicy') || frame(container)?.getAttribute('referrerpolicy'))
      .toBe('strict-origin-when-cross-origin');
  });

  it('renders nothing for a link it cannot embed, rather than an empty frame', () => {
    const { container } = render(<VideoEmbedFrame url="https://example.com/article" />);
    expect(frame(container)).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing for a direct video file — that plays as <video> elsewhere', () => {
    const { container } = render(<VideoEmbedFrame url="https://x.test/clip.mp4" />);
    expect(frame(container)).toBeNull();
  });

  it('lazy-loads, so a gallery of links does not fetch every player at once', () => {
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/abc" />);
    expect(frame(container)?.getAttribute('loading')).toBe('lazy');
  });

  it('plays a cover muted, looped and eager when asked to be ambient', () => {
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/abc" ambient />);
    const src = frame(container)?.getAttribute('src') || '';
    expect(src).toContain('autoplay=1');
    expect(src).toContain('mute=1');
    expect(src).toContain('loop=1');
    expect(frame(container)?.getAttribute('loading')).toBe('eager');
  });

  it('gives a cover no pointer target, so a hover cannot paint player chrome', () => {
    // YouTube, Vimeo and TikTok all render their own controls over the frame
    // when the pointer enters it. There is no parameter that stops that; the
    // only lever is not letting the iframe see the pointer at all.
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/abc" ambient />);
    expect(frame(container)?.className).toContain('pointer-events-none');
    expect(frame(container)?.getAttribute('tabindex')).toBe('-1');
    expect(frame(container)?.hasAttribute('allowfullscreen')).toBe(false);
  });

  it('leaves a gallery player interactive', () => {
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/abc" />);
    expect(frame(container)?.className).not.toContain('pointer-events-none');
    expect(frame(container)?.hasAttribute('allowfullscreen')).toBe(true);
  });

  it('scales a cover past its box so the video fills the banner', () => {
    // A 16:9 player pinned to a wide banner letterboxes itself with black bars
    // down both sides. Cover geometry — own aspect, centred, clipped — is the
    // only thing that makes the picture reach the edges.
    const { container } = render(<VideoEmbedFrame url="https://youtu.be/abc" ambient fill />);
    const iframe = frame(container);
    expect(iframe?.className).toContain('aspect-video');
    expect(iframe?.className).toContain('-translate-x-1/2');
    expect(iframe?.className).not.toContain('inset-0');
    expect(iframe?.parentElement?.className).toContain('overflow-hidden');
  });
});
