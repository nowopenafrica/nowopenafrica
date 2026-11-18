import { describe, expect, it } from 'vitest';
import { MOTION_TEMPLATES } from '../../data/motionTemplates';
import {
  applyMotionTimeline, emptyMotionTimeline, motionScenesFromJob, MOTION_SCENE_COUNTS,
  timelineDuplicate, timelineRemove, timelineSetElement, timelineSetSeconds, timelineSplit,
  type MotionStyle,
} from '../motionGraphics';
import { blankMotionProject, motionProjectFromPrompt, motionProjectFromTemplate, type MotionProject } from '../motionProject';
import { RENDER_DIMENSIONS, type RenderAspect } from '../renderVideo';
import { fromMotionProject } from './fromMotionProject';
import { readVideoDocument, videoDurationMs, type MotionSceneClip } from './videoDocument';

const STYLES = Object.keys(MOTION_SCENE_COUNTS) as MotionStyle[];
const ASPECTS = Object.keys(RENDER_DIMENSIONS) as RenderAspect[];

const scenesTrack = (p: MotionProject) => fromMotionProject(p).doc.tracks.find((t) => t.id === 'scenes')!;

describe('fromMotionProject', () => {
  it('converts every style at every aspect into a readable document', () => {
    for (const style of STYLES) {
      for (const aspect of ASPECTS) {
        const p = blankMotionProject(aspect);
        p.brief = { ...p.brief, style };
        const { doc } = fromMotionProject(p);
        /* As stored: a JSON round trip must still read. */
        expect(readVideoDocument(JSON.parse(JSON.stringify(doc))).ok, `${style} ${aspect}`).toBe(true);
        expect(doc.width).toBe(RENDER_DIMENSIONS[aspect].width);
        expect(doc.height).toBe(RENDER_DIMENSIONS[aspect].height);
        expect(scenesTrack(p).clips).toHaveLength(motionScenesFromJob(p.brief).length);
      }
    }
  });

  it('converts every motion template and a prompt-built project', () => {
    for (const t of MOTION_TEMPLATES) expect(() => fromMotionProject(motionProjectFromTemplate(t)), t.key).not.toThrow();
    expect(() => fromMotionProject(motionProjectFromPrompt('A 15 second reel for a lagos bakery opening'))).not.toThrow();
  });

  it('lays scenes end to end, timed as the painter times them', () => {
    const p = blankMotionProject('Vertical');
    const clips = scenesTrack(p).clips as MotionSceneClip[];
    let at = 0;
    for (const c of clips) {
      expect(c.startMs).toBe(at);
      expect(c.durationMs).toBe(c.scene.seconds * 1000);
      at += c.durationMs;
    }
  });

  it('carries the timeline edits: trims, removals, splits, duplicates, caption overrides', () => {
    const p = blankMotionProject('Square');
    p.brief = { ...p.brief, style: 'billboard-led' };
    const base = motionScenesFromJob(p.brief);
    let tl = emptyMotionTimeline(base);
    tl = timelineSetSeconds(tl, base[0].id, 3.5);
    tl = timelineRemove(tl, base[1].id);
    tl = timelineSplit(base, tl, base[2].id, 1);
    tl = timelineDuplicate(base, tl, base[0].id);
    tl = timelineSetElement(tl, base[0].id, 'title', { text: 'OPEN TONIGHT', color: '#ffcc00' });
    p.timeline = tl;

    const expected = applyMotionTimeline(base, tl);
    const clips = scenesTrack(p).clips as MotionSceneClip[];
    expect(clips.map((c) => c.scene.id)).toEqual(expected.map((s) => s.id));
    expect(clips[0].durationMs).toBe(3500);
    expect(clips[0].scene.elements?.title?.text).toBe('OPEN TONIGHT');
    expect(clips.some((c) => c.scene.id === base[1].id)).toBe(false);
    expect(videoDurationMs({ tracks: [scenesTrack(p)] })).toBe(clips.reduce((s, c) => s + c.durationMs, 0));
    /* Ids stay unique even where the storyboard repeats a scene. */
    expect(new Set(clips.map((c) => c.id)).size).toBe(clips.length);
  });

  it('keeps the look the painter needs and records where it came from', () => {
    const p = blankMotionProject('Landscape');
    p.brief = { ...p.brief, style: 'premium-keyart', business: 'Mama Put' };
    p.background = { color: '#112233', strength: 40 };
    const { doc } = fromMotionProject(p, { directionLabel: 'Apple Key Art' });
    const clip = doc.tracks[0].clips[0] as MotionSceneClip;
    expect(clip.look).toMatchObject({
      style: 'premium-keyart', treatment: 'premium', businessName: 'Mama Put',
      directionLabel: 'Apple Key Art', background: { color: '#112233', strength: 40 },
    });
    expect(clip.sceneCount).toBe(doc.tracks[0].clips.length);
    expect(doc.source).toEqual({ kind: 'motion', motionProjectId: p.id });
  });

  it('does not share scene objects with the source project', () => {
    const p = blankMotionProject('Vertical');
    p.timeline = timelineSetElement(emptyMotionTimeline(motionScenesFromJob(p.brief)), 'motion-0', 'title', { text: 'A' });
    const clip = scenesTrack(p).clips[0] as MotionSceneClip;
    clip.scene.elements!.title!.text = 'changed';
    expect(p.timeline.elements?.['motion-0']?.title?.text).toBe('A');
  });

  it('says what it could not carry', () => {
    const p = blankMotionProject('Vertical');
    expect(fromMotionProject(p).dropped).toEqual([]);
    p.render = { ...p.render, source: 'aivideo' };
    expect(fromMotionProject(p).dropped).toHaveLength(1);
  });
});
