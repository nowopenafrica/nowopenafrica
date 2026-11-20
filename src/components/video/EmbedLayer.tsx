import { useEffect, useMemo, useRef } from 'react';

import { embedPlacementsAt } from '../../lib/studio/videoCompositor';
import { isEmbedAsset, type LinkPlatform, type VideoDocument } from '../../lib/studio/videoDocument';
import { playerCommand, studioEmbedSrc } from '../../lib/studio/videoSources';

/*
 * The platform players (YouTube, Vimeo…) for linked clips, laid UNDER the
 * preview canvas. The compositor clears each such clip's box to transparent,
 * so the player shows through and anything on a higher track still paints
 * over it. Because the canvas covers the players, nobody can hover or click
 * them, so no player controls can be brought up over the edit.
 *
 * YouTube: the player is asked for `controls=0` and is sent the JS API
 * "listening" handshake on load, after which it takes seek / play / pause and
 * reports its length. YouTube draws its own "More videos" strip and logo on a
 * PAUSED player, so while the timeline is paused the player is hidden and the
 * video's still (YouTube's own thumbnail) shows in its place; the player is
 * only visible while it plays.
 *
 * Vimeo follows the timeline the same way (its chrome is hidden only when the
 * video's owner allows it). TikTok, Instagram and Facebook players take no
 * commands and play on their own.
 */

interface Props {
  doc: VideoDocument;
  ms: number;
  playing: boolean;
  /** The platform reported the video's real length. */
  onDuration?: (assetId: string, durationMs: number) => void;
}

type Ref = { el: HTMLIFrameElement | null; platform: LinkPlatform; active: boolean; playing: boolean };
type EmbedClip = { id: string; assetId: string; platform: LinkPlatform; embedId: string; src: string };

const ytStill = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

export default function EmbedLayer({ doc, ms, playing, onDuration }: Props) {
  /* Every embed clip stays mounted, so a player is not reloaded each time the playhead crosses it. */
  const clips = useMemo(() => {
    const out: EmbedClip[] = [];
    const origin = typeof window === 'undefined' ? 'https://www.nowopenafrica.com' : window.location.origin;
    for (const t of doc.tracks) {
      if (t.kind === 'audio') continue;
      for (const c of t.clips) {
        if (c.type !== 'media') continue;
        const a = doc.assets[c.assetId];
        if (!isEmbedAsset(a) || !a?.link?.platform || !a.link.embedId) continue;
        out.push({ id: c.id, assetId: c.assetId, platform: a.link.platform, embedId: a.link.embedId, src: studioEmbedSrc(a.link.platform, a.link.embedId, a.link.url, origin) });
      }
    }
    return out;
  }, [doc.tracks, doc.assets]);

  const placements = embedPlacementsAt(doc, ms);
  const byClip = new Map(placements.map((p) => [p.clipId, p]));
  const refs = useRef(new Map<string, Ref>());

  const send = (r: Ref, cmd: 'seek' | 'play' | 'pause', seconds = 0) => {
    const msg = playerCommand(r.platform, cmd, seconds);
    if (msg && r.el?.contentWindow) r.el.contentWindow.postMessage(msg, '*');
  };

  /* YouTube reports state and length once it has had the handshake; keep the length. */
  const onDurationRef = useRef(onDuration);
  onDurationRef.current = onDuration;
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || typeof e.data !== 'string') return;
      let m: { event?: string; id?: string; info?: { duration?: number } };
      try { m = JSON.parse(e.data); } catch { return; }
      const clip = clipsRef.current.find((c) => c.id === m.id);
      const seconds = m.info?.duration;
      if (clip && typeof seconds === 'number' && seconds > 0) onDurationRef.current?.(clip.assetId, Math.round(seconds * 1000));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  /* Keep each player where the timeline says. While paused, follow scrubbing (rounded to 0.1 s). */
  const scrubKey = playing ? -1 : Math.round(ms / 100);
  useEffect(() => {
    for (const c of clips) {
      const r = refs.current.get(c.id);
      if (!r) continue;
      const p = byClip.get(c.id);
      if (!p) {
        if (r.active) send(r, 'pause');
        r.active = false;
        r.playing = false;
        continue;
      }
      const becameActive = !r.active;
      r.active = true;
      if (playing && (!r.playing || becameActive)) { send(r, 'seek', p.sourceSeconds); send(r, 'play'); r.playing = true; }
      if (!playing) { if (r.playing) send(r, 'pause'); r.playing = false; send(r, 'seek', p.sourceSeconds); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, playing, scrubKey, placements.map((p) => p.clipId).join(',')]);

  /* A player only takes commands once it has loaded: handshake, then repeat the current state. */
  const onLoad = (c: EmbedClip) => {
    const r = refs.current.get(c.id);
    if (!r?.el?.contentWindow) return;
    if (c.platform === 'youtube') r.el.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: c.id, channel: 'widget' }), '*');
    const settle = () => {
      const p = embedPlacementsAt(docRef.current, msRef.current).find((x) => x.clipId === c.id);
      if (!p) { send(r, 'pause'); return; }
      send(r, 'seek', p.sourceSeconds);
      send(r, playingRef.current ? 'play' : 'pause');
    };
    window.setTimeout(settle, 150);
    window.setTimeout(settle, 1000);
  };
  const docRef = useRef(doc);
  docRef.current = doc;
  const msRef = useRef(ms);
  msRef.current = ms;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  if (clips.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="embed-layer">
      {clips.map((c) => {
        const p = byClip.get(c.id);
        const box = {
          left: `${(p?.box.x ?? 0) * 100}%`,
          top: `${(p?.box.y ?? 0) * 100}%`,
          width: `${(p?.box.w ?? 1) * 100}%`,
          height: `${(p?.box.h ?? 1) * 100}%`,
          opacity: p?.opacity ?? 1,
        };
        /* A paused YouTube player carries YouTube's own overlays; show the video's still instead. */
        const still = c.platform === 'youtube' && !playing;
        return (
          <div key={c.id}>
            <iframe
              ref={(el) => {
                const prev = refs.current.get(c.id);
                refs.current.set(c.id, { el, platform: c.platform, active: prev?.active ?? false, playing: prev?.playing ?? false });
              }}
              src={c.src}
              title="Linked video"
              tabIndex={-1}
              onLoad={() => onLoad(c)}
              allow="autoplay; encrypted-media; picture-in-picture"
              data-testid="embed-player"
              data-platform={c.platform}
              className="absolute border-0"
              style={{ ...box, visibility: p && !still ? 'visible' : 'hidden' }}
            />
            {p && still && (
              <img
                src={ytStill(c.embedId)}
                alt=""
                data-testid="embed-still"
                className="absolute bg-black object-contain"
                style={box}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
