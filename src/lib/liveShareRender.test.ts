import { describe, it, expect } from 'vitest';

import { renderLiveSharePage, type LiveSharePage } from './liveShareRender';

const page = (over: Partial<LiveSharePage> = {}): LiveSharePage => ({
  status: 'live',
  title: 'Friday market walkthrough',
  description: '',
  businessName: 'Mama Put Kitchen',
  image: 'https://xyz.supabase.co/storage/v1/object/public/business-images/live/s1-poster.jpg',
  recordingUrl: null,
  viewers: 12,
  scheduledFor: null,
  watchUrl: 'https://nowopenafrica.com/mama-put?tab=live&watch=s1',
  shareUrl: 'https://nowopenafrica.com/live/s1',
  siteUrl: 'https://nowopenafrica.com',
  ...over,
});

describe('renderLiveSharePage', () => {
  it('gives a crawler a title, description, image and canonical url', () => {
    const html = renderLiveSharePage(page());
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:description"');
    expect(html).toContain('<meta property="og:image" content="https://xyz.supabase.co');
    expect(html).toContain('<meta property="og:url" content="https://nowopenafrica.com/live/s1">');
    expect(html).toContain('<link rel="canonical" href="https://nowopenafrica.com/live/s1">');
  });

  it('leads the card with the live state, because the title is what survives truncation', () => {
    expect(renderLiveSharePage(page())).toContain('LIVE NOW');
    expect(renderLiveSharePage(page({ status: 'scheduled' }))).toContain('STARTING SOON');
    expect(renderLiveSharePage(page({ status: 'ended' }))).toContain('REPLAY');
  });

  it('never points og:video at a stream that is still running', () => {
    // A WebRTC broadcast has no playable url. A video tag aimed at nothing makes
    // the platforms that honour it show a spinner and then an error.
    const html = renderLiveSharePage(page());
    expect(html).not.toContain('og:video');
    expect(html).toContain('summary_large_image');
  });

  it('does give a saved replay real video tags, because that one is a file', () => {
    const html = renderLiveSharePage(page({
      status: 'ended',
      recordingUrl: 'https://xyz.supabase.co/storage/v1/object/public/business-images/live/s1.webm',
    }));
    expect(html).toContain('<meta property="og:video" content="https://xyz.supabase.co');
    expect(html).toContain('twitter:card" content="player"');
    expect(html).toContain('<video src="https://xyz.supabase.co');
  });

  it('does not offer a player for an ended stream that saved no recording', () => {
    const html = renderLiveSharePage(page({ status: 'ended', recordingUrl: null }));
    expect(html).not.toContain('<video');
    expect(html).not.toContain('og:video');
  });

  it('sends the CTA to the live tab with the viewer opening', () => {
    expect(renderLiveSharePage(page())).toContain('href="https://nowopenafrica.com/mama-put?tab=live&amp;watch=s1"');
  });

  it('escapes everything a business could put in a title', () => {
    const html = renderLiveSharePage(page({
      title: '"Best" <script>alert(1)</script> & co',
      businessName: 'Tunde & Sons',
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&amp; co');
    expect(html).toContain('Tunde &amp; Sons');
  });

  it('uses the stream description when there is one, and a written line when there is not', () => {
    const withDesc = renderLiveSharePage(page({ description: 'New stock landing today' }));
    expect(withDesc).toContain('New stock landing today');
    const without = renderLiveSharePage(page({ description: '' }));
    expect(without).toContain('broadcasting now');
  });

  it('shows a crowd only once there is one', () => {
    expect(renderLiveSharePage(page({ viewers: 12 }))).toContain('12 watching');
    expect(renderLiveSharePage(page({ viewers: 1 }))).not.toContain('watching</span>');
  });
});
