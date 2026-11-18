import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Copy, Download, Film, Loader2, Music, Pause, Play, Plus, Redo2, Save, Scissors,
  SkipBack, Trash2, Type, Undo2, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { downloadBlob } from '../lib/studio';
import { STUDIO_BUCKET } from '../lib/studio/designAssets';
import { decideOpen } from '../lib/studio/projectKind';
import { autosaveDecision, AUTOSAVE_DELAY_MS, SAVE_LABEL, type SaveState } from '../lib/studio/autosave';
import { emptyHistory, record, redo as redoStep, undo as undoStep, canUndo, canRedo, type History } from '../lib/studio/history';
import {
  blankVideoDocument, clipAt, formatTime, readVideoDocument, videoDurationMs, videoId,
  type AudioClip, type Clip, type MediaClip, type TextClip, type TrackKind, type VideoDocument,
} from '../lib/studio/videoDocument';
import {
  addTrack, deleteClip, duplicateClip, findClip, firstTrackFor, insertClip, removeTrack,
  setClipDuration, setTrackFlag, splitClip, updateClip,
} from '../lib/studio/videoEdit';
import { audioGainAt, drawVideoFrame, sourceSecondsAt, type MediaSource } from '../lib/studio/videoCompositor';
import { ACCEPT_ATTR, assetLabel, checkMediaFile, mediaPath, probeMedia } from '../lib/studio/videoAssets';
import { fromMotionProject } from '../lib/studio/fromMotionProject';
import { resolveWeight } from '../lib/studio/textStyle';
import { loadMotionProjects, type MotionProject } from '../lib/motionProject';
import VideoTimeline from '../components/video/VideoTimeline';
import VideoInspector from '../components/video/VideoInspector';

/*
 * Video Studio — Phase C of docs/superpowers/specs/2026-11-18-create-multi-studio-architecture.md.
 *
 * A real timeline editor over a VideoDocument stored in design_projects
 * (kind = 'video'). The design editor's hard-won rules are reused, not
 * re-derived: version-checked saves, autosave only after a first save, a
 * conflict that stops autosave for good, and the address following the first
 * save so a reload reopens the project.
 *
 * NOT here yet, and the UI does not pretend otherwise: video file export
 * (Phase D), proxies for large footage, captions, keyframe editing UI.
 */

const FORMATS: { key: string; label: string; w: number; h: number }[] = [
  { key: '9x16', label: 'Vertical 9:16 — Reels, TikTok, Shorts', w: 1080, h: 1920 },
  { key: '1x1', label: 'Square 1:1', w: 1080, h: 1080 },
  { key: '4x5', label: 'Portrait 4:5', w: 1080, h: 1350 },
  { key: '16x9', label: 'Landscape 16:9 — YouTube, screens', w: 1920, h: 1080 },
];

const publicUrl = (path: string) => supabase.storage.from(STUDIO_BUCKET).getPublicUrl(path).data.publicUrl;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export default function VideoStudio() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDocState] = useState<VideoDocument | null>(null);
  const [history, setHistory] = useState<History<VideoDocument>>(emptyHistory());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pps, setPps] = useState(60);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  const docRef = useRef<VideoDocument | null>(null);
  docRef.current = doc;
  const playheadRef = useRef(0);
  playheadRef.current = playheadMs;
  const projectIdRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const media = useRef(new Map<string, HTMLImageElement | HTMLVideoElement | HTMLAudioElement>());

  useEffect(() => { applySeo({ title: 'Video Studio — NowOpen Create', description: 'Edit videos on a real timeline.' }); }, []);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  /** Every edit that should be undoable goes through here. Identity means "nothing changed". */
  const mutate = useCallback((next: VideoDocument) => {
    const cur = docRef.current;
    if (!cur || next === cur) return;
    setHistory((h) => record(h, cur));
    setDocState(next);
    setSaveState((s) => (s === 'conflict' ? s : 'unsaved'));
  }, []);

  // ── loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (id && id === projectIdRef.current && docRef.current) { setLoading(false); return; }
      setLoading(true);
      setProblem(null);
      if (!id) { setDocState(null); setLoading(false); return; }
      const { data, error } = await supabase.from('design_projects').select('id, kind, document, version, title').eq('id', id).maybeSingle();
      if (cancelled) return;
      if (error) { setProblem(`Could not open that project: ${error.message}`); setLoading(false); return; }
      if (!data) { setProblem('That project does not exist, or it is not yours.'); setLoading(false); return; }
      const decision = decideOpen('video', (data as { kind?: unknown }).kind, id);
      if (decision.action === 'redirect') { navigate(decision.path, { replace: true }); return; }
      if (decision.action === 'refuse') { setProblem(decision.reason); setLoading(false); return; }
      const read = readVideoDocument((data as { document: unknown }).document);
      if (!read.ok) { setProblem(read.reason); setLoading(false); return; }
      projectIdRef.current = id;
      setProjectId(id);
      setVersion((data as { version: number }).version);
      setDocState(read.doc);
      setHistory(emptyHistory());
      setSaveState('saved');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  // ── saving ─────────────────────────────────────────────────────────────

  const insertProject = useCallback(async (d: VideoDocument): Promise<string | null> => {
    if (!user) { toast.error('Sign in to save this video to your account.'); return null; }
    setSaveState('saving');
    const { data, error } = await supabase.from('design_projects')
      .insert({ user_id: user.id, kind: 'video', title: d.title, document: d, source_template_key: null })
      .select('id, version').single();
    if (error || !data) { setSaveState('error'); toast.error(`Could not save: ${error?.message ?? 'unknown error'}`); return null; }
    const newId = (data as { id: string }).id;
    projectIdRef.current = newId;
    setProjectId(newId);
    setVersion((data as { version: number }).version);
    setSaveState('saved');
    navigate(`/media/video/${newId}`, { replace: true });
    return newId;
  }, [user, navigate]);

  const save = useCallback(async (): Promise<boolean> => {
    const d = docRef.current;
    if (!d) return false;
    if (!projectIdRef.current) return (await insertProject(d)) !== null;
    setSaveState('saving');
    const { data, error } = await supabase.rpc('save_design_project', {
      p_id: projectIdRef.current, p_document: d, p_expected_version: version, p_title: d.title, p_thumbnail_path: null,
    });
    if (error) { setSaveState('error'); toast.error(`Could not save: ${error.message}`); return false; }
    if (data === null) {
      setSaveState('conflict');
      toast.error('This video was saved somewhere else since you opened it. Reload to get the newer version.');
      return false;
    }
    setVersion(data as number);
    /* Edits made while the write was in flight are still unsaved. */
    setSaveState(docRef.current === d ? 'saved' : 'unsaved');
    return true;
  }, [insertProject, version]);

  const saveRef = useRef(save);
  saveRef.current = save;
  const autosave = autosaveDecision({ signedIn: !!user, projectId, state: saveState, online });
  useEffect(() => {
    if (!autosave.save) return;
    const t = window.setTimeout(() => { void saveRef.current(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [autosave.save, doc]);

  // ── media elements ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!doc) return;
    const map = media.current;
    for (const [assetId, a] of Object.entries(doc.assets)) {
      if (map.has(assetId)) continue;
      const url = publicUrl(a.proxyPath ?? a.path);
      if (a.kind === 'image') {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        map.set(assetId, img);
      } else {
        const el = document.createElement(a.kind === 'video' ? 'video' : 'audio');
        el.crossOrigin = 'anonymous';
        el.preload = 'auto';
        (el as HTMLVideoElement).playsInline = true;
        el.src = url;
        map.set(assetId, el);
      }
    }
  }, [doc]);

  useEffect(() => () => {
    for (const el of media.current.values()) if (!(el instanceof HTMLImageElement)) { el.pause(); el.removeAttribute('src'); el.load(); }
  }, []);

  /** Keep every <video>/<audio> at the right place for timeline time `ms`. */
  const syncMedia = useCallback((d: VideoDocument, ms: number, isPlaying: boolean) => {
    const active = new Set<HTMLMediaElement>();
    for (const t of d.tracks) {
      const c = clipAt(t, ms);
      if (!c || (c.type !== 'media' && c.type !== 'audio')) continue;
      const el = media.current.get(c.assetId);
      if (!el || el instanceof HTMLImageElement) continue;
      active.add(el);
      const want = sourceSecondsAt(c, ms);
      if (c.type === 'audio') el.volume = Math.min(1, audioGainAt(c, ms));
      else el.volume = Math.min(1, Math.max(0, (c as MediaClip).volume ?? 1));
      el.muted = t.muted || (t.kind !== 'audio' && t.hidden);
      if (Math.abs(el.currentTime - want) > (isPlaying ? 0.25 : 0.04)) {
        try { el.currentTime = want; } catch { /* not seekable yet */ }
      }
      if (isPlaying && el.paused) void el.play().catch(() => { /* autoplay refused until a gesture */ });
      if (!isPlaying && !el.paused) el.pause();
    }
    for (const el of media.current.values()) {
      if (el instanceof HTMLImageElement || active.has(el)) continue;
      if (!el.paused) el.pause();
    }
  }, []);

  // ── playback + drawing ─────────────────────────────────────────────────

  const playingRef = useRef(false);
  playingRef.current = playing;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const d = docRef.current;
      const canvas = canvasRef.current;
      if (d && canvas) {
        let ms = playheadRef.current;
        if (playingRef.current) {
          ms += now - last;
          const end = videoDurationMs(d);
          if (ms >= end) { ms = end; setPlaying(false); }
          playheadRef.current = ms;
          setPlayheadMs(ms);
        }
        syncMedia(d, ms, playingRef.current);
        if (canvas.width !== d.width) canvas.width = d.width;
        if (canvas.height !== d.height) canvas.height = d.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawVideoFrame(ctx, d, ms, {
            media: (assetId) => {
              const el = media.current.get(assetId);
              return el && !(el instanceof HTMLAudioElement) ? (el as MediaSource) : null;
            },
          });
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [syncMedia]);

  const togglePlay = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    if (!playingRef.current && playheadRef.current >= videoDurationMs(d)) setPlayheadMs(0);
    setPlaying((p) => !p);
  }, []);

  const seek = useCallback((ms: number) => { setPlaying(false); setPlayheadMs(Math.max(0, ms)); }, []);

  // ── editing commands ───────────────────────────────────────────────────

  const selected = useMemo(() => (doc && selectedId ? findClip(doc, selectedId) : null), [doc, selectedId]);

  const undo = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const r = undoStep(history, d);
    if (!r) return;
    setHistory(r.history);
    setDocState(r.present);
    setSaveState((s) => (s === 'conflict' ? s : 'unsaved'));
  }, [history]);

  const redo = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const r = redoStep(history, d);
    if (!r) return;
    setHistory(r.history);
    setDocState(r.present);
    setSaveState((s) => (s === 'conflict' ? s : 'unsaved'));
  }, [history]);

  const refuse = (why: string) => toast(why, { icon: 'ℹ️' });

  const splitAtPlayhead = useCallback(() => {
    const d = docRef.current;
    if (!d) return;
    const targetId = selectedId && findClip(d, selectedId) ? selectedId : null;
    const candidates = targetId ? [targetId] : d.tracks.map((t) => clipAt(t, playheadRef.current)?.id).filter((x): x is string => !!x);
    let next = d;
    for (const cid of candidates) next = splitClip(next, cid, playheadRef.current);
    if (next === d) refuse('Put the playhead inside a clip, at least 0.1 s from either end, to split it.');
    mutate(next);
  }, [mutate, selectedId]);

  const removeSelected = useCallback(() => {
    const d = docRef.current;
    if (!d || !selectedId) return;
    const next = deleteClip(d, selectedId);
    if (next === d) { refuse('That track is locked.'); return; }
    mutate(next);
    setSelectedId(null);
  }, [mutate, selectedId]);

  const duplicateSelected = useCallback(() => {
    const d = docRef.current;
    if (!d || !selectedId) return;
    const newId = videoId('c');
    const next = duplicateClip(d, selectedId, newId);
    if (next === d) { refuse('That track is locked.'); return; }
    mutate(next);
    setSelectedId(newId);
  }, [mutate, selectedId]);

  const addClip = (clip: Clip) => {
    const d = docRef.current;
    if (!d) return;
    let target = firstTrackFor(d, clip.type);
    let base = d;
    if (!target) {
      const kind: TrackKind = clip.type === 'audio' ? 'audio' : clip.type === 'text' ? 'text' : 'video';
      base = addTrack(d, kind);
      target = firstTrackFor(base, clip.type);
    }
    if (!target) return;
    mutate(insertClip(base, target.id, clip));
    setSelectedId(clip.id);
  };

  const addText = () => {
    const clip: TextClip = {
      id: videoId('c'), type: 'text', startMs: Math.round(playheadRef.current), durationMs: 3000, text: 'Your headline',
      transform: { x: 0.08, y: 0.42, w: 0.84, h: 0.16, rotation: 0, opacity: 1 },
      /* The face's own nearest weight: asking for one it lacks gets a smeared synthetic bold. */
      style: { font: 'sans', size: 0.08, weight: resolveWeight('sans', 700), color: '#ffffff', align: 'center', letterSpacing: 0, lineHeight: 1.1 },
      transitionIn: { type: 'fade', ms: 400 },
    };
    addClip(clip);
  };

  const onFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    if (!user) { toast.error('Sign in to upload media.'); return; }
    setUploading(true);
    try {
      for (const file of files) {
        const check = checkMediaFile(file);
        if (!check.ok) { toast.error(check.reason); continue; }
        let facts;
        try { facts = await probeMedia(file, check.kind); } catch (err) { toast.error(err instanceof Error ? err.message : 'That file could not be read.'); continue; }
        const path = mediaPath(user.id, check.ext);
        const { error } = await supabase.storage.from(STUDIO_BUCKET).upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
        if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
        const assetId = videoId('a');
        const d = docRef.current!;
        const withAsset: VideoDocument = { ...d, assets: { ...d.assets, [assetId]: { kind: check.kind, path, ...facts } } };
        const start = Math.round(playheadRef.current);
        const len = check.kind === 'image' ? 3000 : Math.max(100, Math.min(facts.durationMs ?? 5000, 60_000));
        const clip: Clip = check.kind === 'audio'
          ? { id: videoId('c'), type: 'audio', assetId, startMs: start, durationMs: len, inMs: 0, volume: 1, fadeInMs: 0, fadeOutMs: 0 } satisfies AudioClip
          : { id: videoId('c'), type: 'media', assetId, startMs: start, durationMs: len, inMs: 0, transform: { x: 0, y: 0, w: 1, h: 1, rotation: 0, opacity: 1 }, volume: 1 } satisfies MediaClip;
        docRef.current = withAsset;
        setDocState(withAsset);
        addClip(clip);
        toast.success(`${assetLabel(check.kind, path)} added.`);
      }
    } finally {
      setUploading(false);
    }
  };

  const downloadFrame = async () => {
    const d = docRef.current;
    if (!d) return;
    const c = document.createElement('canvas');
    c.width = d.width;
    c.height = d.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    drawVideoFrame(ctx, d, playheadRef.current, { media: (a) => { const el = media.current.get(a); return el && !(el instanceof HTMLAudioElement) ? (el as MediaSource) : null; } });
    c.toBlob((blob) => {
      if (!blob) { toast.error('This frame could not be saved.'); return; }
      downloadBlob(blob, `${d.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'frame'}-${formatTime(playheadRef.current).replace(':', 'm')}s.png`);
    }, 'image/png');
  };

  // ── keyboard ───────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !docRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      else if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
      else if (e.key.toLowerCase() === 's' && !mod) { e.preventDefault(); splitAtPlayhead(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1000 : 1000 / docRef.current.fps;
        seek(playheadRef.current + (e.key === 'ArrowLeft' ? -step : step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, undo, redo, duplicateSelected, splitAtPlayhead, removeSelected, seek, save]);

  // ── start screen ───────────────────────────────────────────────────────

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-gray-400" /></div>;

  if (problem) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{problem}</p>
          <Link to="/media/video" className="text-sm underline">Start a new video</Link>
        </div>
      </div>
    );
  }

  if (!doc) {
    return <StartScreen
      onBlank={(w, h) => { setDocState(blankVideoDocument(w, h)); setHistory(emptyHistory()); setSaveState('unsaved'); }}
      onMotion={async (p) => {
        const label = params.get('label') ?? undefined;
        const { doc: converted, dropped } = fromMotionProject(p, { directionLabel: label });
        setDocState(converted);
        setHistory(emptyHistory());
        dropped.forEach((m) => toast(m, { icon: 'ℹ️' }));
        if (user) await insertProject(converted);
        else setSaveState('unsaved');
      }}
      preselect={params.get('motion')}
    />;
  }

  const duration = videoDurationMs(doc);
  const lockedSel = selected?.track.locked ?? false;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 py-2 border-b border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto">
        <Link to="/media" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Back to Create"><ArrowLeft size={16} /></Link>
        <Film size={16} className="text-gray-500 shrink-0" aria-hidden />
        <input
          aria-label="Video title"
          className="min-w-[10rem] bg-transparent text-sm font-semibold px-1 rounded focus:outline focus:outline-1"
          value={doc.title}
          onChange={(e) => mutate({ ...doc, title: e.target.value })}
        />
        <span className="text-xs text-gray-500 whitespace-nowrap" title={autosave.reason}>{SAVE_LABEL[saveState]}</span>
        <div className="flex-1" />
        <button type="button" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40" aria-label="Undo" disabled={!canUndo(history)} onClick={undo}><Undo2 size={16} /></button>
        <button type="button" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40" aria-label="Redo" disabled={!canRedo(history)} onClick={redo}><Redo2 size={16} /></button>
        <select
          aria-label="Frame size"
          className="text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-1 py-1"
          value={FORMATS.find((f) => f.w === doc.width && f.h === doc.height)?.key ?? 'custom'}
          onChange={(e) => { const f = FORMATS.find((x) => x.key === e.target.value); if (f) mutate({ ...doc, width: f.w, height: f.h }); }}
        >
          {FORMATS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          {!FORMATS.some((f) => f.w === doc.width && f.h === doc.height) ? <option value="custom">{doc.width}×{doc.height}</option> : null}
        </select>
        <button type="button" onClick={() => void downloadFrame()} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 whitespace-nowrap" title="Save the frame under the playhead as a PNG. Video export is the next phase.">
          <Download size={14} /> Frame PNG
        </button>
        <button type="button" onClick={() => void save()} disabled={saveState === 'saving' || saveState === 'conflict'}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 whitespace-nowrap">
          <Save size={14} /> Save
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Preview */}
        <main className="flex-1 flex flex-col items-center justify-center p-3 gap-2 min-h-0">
          <div className="flex-1 w-full min-h-[240px] grid place-items-center">
            <canvas
              ref={canvasRef}
              aria-label={`Preview of ${doc.title}, ${doc.width} by ${doc.height}`}
              className="bg-black shadow max-w-full max-h-[52vh] lg:max-h-[58vh]"
              style={{ aspectRatio: `${doc.width} / ${doc.height}` }}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button type="button" className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-800" aria-label="Go to start" onClick={() => seek(0)}><SkipBack size={16} /></button>
            <button type="button" className="p-2 rounded-full bg-gray-900 text-white dark:bg-white dark:text-gray-900" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <span className="tabular-nums text-xs text-gray-600 dark:text-gray-400">{formatTime(playheadMs)} / {formatTime(duration)}</span>
            <span className="text-xs text-gray-500">· {doc.width}×{doc.height} · {doc.fps} fps</span>
          </div>
        </main>

        {/* Side panel */}
        <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 overflow-y-auto lg:max-h-[calc(100vh-49px-14rem)]">
          <div className="flex flex-wrap gap-2 mb-4">
            <button type="button" onClick={addText} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700"><Type size={14} /> Text</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 disabled:opacity-50">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Video, image or sound
            </button>
            <input ref={fileRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={(e) => void onFiles(e)} />
          </div>
          {selected ? (
            <>
              <div className="flex items-center gap-1 mb-3">
                <h2 className="flex-1 text-sm font-semibold capitalize">{selected.clip.type === 'motion-scene' ? 'Motion scene' : selected.clip.type === 'media' ? 'Picture' : selected.clip.type}</h2>
                <button type="button" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Split at playhead (S)" title="Split at playhead (S)" onClick={splitAtPlayhead}><Scissors size={14} /></button>
                <button type="button" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Duplicate (Ctrl+D)" title="Duplicate (Ctrl+D)" onClick={duplicateSelected}><Copy size={14} /></button>
                <button type="button" className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Delete (Del)" title="Delete (Del)" onClick={removeSelected}><Trash2 size={14} /></button>
              </div>
              <VideoInspector
                doc={doc}
                clip={selected.clip}
                locked={lockedSel}
                onPatch={(patch) => mutate(updateClip(doc, selected.clip.id, patch as never))}
                onDuration={(ms) => {
                  const next = setClipDuration(doc, selected.clip.id, ms);
                  if (next === doc) refuse('That length would overlap the next clip or run past the end of the footage.');
                  mutate(next);
                }}
              />
            </>
          ) : (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <p>Select a clip on the timeline to edit it.</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Drag a clip to move it, or onto another track of the same kind.</li>
                <li>Drag either end to trim. Edges snap to other clips and the playhead.</li>
                <li><kbd>Space</kbd> play · <kbd>S</kbd> split · <kbd>Del</kbd> delete · <kbd>Ctrl+D</kbd> duplicate · <kbd>←/→</kbd> one frame.</li>
              </ul>
              <p className="pt-2">Video file export (MP4) is the next phase. Until then, <em>Frame PNG</em> saves the frame under the playhead.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Timeline */}
      <section aria-label="Timeline" className="border-t border-gray-300 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-gray-800 text-xs overflow-x-auto">
          <span className="font-medium">Tracks</span>
          {(['video', 'overlay', 'text', 'audio'] as TrackKind[]).map((k) => (
            <button key={k} type="button" className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 capitalize whitespace-nowrap"
              onClick={() => mutate(addTrack(doc, k))}>
              <Plus size={12} /> {k === 'audio' ? <Music size={12} aria-hidden /> : null}{k}
            </button>
          ))}
          <div className="flex-1" />
          <button type="button" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Zoom out" onClick={() => setPps((p) => Math.max(10, Math.round(p / 1.5)))}><ZoomOut size={14} /></button>
          <button type="button" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Zoom in" onClick={() => setPps((p) => Math.min(400, Math.round(p * 1.5)))}><ZoomIn size={14} /></button>
        </div>
        <div className="max-h-[14rem] overflow-y-auto">
          <VideoTimeline
            doc={doc}
            selectedId={selectedId}
            playheadMs={playheadMs}
            pps={pps}
            onSelect={setSelectedId}
            onSeek={seek}
            onLive={(d) => { docRef.current = d; setDocState(d); }}
            onCommit={(base) => {
              const now = docRef.current;
              if (!now || now === base) return;
              setHistory((h) => record(h, base));
              setSaveState((s) => (s === 'conflict' ? s : 'unsaved'));
            }}
            onTrackFlag={(tid, flag, value) => mutate(setTrackFlag(doc, tid, flag, value))}
            onRemoveTrack={(tid) => mutate(removeTrack(doc, tid))}
          />
        </div>
      </section>
    </div>
  );
}

// ── start screen ────────────────────────────────────────────────────────────

function StartScreen({ onBlank, onMotion, preselect }: {
  onBlank: (w: number, h: number) => void;
  onMotion: (p: MotionProject) => Promise<void>;
  preselect: string | null;
}) {
  const projects = useMemo(() => loadMotionProjects(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);

  /* Arriving from Motion Studio with ?motion=<id> opens that project straight away. */
  useEffect(() => {
    if (!preselect || started.current) return;
    const p = projects.find((x) => x.id === preselect);
    if (!p) return;
    started.current = true;
    setBusy(p.id);
    void onMotion(p).finally(() => setBusy(null));
  }, [preselect, projects, onMotion]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <Link to="/media" className="text-sm inline-flex items-center gap-1 text-gray-600 dark:text-gray-400"><ArrowLeft size={14} /> Create</Link>
          <h1 className="text-2xl font-semibold mt-3">Video Studio</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Edit footage, pictures, words and sound on a timeline.</p>
        </div>

        <section>
          <h2 className="text-sm font-semibold mb-3">Start a new video</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FORMATS.map((f) => (
              <button key={f.key} type="button" onClick={() => onBlank(f.w, f.h)}
                className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 text-left hover:border-blue-500">
                <span className="block mx-auto mb-2 bg-gray-200 dark:bg-gray-700 rounded" style={{ aspectRatio: `${f.w} / ${f.h}`, height: 64 }} aria-hidden />
                <span className="block text-xs font-medium">{f.label}</span>
                <span className="block text-[11px] text-gray-500">{f.w}×{f.h}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-1">Open a Motion Studio project</h2>
          <p className="text-xs text-gray-500 mb-3">
            Motion Studio keeps projects in this browser only. Opening one here copies it into your account as an editable video; the original stays where it is.
          </p>
          {projects.length === 0 ? (
            <p className="text-sm text-gray-500">No Motion Studio projects in this browser.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{p.name}</span>
                    <span className="block text-[11px] text-gray-500">{p.brief.style} · {p.brief.aspect} · updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                  </span>
                  <button type="button" disabled={busy !== null}
                    onClick={() => { setBusy(p.id); void onMotion(p).finally(() => setBusy(null)); }}
                    className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 inline-flex items-center gap-1">
                    {busy === p.id ? <Loader2 size={12} className="animate-spin" /> : null} Open as video
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
