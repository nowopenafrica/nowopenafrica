// NowOpen Studio — AI Video Model router.
//
// The AI Creative Director hands its finished brief to the best FREE text-to-
// video model available, ranked by how close each model's realism, motion and
// control get to Seedance 2.0 / 2.5 (ByteDance's flagship, closed-source and
// paid). Every model below is free to use, and the selection is deterministic
// so the same brief + settings always pick the same engine.
//
// Seedance 2.0/2.5 is the quality bar (Elo ~1268 T2V, native audio, top-tier
// control). No free model matches it outright — the closest is Alibaba's
// open-source Wan 2.2 (VBench ~84.7%, Apache 2.0), which is what Auto picks.

export type VideoModelRes = '480p' | '720p' | '1080p';

export interface VideoModelMeta {
  key: string;
  name: string;
  maker: string;
  release: string;
  license: string;
  maxRes: VideoModelRes;
  maxSeconds: number;
  fps: number;
  /** How close this model's output gets to Seedance 2.5, 0–100. */
  closeness: number;
  notes: string;
}

/** The closed-source quality bar every free model is ranked against. */
export const SEEDANCE_REFERENCE: VideoModelMeta = {
  key: 'seedance-2.5',
  name: 'Seedance 2.5',
  maker: 'ByteDance (Doubao)',
  release: '2025',
  license: 'Closed-source — paid',
  maxRes: '1080p',
  maxSeconds: 30,
  fps: 30,
  closeness: 100,
  notes: 'The bar. Elo ~1268 T2V with native audio and scene control — not free, so Auto never picks it.',
};

/**
 * Free / open-source video models, ordered closest-to-Seedance first. Auto
 * selection always lands on the top entry — today that is Wan 2.2, the
 * open-source VBench leader and the closest free model to Seedance 2.5.
 */
export const VIDEO_MODELS: VideoModelMeta[] = [
  {
    key: 'wan-2.2',
    name: 'Wan 2.2',
    maker: 'Alibaba Cloud',
    release: '2025',
    license: 'Apache 2.0',
    maxRes: '720p',
    maxSeconds: 12,
    fps: 24,
    closeness: 86,
    notes: 'Open-source VBench leader (~84.7%). Apache-licensed, so it is safe for commercial ad use. 720p@24fps, fast on consumer GPUs.',
  },
  {
    key: 'hunyuanvideo-1.5',
    name: 'HunyuanVideo 1.5',
    maker: 'Tencent',
    release: '2025',
    license: 'Community (custom)',
    maxRes: '1080p',
    maxSeconds: 15,
    fps: 24,
    closeness: 82,
    notes: '8.3B DiT with a 1080p super-resolution stage. Step-distilled checkpoints run in ~75s on a single RTX 4090.',
  },
  {
    key: 'wan-2.1',
    name: 'Wan 2.1',
    maker: 'Alibaba Cloud',
    release: '2025',
    license: 'Apache 2.0',
    maxRes: '720p',
    maxSeconds: 12,
    fps: 24,
    closeness: 80,
    notes: 'Previous open-source leader (VBench ~83.1%). Very reliable in ComfyUI, 1.3B tier runs on almost any GPU.',
  },
  {
    key: 'ltx-video-2',
    name: 'LTX-Video 2.x',
    maker: 'Lightricks',
    release: '2025',
    license: 'Community (custom)',
    maxRes: '720p',
    maxSeconds: 10,
    fps: 24,
    closeness: 74,
    notes: 'Fastest free model — great for iterating on hooks. Runs on 8–12GB GPUs, so it is the budget pick.',
  },
  {
    key: 'mochi-1',
    name: 'Mochi 1',
    maker: 'Genmo',
    release: '2025',
    license: 'Apache 2.0',
    maxRes: '480p',
    maxSeconds: 5,
    fps: 30,
    closeness: 70,
    notes: 'Apache 2.0 and easy to fine-tune, but 480p / ~5s clips — best for quick tests, not finals.',
  },
];

const RES_ORDER: VideoModelRes[] = ['480p', '720p', '1080p'];

export const modelMeta = (key: string): VideoModelMeta | undefined =>
  VIDEO_MODELS.find((m) => m.key === key);

export const modelLabel = (key: string): string =>
  modelMeta(key) ? `${modelMeta(key)!.name} (${modelMeta(key)!.maker})` : key || 'Auto';

export interface ModelSelection {
  /** The free model Auto chose. */
  pick: VideoModelMeta;
  /** Every free model that supports the target resolution, best first. */
  ranked: VideoModelMeta[];
  /** True when no free model reaches the requested resolution — we take the highest available. */
  upscaled: boolean;
  /** Human-readable why, for the director pack and UI. */
  reason: string;
}

function resIndex(m: VideoModelMeta): number {
  return RES_ORDER.indexOf(m.maxRes);
}

/**
 * Auto-select the best free video model for the current render settings.
 * Deterministic: the pick is ALWAYS the free model closest to Seedance 2.5
 * (highest closeness — today Wan 2.2, the open-source VBench leader). The
 * requested resolution/length become part of the why, not a disqualifier:
 * free models cap at 1080p, so higher targets are upscaled on render and long
 * reels are stitched from the model's per-clip limit.
 */
export function autoSelectVideoModel(opts: { quality?: string; length?: number } = {}): ModelSelection {
  const wanted: VideoModelRes = opts.quality === '4K' ? '1080p' : opts.quality === '720p' ? '720p' : '1080p';
  const wantedIdx = RES_ORDER.indexOf(wanted);

  const ranked = [...VIDEO_MODELS].sort((a, b) =>
    b.closeness - a.closeness || resIndex(b) - resIndex(a),
  );
  const pick = ranked[0];

  const upscaled = resIndex(pick) < wantedIdx;
  const hdAlt = ranked.find((m) => resIndex(m) >= wantedIdx);
  const altNote = hdAlt && hdAlt.key !== pick.key
    ? ` Need native ${wanted}? Switch to ${hdAlt.name} (${hdAlt.maker}) — slightly further from Seedance at ${hdAlt.closeness}/100, but it renders ${wanted} out of the box.`
    : '';
  const clipNote = opts.length && opts.length > pick.maxSeconds
    ? ` (${pick.maxSeconds}s clips stitched into the ${opts.length}s reel — no free model generates long single takes)`
    : '';
  const resNote = upscaled
    ? ` — no free model reaches ${opts.quality ?? '4K'} natively, so ${pick.maxRes} clips are upscaled on render`
    : '';

  const reason = `Auto chose ${pick.name} by ${pick.maker} — the best free model closest to Seedance 2.5. ` +
    `${pick.license}, ${pick.maxRes}@${pick.fps}fps, up to ${pick.maxSeconds}s per clip${clipNote}. ` +
    `Seedance-closeness ${pick.closeness}/100${resNote}.${altNote}`;

  return { pick, ranked, upscaled, reason };
}
