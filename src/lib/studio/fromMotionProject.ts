/**
 * Motion project → Video Studio document.
 *
 * Motion Graphics Studio keeps its projects in this browser only
 * (localStorage `nowopen_motion_projects`). This adapter turns one into a
 * VideoDocument so it can live in `design_projects` (kind = 'video') and be
 * edited on a real timeline.
 *
 * It converts, it does not redraw: each storyboard scene becomes one
 * `motion-scene` clip that the existing painter (lib/renderVideo.ts) renders
 * exactly as Motion Studio did, with the timeline edits (order, trims,
 * splits, duplicates, removals, caption overrides) already applied.
 *
 * What does NOT come across, and why:
 * - Uploaded background layers. Motion Studio never persisted them (they are
 *   session-local object URLs), so there is nothing to convert. Reported in
 *   `dropped` so the import can say so.
 * - AI-video render settings. Generated footage is a separate capability
 *   (spec §13); the timeline does not depend on it.
 */

import { applyMotionTimeline, motionScenesFromJob, MOTION_TREATMENT_FOR_STYLE } from '../motionGraphics';
import type { MotionProject } from '../motionProject';
import { RENDER_DIMENSIONS, RENDER_FPS } from '../renderVideo';
import {
  VIDEO_SCHEMA_VERSION, blankTrack, readVideoDocument,
  type MotionSceneClip, type VideoDocument, type VideoFps,
} from './videoDocument';

export interface MotionConversion {
  doc: VideoDocument;
  /** Plain-language notes on anything that did not carry over. Empty when nothing was lost. */
  dropped: string[];
}

/** Seconds as the painter times them (whole frames, at least one second), in ms. */
function sceneMs(seconds: number, fps: number): number {
  const frames = Math.max(fps, Math.round(seconds * fps));
  return Math.round((frames * 1000) / fps);
}

export function fromMotionProject(
  project: MotionProject,
  opts: { directionLabel?: string } = {},
): MotionConversion {
  const brief = project.brief;
  const fps = RENDER_FPS as VideoFps;
  const { width, height } = RENDER_DIMENSIONS[brief.aspect];
  const scenes = applyMotionTimeline(motionScenesFromJob(brief), project.timeline);
  const dropped: string[] = [];

  const look: MotionSceneClip['look'] = {
    style: brief.style,
    treatment: MOTION_TREATMENT_FOR_STYLE[brief.style],
    palette: [...project.palette] as [string, string, string],
    businessName: brief.business || 'NowOpen',
    directionLabel: opts.directionLabel ?? 'Motion',
    hook: brief.headline,
    cta: brief.cta,
    logoEmoji: brief.logoEmoji || '✦',
    ...(project.background ? { background: { ...project.background } } : {}),
    ...(project.templateKey ? { templateKey: project.templateKey } : {}),
  };

  const track = blankTrack('video', 'Scenes', 'scenes');
  let at = 0;
  const seen = new Set<string>();
  scenes.forEach((scene, i) => {
    /* A duplicated clip can carry its source's id; a timeline needs every id once. */
    let id = `scene-${scene.id}`;
    for (let n = 2; seen.has(id); n++) id = `scene-${scene.id}-${n}`;
    seen.add(id);
    const durationMs = sceneMs(scene.seconds, fps);
    track.clips.push({
      id,
      type: 'motion-scene',
      startMs: at,
      durationMs,
      scene: JSON.parse(JSON.stringify(scene)),
      sceneIndex: i,
      sceneCount: scenes.length,
      look,
    });
    at += durationMs;
  });

  if (project.render?.source === 'aivideo') {
    dropped.push('AI video footage settings were not carried over; the scenes are kept as designed motion.');
  }

  const doc: VideoDocument = {
    schemaVersion: VIDEO_SCHEMA_VERSION,
    title: project.name?.trim() || 'Untitled video',
    width,
    height,
    fps,
    tracks: [track, blankTrack('text', 'Text 1', 'text-1'), blankTrack('audio', 'Audio 1', 'audio-1')],
    assets: {},
    source: { kind: 'motion', motionProjectId: project.id, ...(project.templateKey ? { templateKey: project.templateKey } : {}) },
  };

  /* Never hand back a document the editor would refuse to open. */
  const read = readVideoDocument(doc);
  if (!read.ok) throw new Error(`Motion conversion produced an unreadable document: ${read.reason}`);
  return { doc: read.doc, dropped };
}
