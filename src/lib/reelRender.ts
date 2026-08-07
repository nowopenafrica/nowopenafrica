// Bridge between the reel script generator and the video render engine.
//
// lib/video.ts writes a shootable reel script (ReelScene: caption, direction,
// voiceover). lib/renderVideo.ts films a storyboard (DirectorScene: text,
// camera, grading, motion, transition). The two were written for different
// callers and never met — which is why video.ts had no consumers at all and
// the only way to render anything was through the AI Creative Director.
//
// This is the missing adapter, kept as a pure function so the mapping is
// testable without a canvas. Everything the render engine needs but a reel
// script doesn't carry (camera move, grading, motion) is derived
// deterministically from the scene's position, so the same script always films
// the same way — the property the rest of Studio already relies on.

import type { DirectorScene } from './creativeDirector';
import type { ReelScene, ReelScript } from './video';

/**
 * Camera language, cycled by scene position.
 *
 * Position rather than random: a reel opens on a hook that wants energy, sits
 * in the middle explaining, and closes on a call to action that wants to hold
 * still long enough to read. Cycling by index gives that arc for free and keeps
 * the render deterministic.
 */
const CAMERA_BY_POSITION = ['Punch-in zoom', 'Slow push-in', 'Tracking shot', 'Rack focus', 'Static tripod'];
const MOTION_BY_POSITION = ['Energetic', 'Steady', 'Steady', 'Gentle', 'Hold'];

/** The last scene holds on a cut so the call to action doesn't fade mid-read. */
function transitionFor(index: number, total: number): 'cut' | 'fade' {
  return index === total - 1 ? 'cut' : 'fade';
}

export function directorSceneFromReel(scene: ReelScene, index: number, total: number): DirectorScene {
  return {
    id: scene.id,
    order: index,
    seconds: Math.max(1, Math.round(scene.duration)),
    text: scene.caption,
    direction: scene.direction,
    camera: CAMERA_BY_POSITION[index % CAMERA_BY_POSITION.length],
    voiceover: scene.voiceover,
    transition: transitionFor(index, total),
    grading: 'Warm daylight',
    motion: MOTION_BY_POSITION[index % MOTION_BY_POSITION.length],
  };
}

export function directorScenesFromReel(script: ReelScript): DirectorScene[] {
  const total = script.scenes.length;
  return script.scenes.map((s, i) => directorSceneFromReel(s, i, total));
}

/**
 * The voiceover script, as something a person can actually read while filming.
 *
 * Numbered with the running clock, because the practical question on set is
 * "how long do I have for this line?", not "what is scene 3".
 */
export function voiceoverScript(script: ReelScript): string {
  let elapsed = 0;
  const lines = script.scenes.map((s, i) => {
    const start = elapsed;
    elapsed += s.duration;
    return `${i + 1}. [${start}s–${elapsed}s] ${s.voiceover}`;
  });
  return [`${script.title} — voiceover`, '', ...lines].join('\n');
}

/** The shot list, for whoever is holding the phone. */
export function shotList(script: ReelScript): string {
  const lines = script.scenes.map((s, i) => `${i + 1}. (${s.duration}s) ${s.direction}\n   On screen: ${s.caption}`);
  return [`${script.title} — shot list`, '', ...lines].join('\n');
}
