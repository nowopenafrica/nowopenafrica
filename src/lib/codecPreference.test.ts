import { describe, it, expect } from 'vitest';

import { preferredCodecOrder, hintDetail } from './openReel';

const c = (mimeType: string) => ({ mimeType });

describe('preferredCodecOrder', () => {
  it('puts H.264 first, because phones encode it in hardware', () => {
    // VP9 compresses better, but a software VP9 encode at 720p30 drops frames
    // and cooks the handset — a worse picture than the codec saved.
    const out = preferredCodecOrder([c('video/VP8'), c('video/VP9'), c('video/H264')]);
    expect(out.map((x) => x.mimeType)).toEqual(['video/H264', 'video/VP9', 'video/VP8']);
  });

  it('never drops a codec — that is how a call fails to connect', () => {
    const input = [c('video/VP8'), c('video/rtx'), c('video/H264'), c('video/red')];
    const out = preferredCodecOrder(input);
    expect(out).toHaveLength(input.length);
    for (const codec of input) expect(out).toContainEqual(codec);
  });

  it('keeps unranked entries in the order the browser gave them', () => {
    const out = preferredCodecOrder([c('video/rtx'), c('video/red'), c('video/ulpfec'), c('video/VP8')]);
    expect(out.map((x) => x.mimeType)).toEqual(['video/VP8', 'video/rtx', 'video/red', 'video/ulpfec']);
  });

  it('matches regardless of how the browser cases the mime type', () => {
    const out = preferredCodecOrder([c('video/vp8'), c('video/h264')]);
    expect(out[0].mimeType).toBe('video/h264');
  });

  it('does not confuse a codec whose name merely contains another', () => {
    // "video/H264-SVC" is not H264; anchoring the pattern keeps it unranked
    // rather than promoting it above the real thing.
    const out = preferredCodecOrder([c('video/VP8'), c('video/H264-SVC'), c('video/H264')]);
    expect(out[0].mimeType).toBe('video/H264');
  });

  it('copes with an empty or absent capability list', () => {
    expect(preferredCodecOrder([])).toEqual([]);
    expect(preferredCodecOrder(undefined as unknown as { mimeType: string }[])).toEqual([]);
  });

  it('does not mutate what it was given', () => {
    const input = [c('video/VP8'), c('video/H264')];
    preferredCodecOrder(input);
    expect(input.map((x) => x.mimeType)).toEqual(['video/VP8', 'video/H264']);
  });
});

describe('hintDetail', () => {
  it('asks the encoder to keep detail rather than smooth motion', () => {
    const track = { contentHint: '' } as unknown as MediaStreamTrack;
    hintDetail(track);
    expect((track as unknown as { contentHint: string }).contentHint).toBe('detail');
  });

  it('is a no-op on a missing track, and on one that refuses the hint', () => {
    expect(() => hintDetail(null)).not.toThrow();
    const frozen = Object.freeze({ contentHint: '' }) as unknown as MediaStreamTrack;
    expect(() => hintDetail(frozen)).not.toThrow();
  });
});
