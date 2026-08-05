import { useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import {
  FileText, Clapperboard, ScrollText, Mic, Image as ImageIcon, Spline, Zap,
  Download, Building2, Target, Lightbulb, Film, Sparkles, MonitorPlay,
  SlidersHorizontal, Rocket, Wand2, Copy, Eye, RefreshCcw, Star, Upload, X,
  CheckCircle2, MessageCircle, PlayCircle, ArrowRight, Palette, Music, Type,
  Gauge, Timer, Smartphone, LayoutTemplate, Send, Trash2, Images, History,
  Cpu, Video, KeyRound,
} from 'lucide-react';
import { Business } from '../../types';
import {
  buildCreativeBrief, regenerateScene, directorPackText, CREATIVE_DIRECTIONS,
  directionByKey, saveDirectorBrief, loadDirectorBriefs,
  deleteDirectorBrief, buildDirectorBriefRecord,
  type CreativeDirection, type CreativeBrief, type DirectorScene,
  type DirectorBriefRecord, type DirectorBriefSettings,
} from '../../lib/creativeDirector';
import {
  generateVideoProject, VOICEOVER_OPTIONS, SUBTITLE_STYLES,
  loadProjects, saveProjects, type VideoProject, type VideoFormat, type UploadMedia,
} from '../../lib/videoCreator';
import {
  renderVideo, renderPoster, renderContactSheet, renderSceneStill,
  type RenderAspect, type SceneFrameOptions,
} from '../../lib/renderVideo';
import { publishPost, type PublishOutcome, type PublishMedia } from '../../lib/socialPublish';
import { SOCIAL_CHANNELS, channelLabel } from '../../lib/publisher';
import {
  autoSelectVideoModel, VIDEO_MODELS, modelMeta, modelLabel, SEEDANCE_REFERENCE,
  type ModelSelection,
} from '../../lib/videoModels';
import {
  resolveFootage, getStockApiKey, hasStockApiKey, setStockApiKey,
  type StockClip, type FootageAspect,
} from '../../lib/stockFootage';
import { voiceoverProfile, pickPreviewVoice } from '../../lib/voicePreview';
import {
  AI_IMAGE_MODELS, AI_VIDEO_MODELS, aspectDimensions, aiPromptForScene,
  aiSeedFor, pollinationsImageUrl, pollinationsVideoUrl, fetchAiImage,
  type AiImageModel, type AiVideoModel,
} from '../../lib/pollinations';
import { downloadText, downloadUrl, slugForFile } from '../../lib/studio';

const selectClass = 'w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500';
const chip = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition';

type TabKey = 'brief' | 'storyboard' | 'script' | 'voiceover' | 'media' | 'motion' | 'generate' | 'export';

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: 'brief', label: 'Creative Brief', icon: FileText },
  { key: 'storyboard', label: 'Storyboard', icon: Clapperboard },
  { key: 'script', label: 'Script', icon: ScrollText },
  { key: 'voiceover', label: 'Voiceover', icon: Mic },
  { key: 'media', label: 'Media', icon: ImageIcon },
  { key: 'motion', label: 'Motion Graphics', icon: Spline },
  { key: 'generate', label: 'Generate', icon: Zap },
  { key: 'export', label: 'Export', icon: Download },
];

const PIPELINE: { label: string; icon: typeof FileText }[] = [
  { label: 'Business Profile', icon: Building2 },
  { label: 'Business Goal', icon: Target },
  { label: 'AI Creative Director', icon: Clapperboard },
  { label: 'Campaign Idea', icon: Lightbulb },
  { label: 'Storyboard', icon: Film },
  { label: 'Script', icon: ScrollText },
  { label: 'Director Notes', icon: Sparkles },
  { label: 'AI Video Generator', icon: Wand2 },
  { label: '4K Video', icon: MonitorPlay },
  { label: 'Edit', icon: SlidersHorizontal },
  { label: 'Export', icon: Download },
  { label: 'Publish', icon: Rocket },
];

const EXAMPLES = [
  'I want more customers this weekend',
  'Promote my new product launch on instagram',
  'Black Friday offer for my restaurant — 30 second reel',
  'We need more bookings at the salon this month',
];

const SCENE_EMOJI = ['🎬', '📦', '🔥', '✨', '🎥', '🌟', '⏰', '👋', '💎', '🏆'];

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={11} className={i <= n ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'} />
      ))}
    </span>
  );
}

function MetricBar({ label, score }: { label: string; score: number }) {
  const tone = score >= 8.5 ? 'from-green-500 to-emerald-400' : score >= 7 ? 'from-amber-500 to-orange-400' : 'from-rose-500 to-red-400';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{label}</span>
        <span className="text-xs font-black text-gray-900 dark:text-white">{score.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  );
}

function Panel({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

export default function CreativeDirectorStudio({ business }: { business: Business }) {
  const [brief, setBrief] = useState('');
  const [direction, setDirection] = useState<CreativeDirection>('commercial');
  const [result, setResult] = useState<CreativeBrief | null>(null);
  const [scenes, setScenes] = useState<DirectorScene[]>([]);
  const [tab, setTab] = useState<TabKey>('brief');

  const [voiceover, setVoiceover] = useState('female-nigerian');
  const [titles, setTitles] = useState('apple');
  const [logoAnimation, setLogoAnimation] = useState(true);
  const [callouts, setCallouts] = useState(false);
  const [transitionPref, setTransitionPref] = useState('Auto');

  const [quality, setQuality] = useState('1080p');
  const [length, setLength] = useState(30);
  const [container, setContainer] = useState<'MP4' | 'MOV'>('MP4');
  const [aspect, setAspect] = useState<'Square' | 'Vertical' | 'Landscape'>('Vertical');
  const [modelPref, setModelPref] = useState('auto');

  const [media, setMedia] = useState<UploadMedia[]>(() => {
    const seed: UploadMedia[] = [];
    if (business.logo_url) seed.push({ name: 'Logo', url: business.logo_url, type: 'image' });
    if (business.image_url) seed.push({ name: 'Business photo', url: business.image_url, type: 'image' });
    return seed;
  });
  const [replaced, setReplaced] = useState<Set<number>>(new Set());
  const [rendered, setRendered] = useState<VideoProject | null>(null);
  const [rendering, setRendering] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [preview, setPreview] = useState(false);
  const [saved, setSaved] = useState<VideoProject[]>(() => loadProjects(business.id));
  const [briefs, setBriefs] = useState<DirectorBriefRecord[]>(() => loadDirectorBriefs(business.id));

  const [renderBlobUrl, setRenderBlobUrl] = useState<string | null>(null);
  const [renderReal, setRenderReal] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const [stockFootage, setStockFootage] = useState(true);
  const [stockKey, setStockKey] = useState(() => getStockApiKey());
  const [footage, setFootage] = useState<Record<number, StockClip> | null>(null);
  const [footageStatus, setFootageStatus] = useState<'idle' | 'no-key' | 'loading' | 'ready' | 'error'>('idle');
  const [storyStills, setStoryStills] = useState<(string | null)[] | null>(null);
  const [storyBusy, setStoryBusy] = useState(false);

  const [aiArt, setAiArt] = useState(true);
  const [aiImageModel, setAiImageModel] = useState<AiImageModel>('flux');
  const [aiVideoModel, setAiVideoModel] = useState<AiVideoModel>('wan');
  const [aiImages, setAiImages] = useState<(string | null)[] | null>(null);
  const [aiImageStatus, setAiImageStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [aiImageProgress, setAiImageProgress] = useState(0);
  const [aiClips, setAiClips] = useState<Record<number, StockClip> | null>(null);
  const [aiVideoStatus, setAiVideoStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [aiVideoProgress, setAiVideoProgress] = useState(0);

  const [publishChannels, setPublishChannels] = useState<string[]>(['instagram', 'facebook', 'x']);
  const [publishCaption, setPublishCaption] = useState('');
  const [publishHashtags, setPublishHashtags] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishOutcome, setPublishOutcome] = useState<PublishOutcome | null>(null);

  const script = useMemo(() => scenes.map((s) => s.voiceover).filter(Boolean).join('\n'), [scenes]);
  const totalSeconds = (list: { seconds: number }[]) => list.reduce((s, x) => s + x.seconds, 0);
  const profile = directionByKey(direction);

  // Resolve the free AI video model for the current settings. 'auto' always
  // lands on the free model closest to Seedance 2.5 (Wan 2.2 today).
  const resolvedModel: ModelSelection = useMemo(() => {
    if (modelPref === 'auto') return autoSelectVideoModel({ quality, length });
    const meta = modelMeta(modelPref);
    if (meta) {
      return {
        pick: meta,
        ranked: [meta],
        upscaled: false,
        reason: `Manual — ${meta.name} by ${meta.maker}. ${meta.license}, ${meta.maxRes}@${meta.fps}fps, up to ${meta.maxSeconds}s per clip, ${meta.closeness}/100 Seedance-closeness.`,
      };
    }
    return autoSelectVideoModel({ quality, length });
  }, [modelPref, quality, length]);

  // Film the reel over real stock footage: resolve one Pexels clip per scene.
  useEffect(() => {
    if (!stockFootage || !result || !scenes.length) {
      setFootage(null);
      setFootageStatus(stockFootage && result ? 'no-key' : 'idle');
      return;
    }
    if (!hasStockApiKey()) {
      setFootage(null);
      setFootageStatus('no-key');
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    setFootageStatus('loading');
    resolveFootage({
      industry: result.plan.industry,
      scenes,
      directionLabel: directionByKey(direction).label,
      aspect: aspect as FootageAspect,
      signal: ctrl.signal,
    })
      .then((map) => {
        if (cancelled) return;
        setFootage(map);
        setFootageStatus(Object.keys(map).length ? 'ready' : 'error');
      })
      .catch(() => {
        if (!cancelled) { setFootage(null); setFootageStatus('error'); }
      });
    return () => { cancelled = true; ctrl.abort(); };
  }, [stockFootage, result, scenes, direction, aspect]);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  const persist = (next: VideoProject[]) => {
    setSaved(next);
    saveProjects(business.id, next);
  };

  const currentSettings = (): DirectorBriefSettings => ({
    voiceover, titles, logoAnimation, callouts, transitionPref, quality, length, container, aspect, model: modelPref, stockFootage, aiArt, aiImageModel, aiVideoModel,
  });

  const frameOpts = (): SceneFrameOptions => {
    const activeFootage = (aiArt && aiClips) || (stockFootage ? footage : undefined) || undefined;
    return {
      businessName: business.name,
      directionLabel: directionByKey(direction).label,
      grade: directionByKey(direction).grade,
      hook: result?.hook,
      cta: rendered?.cta ?? result?.cta,
      aspect,
      fps: 30,
      logoEmoji: result?.plan.industry.emoji,
      scenesCount: scenes.length,
      // AI clips (Wan) win over Pexels stock; AI key art fills scenes without clips.
      footage: activeFootage,
      footageEnabled: !!activeFootage && Object.keys(activeFootage).length > 0,
      // The aiImages state is `| null` but RenderOptions wants `| undefined`,
      // so normalise rather than leaking null into the renderer.
      aiImages: aiArt ? aiImages ?? undefined : undefined,
    };
  };

  useEffect(() => {
    if (tab !== 'storyboard' || !scenes.length) {
      setStoryStills(null);
      setStoryBusy(false);
      return;
    }
    let cancelled = false;
    setStoryBusy(true);
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const opts: SceneFrameOptions = {
        businessName: business.name,
        directionLabel: directionByKey(direction).label,
        grade: directionByKey(direction).grade,
        hook: result?.hook,
        cta: rendered?.cta ?? result?.cta,
        aspect,
        fps: 30,
        logoEmoji: result?.plan.industry.emoji,
        scenesCount: scenes.length,
      };
      const stills = scenes.map((s, i) => renderSceneStill(opts, s, i, 320)?.dataUrl ?? null);
      if (!cancelled) {
        setStoryStills(stills);
        setStoryBusy(false);
      }
    }, 30);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [tab, scenes, direction, aspect, result, rendered, business]);

  useEffect(() => {
    if (!aiArt || !result || !scenes.length) {
      setAiImages(null);
      setAiImageStatus(aiArt && result ? 'loading' : 'idle');
      setAiImageProgress(0);
      return;
    }
    const ctrl = new AbortController();
    let cancelled = false;
    const industry = result.plan.industry;
    const directionLabel = directionByKey(direction).label;
    const dims = aspectDimensions(aspect);
    setAiImageStatus('loading');
    setAiImageProgress(0);
    (async () => {
      const urls: (string | null)[] = [];
      for (let i = 0; i < scenes.length; i++) {
        if (cancelled) return;
        const prompt = aiPromptForScene({
          businessName: business.name,
          industryLabel: industry.label,
          directionLabel,
          scene: scenes[i],
          index: i,
        });
        const url = pollinationsImageUrl({
          prompt,
          model: aiImageModel,
          width: dims.width,
          height: dims.height,
          seed: aiSeedFor(business.name, directionLabel, i),
        });
        urls.push(await fetchAiImage(url, ctrl.signal));
        if (!cancelled) setAiImageProgress(i + 1);
      }
      if (!cancelled) {
        setAiImages(urls);
        setAiImageStatus(urls.some((u) => !!u) ? 'ready' : 'error');
      }
    })();
    return () => { cancelled = true; ctrl.abort(); };
  }, [aiArt, aiImageModel, result, scenes, direction, aspect, business]);

  const persistBrief = (projectId: string, b: CreativeBrief): DirectorBriefRecord => {
    const record = buildDirectorBriefRecord(projectId, business.id, b, currentSettings());
    saveDirectorBrief(business.id, record);
    setBriefs(loadDirectorBriefs(business.id));
    return record;
  };

  const restoreBrief = (record: DirectorBriefRecord) => {
    const b = record.brief;
    setResult(b);
    setScenes(b.scenes);
    setBrief(b.briefText);
    setDirection(b.direction);
    setVoiceover(record.settings.voiceover);
    setTitles(record.settings.titles);
    setLogoAnimation(record.settings.logoAnimation);
    setCallouts(record.settings.callouts);
    setTransitionPref(record.settings.transitionPref);
    setQuality(record.settings.quality);
    setLength(record.settings.length);
    setContainer(record.settings.container as 'MP4' | 'MOV');
    setAspect(record.settings.aspect as RenderAspect);
    setModelPref(record.settings.model ?? 'auto');
    setStockFootage(record.settings.stockFootage ?? true);
    setAiArt(record.settings.aiArt ?? true);
    setAiImageModel((record.settings.aiImageModel as AiImageModel) ?? 'flux');
    setAiVideoModel((record.settings.aiVideoModel as AiVideoModel) ?? 'wan');
    setRendered(null);
    setRenderBlobUrl(null);
    setPublishOutcome(null);
    setTab('brief');
    toast.success('Creative brief restored from the saved project.');
  };

  const buildAiClips = async () => {
    if (!result || !scenes.length) return;
    const directionLabel = directionByKey(direction).label;
    const dims = aspectDimensions(aspect);
    const industry = result.plan.industry;
    setAiVideoStatus('loading');
    setAiVideoProgress(0);
    const clips: Record<number, StockClip> = {};
    for (let i = 0; i < scenes.length; i++) {
      const prompt = aiPromptForScene({
        businessName: business.name,
        industryLabel: industry.label,
        directionLabel,
        scene: scenes[i],
        index: i,
        forVideo: true,
      });
      const duration = Math.min(6, Math.max(3, Math.round(scenes[i].seconds)));
      const url = pollinationsVideoUrl({
        prompt,
        model: aiVideoModel,
        width: dims.width,
        height: dims.height,
        seed: aiSeedFor(business.name, directionLabel, i),
        duration,
      });
      clips[i] = { id: i + 1, url, preview: url, width: dims.width, height: dims.height, duration };
      setAiVideoProgress(i + 1);
    }
    setAiClips(clips);
    setAiVideoStatus('ready');
    toast.success(`${scenes.length} AI video clip(s) queued — the render films over the ${AI_VIDEO_MODELS.find((m) => m.key === aiVideoModel)?.label ?? aiVideoModel} clips.`);
  };

  const removeSaved = (id: string) => {
    const project = saved.find((p) => p.id === id);
    if (project?.briefId) deleteDirectorBrief(business.id, project.briefId);
    persist(saved.filter((p) => p.id !== id));
    setBriefs(loadDirectorBriefs(business.id));
    toast.success('Project removed from this device.');
  };

  const renderReel = async () => {
    if (!result || !scenes.length) return;
    setRenderReal(true);
    setRenderProgress(0);
    try {
      const out = await renderVideo(frameOpts(), scenes, (p) => setRenderProgress(p));
      if (renderBlobUrl) URL.revokeObjectURL(renderBlobUrl);
      setRenderBlobUrl(URL.createObjectURL(out.blob));
      setRenderProgress(1);
      setPreview(true);
      toast.success(`Real render complete — ${out.duration}s ${out.width}×${out.height}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not render in this browser — use the poster instead.');
    } finally {
      setRenderReal(false);
    }
  };

  const downloadVideo = () => {
    if (!renderBlobUrl) return;
    downloadUrl(renderBlobUrl, `${slugForFile(business.name)}-reel.webm`);
    toast.success('Reel video downloaded (.webm)');
  };

  const downloadPoster = () => {
    const still = renderPoster(frameOpts(), scenes, 0);
    if (!still) { toast.error('Could not create the poster image.'); return; }
    downloadUrl(still.dataUrl, `${slugForFile(business.name)}-poster.png`);
    toast.success('Poster PNG downloaded');
  };

  const downloadContactSheet = () => {
    const sheet = renderContactSheet(frameOpts(), scenes, 4);
    if (!sheet) { toast.error('Could not create the contact sheet.'); return; }
    downloadUrl(sheet.dataUrl, `${slugForFile(business.name)}-storyboard.png`);
    toast.success('Storyboard contact sheet downloaded');
  };

  const mediaForPublish = (): PublishMedia | null => {
    if (!result) return null;
    const still = renderPoster(frameOpts(), scenes, 0);
    return still ? { name: `${slugForFile(business.name)}-poster.png`, url: still.dataUrl, type: 'image' } : null;
  };

  const publishNow = async () => {
    if (!result || !rendered) return;
    if (!publishChannels.length) { toast.error('Pick at least one channel to publish to.'); return; }
    setPublishing(true);
    setPublishOutcome(null);
    try {
      const project = rendered;
      const outcome = await publishPost(business.id, {
        id: project.id,
        title: project.title,
        caption: publishCaption.trim() || project.caption,
        hashtags: publishHashtags.trim(),
        channels: publishChannels,
        media: mediaForPublish(),
      });
      setPublishOutcome(outcome);
      if (outcome.ok) {
        persist(saved.map((p) => (p.id === project.id ? { ...p, status: 'published' as const } : p)));
        toast.success(outcome.simulated ? 'Published everywhere (simulated — connect channels to post for real)' : 'Published everywhere');
      } else {
        toast.error('Publishing failed on one or more channels.');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reach the publishing service.');
    } finally {
      setPublishing(false);
    }
  };

  const build = (text: string, dir: CreativeDirection) => {
    const b = buildCreativeBrief(business, text, dir);
    setResult(b);
    setScenes(b.scenes);
    setVoiceover(b.video.voiceover);
    setTitles(b.video.subtitle);
    setMedia((m) => (m.length ? m : []));
    setReplaced(new Set());
    setRendered(null);
    setRenderBlobUrl(null);
    setPublishOutcome(null);
    return b;
  };

  const renderProject = (b: CreativeBrief): VideoProject => {
    const targetFormat: VideoFormat = length === 15 ? 'Reel 15' : 'Reel 30';
    const base = generateVideoProject(business, {
      ...b.plan.input,
      format: targetFormat,
      voiceover,
      subtitle: titles,
      hook: b.hook,
    });
    const total = totalSeconds(b.scenes) || length;
    const factor = length / total;
    return {
      ...base,
      model: resolvedModel.pick.key,
      scenes: b.scenes.map((s) => ({
        id: s.id,
        seconds: Math.max(1, Math.round(s.seconds * factor)),
        text: s.text,
        direction: s.direction,
        transition: s.transition,
        voiceover: s.voiceover,
        // Rescaling the director's scenes rebuilds each VideoScene from a
        // DirectorScene, which carries no media source — carry the project's
        // choice through rather than dropping a required field.
        media: b.plan.input.media,
      })),
    };
  };

  const runPipeline = () => {
    const text = brief.trim();
    if (!text) { toast.error('Tell the AI Creative Director what you want — one sentence is enough.'); return; }
    const b = build(text, direction);
    setTab('brief');
    setRendering(true);
    toast.success('AI Creative Director read your brief — preparing the video.');
    window.setTimeout(() => {
      const project = renderProject(b);
      const record = persistBrief(project.id, b);
      const projectWithBrief = { ...project, briefId: record.id };
      persist([projectWithBrief, ...saved]);
      setRendered(projectWithBrief);
      setPublishCaption(projectWithBrief.caption);
      setPublishHashtags(projectWithBrief.hashtags.join(' '));
      setRendering(false);
      setPreview(true);
      toast.success('Video generated — the creative brief is saved alongside the project.');
    }, 1500);
  };

  const regenerateOne = (order: number) => {
    if (!result) return;
    const attempt = (scenes.find((s) => s.order === order)?.voiceover ?? '').length + order;
    const next = regenerateScene(business, result, order, attempt);
    setScenes(scenes.map((s) => (s.order === order ? next : s)));
    toast.success(`Scene ${order} regenerated — the rest of the video is untouched.`);
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const added: UploadMedia[] = Array.from(files).map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
      type: f.type.startsWith('video') ? 'video' : 'image',
    }));
    setMedia((m) => [...m, ...added]);
    toast.success(`${added.length} media file(s) attached to the render.`);
  };

  const addStock = () => {
    setMedia((m) => [
      ...m,
      { name: 'AI stock — kitchen close-up', url: '', type: 'image' },
      { name: 'AI stock — happy customer', url: '', type: 'image' },
      { name: 'AI stock — overhead shot', url: '', type: 'image' },
    ]);
    toast.success('AI stock clips added — the generator will match them to your brand.');
  };

  const packExtras = {
    hook: result?.hook,
    cta: rendered?.cta ?? result?.cta,
    script,
    voiceover,
    quality,
    length,
    format: container,
    aspect,
    titles,
    logoAnimation,
    callouts,
    media,
    caption: rendered?.caption ?? result?.video.caption,
    model: modelLabel(rendered?.model ?? resolvedModel.pick.key),
    modelReason: resolvedModel.reason,
    footageCount: footage ? Object.keys(footage).length : 0,
    aiArtCount: aiArt && aiImages ? aiImages.filter((u) => !!u).length : 0,
    aiNote: aiArt
      ? aiClips
        ? `${scenes.length} AI video clip(s) (${AI_VIDEO_MODELS.find((m) => m.key === aiVideoModel)?.label ?? aiVideoModel} via Pollinations)`
        : `${(aiImages ?? []).filter((u) => !!u).length} AI key art frame(s) (${AI_IMAGE_MODELS.find((m) => m.key === aiImageModel)?.label ?? aiImageModel} via Pollinations)`
      : undefined,
  };

  const saveStockKey = () => {
    setStockApiKey(stockKey);
    setStockKey(getStockApiKey());
    toast.success(hasStockApiKey() ? 'Footage key saved — reels now film with real stock clips.' : 'Enter a free Pexels API key to film with real footage.');
  };

  const copyPack = () => {
    if (!result) return;
    navigator.clipboard?.writeText(directorPackText(business, result, packExtras));
    toast.success('Director pack copied — paste it into any AI video tool.');
  };

  const downloadPack = () => {
    if (!result) return;
    downloadText(directorPackText(business, result, packExtras), `${slugForFile(business.name)}-director-pack.txt`);
    toast.success('Director pack downloaded');
  };

  const waShare = () => {
    if (!result) return;
    const text = `🎬 ${result.video.title}\n\nHOOK: ${result?.hook}\nCTA: ${rendered?.cta ?? result.cta}\n\n${script}\n\nCaption:\n${rendered?.caption ?? result.video.caption}`;
    if (business.phone) {
      const digits = business.phone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else {
      navigator.clipboard?.writeText(text);
      toast.success('Script copied');
    }
  };

  const playVoice = () => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) {
      toast.error('Voice preview is not supported in this browser — try Chrome or Edge.');
      return;
    }
    if (synth.speaking) {
      synth.cancel();
      setPlaying(false);
      return;
    }
    const lines = script.trim() || scenes.map((s) => s.voiceover).filter(Boolean).join(' ');
    if (!lines) {
      toast.error('No voiceover lines yet — generate a brief first.');
      return;
    }
    const { lang, gender, pitch, rate } = voiceoverProfile(voiceover);
    const utter = new SpeechSynthesisUtterance(lines);
    utter.lang = lang;
    utter.pitch = pitch;
    utter.rate = rate;
    const matched = pickPreviewVoice(synth.getVoices(), gender, lang);
    if (matched) utter.voice = matched;
    utter.onstart = () => setPlaying(true);
    utter.onend = () => setPlaying(false);
    utter.onerror = () => {
      setPlaying(false);
      toast.error('Voice preview stopped.');
    };
    synth.speak(utter);
    setPlaying(true);
  };

  return (
    <div className="space-y-5">
      {/* Pipeline hero */}
      <div className="rounded-2xl bg-gradient-to-r from-purple-700 via-fuchsia-700 to-purple-700 text-white p-5">
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-purple-100">
          <LayoutTemplate size={14} /> AI Creative Director
        </p>
        <h3 className="mt-1 text-lg font-black leading-snug">
          The AI plans the campaign. The AI Video Generator produces the video. You press one button.
        </h3>
        <p className="mt-1 text-sm text-purple-100/90 max-w-2xl">
          Say one sentence about your business goal. The director writes the creative brief, storyboard, script and
          director notes, then hands everything to the video generator — no prompting, no guesswork.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {PIPELINE.map((p, i) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/15 px-2.5 py-1.5 text-[11px] font-bold">
                <p.icon size={11} className="text-purple-200" /> {p.label}
              </span>
              {i < PIPELINE.length - 1 && <ArrowRight size={11} className="text-purple-300/70" />}
            </span>
          ))}
        </div>
      </div>

      {/* Brief card */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Wand2 size={16} className="text-purple-600 dark:text-purple-400" /> Step 1 — your goal
          </h3>
          {result && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <CheckCircle2 size={12} className="text-green-500" /> Brief locked in — edit and regenerate anytime
            </span>
          )}
        </div>

        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={2}
          placeholder="e.g. I want more customers this weekend…"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
        />

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setBrief(ex)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition">
              <Lightbulb size={11} /> {ex.slice(0, 40)}{ex.length > 40 ? '…' : ''}
            </button>
          ))}
        </div>

        {/* Directions */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            <Clapperboard size={11} className="inline mr-1" /> Step 2 — pick a creative direction (like pitching concepts)
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {CREATIVE_DIRECTIONS.map((d) => {
              const active = direction === d.key;
              return (
                <button key={d.key} onClick={() => setDirection(d.key)}
                  className={`text-left rounded-xl border p-3 transition ${active
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-purple-400 dark:hover:border-purple-500'}`}>
                  <span className="text-xl">{d.emoji}</span>
                  <p className="mt-1 text-xs font-black text-gray-900 dark:text-white">
                    Version {String.fromCharCode(65 + CREATIVE_DIRECTIONS.findIndex((x) => x.key === d.key))}
                  </p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{d.label}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{d.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={runPipeline} disabled={rendering}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white text-sm font-black hover:bg-purple-700 transition shadow-sm disabled:opacity-60">
            {rendering ? <RefreshCcw size={16} className="animate-spin" /> : <Zap size={16} />}
            {rendering ? 'Directing & rendering…' : '🎬 Generate Video'}
          </button>
          <p className="text-xs text-gray-400">
            The director writes the brief, storyboard, script and notes — the generator receives it all automatically.
          </p>
        </div>
      </div>

      {!result && (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <Clapperboard size={18} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
          Tap <span className="font-semibold text-purple-600 dark:text-purple-400">🎬 Generate Video</span> and the AI Creative Director plans the campaign before the generator produces the video.
        </div>
      )}

      {result && (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-1.5">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${tab === t.key
                  ? 'bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}>
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {/* Director review */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white text-xl font-black">
                  {result.review.overall.toFixed(1)}
                </span>
                <div>
                  <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                    Creative Director Review <span className="text-[10px] font-bold uppercase text-purple-500">after generation</span>
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    How the generated video scores before it goes live.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm font-black text-gray-900 dark:text-white">
                <Stars n={Math.round(result.review.overall / 2)} /> {result.review.overall}/10 overall
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <MetricBar label="Hook strength" score={result.review.hookStrength} />
              <MetricBar label="Visual quality" score={result.review.visualQuality} />
              <MetricBar label="Brand consistency" score={result.review.brandConsistency} />
              <MetricBar label="Customer attention" score={result.review.customerAttention} />
              <MetricBar label="CTA" score={result.review.cta} />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {result.review.suggestions.map((s, i) => (
                <p key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                  <Lightbulb size={13} className="mt-0.5 shrink-0 text-purple-500" /> {s}
                </p>
              ))}
            </div>
          </div>

          {/* Tab panels */}
          {tab === 'brief' && (
            <div className="space-y-5">
              <Panel title={`Creative brief — Version ${String.fromCharCode(65 + CREATIVE_DIRECTIONS.findIndex((x) => x.key === direction))} ${profile.label}`}
                right={
                  <div className="flex flex-wrap gap-2">
                    <button onClick={copyPack} className={`${chip} bg-blue-600 text-white hover:bg-blue-700`}><Copy size={13} /> Copy pack</button>
                    <button onClick={downloadPack} className={`${chip} bg-purple-600 text-white hover:bg-purple-700`}><Download size={13} /> Download pack</button>
                  </div>
                }>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-xl bg-purple-50 dark:bg-gray-900 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-1">Objective</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.objective}</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 dark:bg-gray-900 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-1">Audience</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.audience}</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 dark:bg-gray-900 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-1">Message</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.message}</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 dark:bg-gray-900 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-1">Offer</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.offer}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    ['Video type', `${result.videoType} · ${result.duration}s`],
                    ['Platform', result.platform],
                    ['Hook', result.hook],
                    ['CTA', result.cta],
                    ['Music', result.video.music],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{k}</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-white mt-1 leading-snug">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Storyline</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{result.storyline}</p>
                </div>
                {result.plan.season && (
                  <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
                      {result.plan.season.occasion.emoji} Season matched: {result.plan.season.occasion.label} — the campaign pack includes the email, SMS and landing copy.
                    </p>
                  </div>
                )}
              </Panel>
            </div>
          )}

          {tab === 'storyboard' && (
            <Panel
              title={`Storyboard — ${scenes.length} scenes · ${totalSeconds(scenes)}s`}
              right={
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setPreview(true)} className={`${chip} bg-purple-600 text-white hover:bg-purple-700`}>
                    <Eye size={13} /> Phone preview
                  </button>
                </div>
              }>
              {/* Timeline */}
              <div className="flex items-end gap-1 mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-3 overflow-x-auto">
                {scenes.map((s) => (
                  <div key={s.id} className="flex flex-col items-center min-w-[44px]">
                    <span className="text-[10px] font-black text-purple-600 dark:text-purple-300">{s.seconds}s</span>
                    <div className="mt-1 w-4 rounded-t bg-gradient-to-t from-purple-500 to-fuchsia-400" style={{ height: `${Math.min(64, 12 + s.seconds * 4)}px` }} />
                    <span className="mt-1 text-[9px] text-gray-400">S{s.order}</span>
                  </div>
                ))}
              </div>

              {storyBusy && (
                <p className="mb-3 text-[11px] text-gray-400 flex items-center gap-1">
                  <RefreshCcw size={11} className="animate-spin" /> Painting scene previews…
                </p>
              )}

              <div className="space-y-2">
                {scenes.map((s) => {
                  const isLast = s.order === scenes.length;
                  return (
                    <div key={s.id} className="grid grid-cols-[72px,1fr] gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900">
                      <div className="flex flex-col items-center">
                        <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center text-2xl overflow-hidden">
                          {aiArt && aiClips?.[s.order - 1] ? (
                            <video key={aiClips[s.order - 1].url} src={aiClips[s.order - 1].url} muted autoPlay loop playsInline
                              className="h-full w-full object-cover" />
                          ) : aiArt && aiImages?.[s.order - 1] ? (
                            <img src={aiImages[s.order - 1] ?? ''} alt={`Scene ${s.order} AI key art`} className="h-full w-full object-cover" />
                          ) : footage?.[s.order - 1] ? (
                            <video key={footage[s.order - 1].url} src={footage[s.order - 1].url} muted autoPlay loop playsInline
                              className="h-full w-full object-cover" />
                          ) : storyStills?.[s.order - 1] ? (
                            <img src={storyStills[s.order - 1] ?? ''} alt={`Scene ${s.order} preview`} className="h-full w-full object-cover" />
                          ) : (
                            <span>{SCENE_EMOJI[(s.order - 1) % SCENE_EMOJI.length]}</span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-1.5">
                          {s.seconds}s · Scene {s.order}
                        </p>
                      </div>
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{s.text}</p>
                          <button onClick={() => regenerateOne(s.order)} disabled={rendering}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition disabled:opacity-50">
                            <RefreshCcw size={11} /> Regenerate Scene {s.order}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          <Clapperboard size={11} /> {s.direction} <span className="text-gray-300 dark:text-gray-600">·</span> {s.camera}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
                            <Palette size={9} /> {s.grading}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">
                            <Sparkles size={9} /> {s.motion}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                            <Film size={9} /> {s.transition}
                          </span>
                        </div>
                        {s.voiceover && (
                          <p className="text-xs text-purple-700 dark:text-purple-300 mt-1.5 italic">“{s.voiceover}”</p>
                        )}
                        {isLast && !replaced.has(s.order) && (
                          <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                            Suggested: put your logo here for the whole end card.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] text-gray-400 flex items-center gap-1">
                <Sparkles size={11} /> NowOpen-exclusive: regenerate one scene and everything else stays exactly the same.
              </p>
            </Panel>
          )}

          {tab === 'script' && (
            <Panel title="Script — edit freely, the generator uses what you write">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                One line per scene. Edit any line — the storyboard and pack update together.
              </p>
              <textarea
                value={script}
                onChange={(e) => {
                  const lines = e.target.value.split('\n');
                  setScenes(scenes.map((s, i) => ({ ...s, voiceover: lines[i] ?? '' })));
                }}
                rows={Math.max(6, scenes.length)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={playVoice} className={`${chip} bg-purple-600 text-white hover:bg-purple-700`}>
                  {playing ? <RefreshCcw size={13} className="animate-spin" /> : <PlayCircle size={13} />}
                  {playing ? 'Reading…' : 'Read script aloud (preview)'}
                </button>
                <button onClick={() => navigator.clipboard?.writeText(script)} className={`${chip} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                  <Copy size={13} /> Copy script
                </button>
              </div>
            </Panel>
          )}

          {tab === 'voiceover' && (
            <Panel title="Voiceover">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Voice</span>
                  <select value={voiceover} onChange={(e) => setVoiceover(e.target.value)} className={`${selectClass} mt-1`}>
                    {VOICEOVER_OPTIONS.map((v) => (
                      <option key={v.key} value={v.key}>{v.label} · {v.accent}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Background music</span>
                  <div className="mt-1 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 px-3 py-2 text-sm text-purple-800 dark:text-purple-200 flex items-center gap-2">
                    <Music size={14} /> {result.video.music} — set by the {directionByKey(direction).label} direction
                  </div>
                </label>
              </div>
              <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Voice preview — {script.split('\n').length} lines</p>
                  <button onClick={playVoice} className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline">
                    {playing ? <RefreshCcw size={12} className="animate-spin" /> : <PlayCircle size={12} />} {playing ? 'Playing…' : 'Play'}
                  </button>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{script}</p>
                {playing && (
                  <div className="mt-3 flex items-end gap-0.5 h-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i} className="w-1 rounded-full bg-purple-500 animate-pulse" style={{ height: `${30 + ((i * 13) % 70)}%`, animationDelay: `${i * 60}ms` }} />
                    ))}
                  </div>
                )}
              </div>
              <p className="mt-3 text-[11px] text-gray-400">
                You can replace the voice or upload your own recording on the Voiceover tab of the generated video — right now we preview the AI voice.
              </p>
            </Panel>
          )}

          {tab === 'media' && (
            <Panel title="Media — everything the generator already knows about your business">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {media.map((m, i) => (
                  <div key={`${m.name}-${i}`} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5 bg-gray-50 dark:bg-gray-900">
                    <div className="w-full h-16 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center text-xl overflow-hidden">
                      {m.url ? <img src={m.url} alt={m.name} className="w-full h-full object-cover" /> : <ImageIcon size={18} className="text-gray-400" />}
                    </div>
                    <p className="text-[11px] font-bold text-gray-900 dark:text-white mt-1.5 truncate">{m.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] uppercase tracking-wide text-gray-400">{m.type}</span>
                      <button onClick={() => setMedia(media.filter((_, x) => x !== i))} className="text-gray-400 hover:text-rose-500">
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={addStock}
                  className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-2.5 flex flex-col items-center justify-center gap-1 text-gray-500 dark:text-gray-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition">
                  <Sparkles size={16} /> <span className="text-[11px] font-bold">AI stock</span>
                </button>
              </div>

              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <Upload size={11} /> Upload more photos or clips
                </p>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  onChange={(e) => addFiles(e.target.files)}
                  className="block w-full text-xs text-gray-500 dark:text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-purple-700"
                />
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Replace a clip</p>
                <div className="flex flex-wrap gap-1.5">
                  {scenes.map((s) => (
                    <button key={s.id} onClick={() => {
                      const next = new Set(replaced);
                      if (next.has(s.order)) {
                        next.delete(s.order);
                      } else {
                        next.add(s.order);
                      }
                      setReplaced(next);
                      toast.success(replaced.has(s.order) ? `Scene ${s.order} uses the original clip` : `Scene ${s.order} will use an AI-generated clip`);
                    }}
                      className={`${chip} ${replaced.has(s.order)
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                      <RefreshCcw size={11} /> Scene {s.order}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {tab === 'motion' && (
            <Panel title="Motion graphics — applied on render">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Titles</span>
                  <select value={titles} onChange={(e) => setTitles(e.target.value)} className={`${selectClass} mt-1`}>
                    {SUBTITLE_STYLES.map((s) => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Transitions</span>
                  <select value={transitionPref} onChange={(e) => setTransitionPref(e.target.value)} className={`${selectClass} mt-1`}>
                    {['Auto', 'Cut', 'Fade', 'Whip pan', 'Match cut'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => setLogoAnimation(!logoAnimation)}
                  className={`rounded-xl border p-3 text-left transition ${logoAnimation ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'border-gray-200 dark:border-gray-700'}`}>
                  <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Building2 size={13} /> Logo animation {logoAnimation && <CheckCircle2 size={12} className="text-green-500" />}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{logoAnimation ? 'Animated logo intro + end card' : 'No logo animation'}</p>
                </button>
                <button onClick={() => setCallouts(!callouts)}
                  className={`rounded-xl border p-3 text-left transition ${callouts ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'border-gray-200 dark:border-gray-700'}`}>
                  <p className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Target size={13} /> Offer callouts {callouts && <CheckCircle2 size={12} className="text-green-500" />}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{callouts ? 'Animated callouts on the offer' : 'No callouts'}</p>
                </button>
              </div>
              <p className="mt-3 text-[11px] text-gray-400 flex items-center gap-1">
                <Type size={11} /> Grading is set by the {directionByKey(direction).label} direction: {directionByKey(direction).grade}.
              </p>
            </Panel>
          )}

          {tab === 'generate' && (
            <Panel title="AI Video Generator — production dept">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Quality</span>
                  <select value={quality} onChange={(e) => setQuality(e.target.value)} className={`${selectClass} mt-1`}>
                    {['720p', '1080p', '4K'].map((q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Length</span>
                  <select value={length} onChange={(e) => setLength(Number(e.target.value))} className={`${selectClass} mt-1`}>
                    {[15, 30, 60].map((l) => <option key={l} value={l}>{l} seconds</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Direction</span>
                  <select value={direction} onChange={(e) => setDirection(e.target.value as CreativeDirection)} className={`${selectClass} mt-1`}>
                    {CREATIVE_DIRECTIONS.map((d) => (
                      <option key={d.key} value={d.key}>Version {String.fromCharCode(65 + CREATIVE_DIRECTIONS.findIndex((x) => x.key === d.key))} — {d.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300 flex items-center gap-1">
                  <Cpu size={11} /> AI video model — auto-picked for you
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={modelPref} onChange={(e) => setModelPref(e.target.value)} className={`${selectClass} !w-auto`}>
                    <option value="auto">Auto — {resolvedModel.pick.name} (best free, closest to Seedance 2.5)</option>
                    {VIDEO_MODELS.map((m) => (
                      <option key={m.key} value={m.key}>{m.name} · {m.maker} · {m.maxRes}@{m.fps}fps</option>
                    ))}
                  </select>
                  <span className="text-[11px] text-purple-700 dark:text-purple-300 font-semibold">
                    {resolvedModel.pick.name} · {resolvedModel.pick.license} · {resolvedModel.pick.maxRes}@{resolvedModel.pick.fps}fps · {resolvedModel.pick.closeness}/100 Seedance-closeness
                  </span>
                </div>
                <p className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 leading-snug">{resolvedModel.reason}</p>
                <p className="mt-1 text-[10px] text-gray-400">
                  Reference bar: {SEEDANCE_REFERENCE.name} ({SEEDANCE_REFERENCE.maker}) — {SEEDANCE_REFERENCE.license}, so Auto never uses it.
                </p>
              </div>

              <div className="mt-3 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-300 flex items-center gap-1">
                    <Sparkles size={11} /> AI Art Direction — real images, video & motion
                  </p>
                  <button onClick={() => setAiArt(!aiArt)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${aiArt
                      ? 'border-purple-500 bg-purple-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles size={12} /> {aiArt ? 'AI media on' : 'AI media off'}
                    </span>
                  </button>
                </div>

                {aiArt && result && (
                  <>
                    <p className="mt-2 text-[11px] text-purple-900/80 dark:text-purple-200/80 leading-snug">
                      Free, keyless open-weight models: one Flux key art frame per scene, one Wan 2.x video clip per scene to film over, with the motion graphics animator on top. Deterministic seeds — the same brief always requests the same media.
                    </p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Key art model</span>
                        <select value={aiImageModel} onChange={(e) => setAiImageModel(e.target.value as AiImageModel)} className={`${selectClass} mt-1`}>
                          {AI_IMAGE_MODELS.map((m) => (
                            <option key={m.key} value={m.key}>{m.label} — {m.note}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Video clip model</span>
                        <select value={aiVideoModel} onChange={(e) => setAiVideoModel(e.target.value as AiVideoModel)} className={`${selectClass} mt-1`}>
                          {AI_VIDEO_MODELS.map((m) => (
                            <option key={m.key} value={m.key}>{m.label} — {m.note}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <p className="mt-2 text-[11px] text-purple-900/80 dark:text-purple-200/80 flex items-center gap-1">
                      {aiImageStatus === 'loading' && <RefreshCcw size={11} className="animate-spin" />}
                      {aiImageStatus === 'loading' && `Generating key art… ${aiImageProgress}/${scenes.length}`}
                      {aiImageStatus === 'ready' && `${(aiImages ?? []).filter((u) => !!u).length}/${scenes.length} key art frame(s) ready — the render films over them.`}
                      {aiImageStatus === 'error' && 'Could not reach the free model right now — falling back to generated graphics.'}
                      {aiImageStatus === 'idle' && 'Generate a brief to create key art for each scene.'}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button onClick={buildAiClips} disabled={aiVideoStatus === 'loading'}
                        className={`${chip} justify-center bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60`}>
                        {aiVideoStatus === 'loading' ? <RefreshCcw size={13} className="animate-spin" /> : <Clapperboard size={13} />}
                        {aiVideoStatus === 'ready' ? 'Regenerate AI video clips' : aiVideoStatus === 'loading' ? `Building clips… ${aiVideoProgress}/${scenes.length}` : 'Generate AI video clips (Wan)'}
                      </button>
                      {aiVideoStatus === 'ready' && aiClips && (
                        <span className="text-[11px] text-purple-700 dark:text-purple-300">
                          {Object.keys(aiClips).length} clip(s) queued — the render films over them.
                        </span>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {scenes.map((s, i) => (
                        <div key={s.id} className="relative aspect-video overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
                          {aiVideoStatus === 'ready' && aiClips?.[i] ? (
                            <video key={aiClips[i].url} src={aiClips[i].url} muted autoPlay loop playsInline
                              className="h-full w-full object-cover" />
                          ) : aiImages?.[i] ? (
                            <img src={aiImages[i] ?? ''} alt={`AI key art ${i + 1}`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                              {aiImageStatus === 'loading' ? 'Generating…' : '—'}
                            </div>
                          )}
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            S{i + 1} · {s.seconds}s
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300 flex items-center gap-1">
                    <Video size={11} /> Real film footage — free stock clips
                  </p>
                  <button onClick={() => setStockFootage(!stockFootage)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${stockFootage
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Film size={12} /> {stockFootage ? 'Footage on' : 'Footage off'}
                    </span>
                  </button>
                </div>

                {!hasStockApiKey() ? (
                  <div className="mt-2">
                    <p className="text-[11px] text-blue-900/80 dark:text-blue-200/80 leading-snug">
                      Each storyboard scene is filmed over a real cinematic clip (Pexels) instead of generated graphics. Add a free key — it stays on this device.
                    </p>
                    <div className="mt-2 flex flex-col sm:flex-row gap-2">
                      <input
                        value={stockKey}
                        onChange={(e) => setStockKey(e.target.value)}
                        placeholder="Pexels API key (free at pexels.com/api)"
                        className={`${selectClass} !w-auto flex-1`}
                      />
                      <button onClick={saveStockKey} className={`${chip} justify-center bg-blue-600 text-white hover:bg-blue-700`}>
                        <KeyRound size={13} /> Save key
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-blue-900/80 dark:text-blue-200/80 flex items-center gap-1">
                    {footageStatus === 'loading' && <RefreshCcw size={11} className="animate-spin" />}
                    {footageStatus === 'ready' && `${Object.keys(footage ?? {}).length} scene(s) matched to real film clips — the render films over these.`}
                    {footageStatus === 'no-key' && 'Footage key not recognised yet.'}
                    {footageStatus === 'error' && 'Could not fetch clips right now — the render falls back to generated graphics.'}
                    {footageStatus === 'idle' && 'Generate a brief to match clips to scenes.'}
                  </p>
                )}

                {(footageStatus === 'ready' || footageStatus === 'loading') && scenes.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {scenes.map((s, i) => (
                      <div key={s.id} className="relative aspect-video overflow-hidden rounded-lg bg-gray-200 dark:bg-gray-700">
                        {footage?.[i] ? (
                          <video key={footage[i].url} src={footage[i].url} muted autoPlay loop playsInline
                            className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-gray-400">
                            {footageStatus === 'loading' ? 'Matching…' : 'No clip'}
                          </div>
                        )}
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          S{i + 1} · {s.seconds}s
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={runPipeline} disabled={rendering}
                className="mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white text-sm font-black hover:bg-purple-700 transition shadow-sm disabled:opacity-60">
                {rendering ? <RefreshCcw size={16} className="animate-spin" /> : <Zap size={16} />}
                {rendering ? 'Rendering…' : '🎬 Generate Video'}
              </button>
              <p className="mt-2 text-[11px] text-gray-400">
                Everything is passed to the generator automatically: business profile, brand assets, creative brief, scenes, camera moves, voiceover, captions, music and motion graphics.
              </p>

              {rendered && (
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <MonitorPlay size={11} /> Latest render
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      ['Title', rendered.title],
                      ['Format', `${rendered.format} · ${formatSeconds(rendered.scenes)}s`],
                      ['Quality', quality],
                      ['Prediction', `${rendered.prediction.stars}/5`],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">{k}</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{v}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Cpu size={11} className="text-purple-500" /> Rendered with {modelLabel(rendered.model ?? '')} — the best free AI video model closest to Seedance 2.5.
                  </p>
                </div>
              )}

              {rendered && (
                <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-1">
                    <MonitorPlay size={11} /> Render the real video — in your browser, not simulated
                  </p>
                  {renderBlobUrl && (
                    <video key={renderBlobUrl} src={renderBlobUrl} controls playsInline
                      className="w-full max-h-[340px] rounded-lg bg-black" />
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={renderReel} disabled={renderReal}
                      className={`${chip} bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:opacity-90 disabled:opacity-60`}>
                      {renderReal ? <RefreshCcw size={13} className="animate-spin" /> : <Film size={13} />}
                      {renderReal ? `Rendering frame ${Math.round(renderProgress * 100)}%…` : 'Render real preview (.webm)'}
                    </button>
                    <button onClick={downloadVideo} disabled={!renderBlobUrl}
                      className={`${chip} bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40`}>
                      <Download size={13} /> Download .webm
                    </button>
                    <button onClick={downloadPoster}
                      className={`${chip} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                      <ImageIcon size={13} /> Poster PNG
                    </button>
                    <button onClick={downloadContactSheet}
                      className={`${chip} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                      <Images size={13} /> Storyboard sheet
                    </button>
                  </div>
                  {renderReal && (
                    <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all" style={{ width: `${Math.round(renderProgress * 100)}%` }} />
                    </div>
                  )}
                  <p className="mt-2 text-[11px] text-gray-400">
                    Paints the full {formatSeconds(scenes)}s {aspect} storyboard frame-by-frame{stockFootage && footageStatus === 'ready' ? ' over real film clips' : ''} and records a real playable file — the {directionByKey(direction).label} grade, camera moves and transitions applied.
                  </p>
                </div>
              )}
            </Panel>
          )}

          {tab === 'export' && (
            <Panel
              title="Export & publish"
              right={<span className="text-xs text-gray-500 dark:text-gray-400">{saved.length} video(s) saved on this device</span>}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">File format</span>
                  <select value={container} onChange={(e) => setContainer(e.target.value as 'MP4' | 'MOV')} className={`${selectClass} mt-1`}>
                    {['MP4', 'MOV'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Aspect ratio</span>
                  <select value={aspect} onChange={(e) => setAspect(e.target.value as typeof aspect)} className={`${selectClass} mt-1`}>
                    {['Square', 'Vertical', 'Landscape'].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Length</span>
                  <select value={length} onChange={(e) => setLength(Number(e.target.value))} className={`${selectClass} mt-1`}>
                    {[15, 30, 60].map((l) => <option key={l} value={l}>{l} seconds</option>)}
                  </select>
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button onClick={copyPack} className={`${chip} justify-center bg-blue-600 text-white hover:bg-blue-700`}><Copy size={13} /> Copy pack</button>
                <button onClick={downloadPack} className={`${chip} justify-center bg-purple-600 text-white hover:bg-purple-700`}><Download size={13} /> Download pack</button>
                <button onClick={waShare} className={`${chip} justify-center bg-green-600 text-white hover:bg-green-700`}><MessageCircle size={13} /> WhatsApp</button>
                <button onClick={() => setPreview(true)} className={`${chip} justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                  <Smartphone size={13} /> Phone preview
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <MonitorPlay size={11} /> Render & download
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button onClick={renderReel} disabled={renderReal}
                    className={`${chip} justify-center bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:opacity-90 disabled:opacity-60`}>
                    {renderReal ? <RefreshCcw size={13} className="animate-spin" /> : <Film size={13} />}
                    {renderReal ? `…${Math.round(renderProgress * 100)}%` : 'Render video'}
                  </button>
                  <button onClick={downloadVideo} disabled={!renderBlobUrl}
                    className={`${chip} justify-center bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40`}>
                    <Download size={13} /> .webm
                  </button>
                  <button onClick={downloadPoster}
                    className={`${chip} justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                    <ImageIcon size={13} /> Poster PNG
                  </button>
                  <button onClick={downloadContactSheet}
                    className={`${chip} justify-center bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                    <Images size={13} /> Sheet PNG
                  </button>
                </div>
                {renderReal && (
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 transition-all" style={{ width: `${Math.round(renderProgress * 100)}%` }} />
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <Rocket size={11} /> Publish this reel
                </p>
                <textarea
                  value={publishCaption}
                  onChange={(e) => setPublishCaption(e.target.value)}
                  rows={3}
                  placeholder="Caption the director generated for you…"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <input
                  value={publishHashtags}
                  onChange={(e) => setPublishHashtags(e.target.value)}
                  placeholder="#Foodie #NigerianFood #NowOpenAfrica"
                  className="mt-2 w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {SOCIAL_CHANNELS.map((c) => {
                    const on = publishChannels.includes(c.key);
                    return (
                      <button key={c.key} onClick={() => setPublishChannels(on ? publishChannels.filter((k) => k !== c.key) : [...publishChannels, c.key])}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${on
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
                <button onClick={publishNow} disabled={publishing || !rendered}
                  className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700 transition disabled:opacity-50">
                  {publishing ? <RefreshCcw size={15} className="animate-spin" /> : <Send size={15} />}
                  {publishing ? 'Publishing…' : 'Publish everywhere'}
                </button>
                {publishOutcome && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {publishOutcome.results.map((r) => (
                      <div key={r.channel} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs">
                        <span className="font-bold text-gray-900 dark:text-white">{channelLabel(r.channel)}</span>
                        <span className={`font-bold ${r.ok ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {r.ok ? (r.simulated ? 'Simulated ✓' : 'Published ✓') : 'Failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-gray-400">
                  Posts to connected channels for real; everything else is simulated until you connect the account.
                </p>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                  <History size={11} /> Saved with their creative briefs ({saved.length})
                </p>
                <div className="space-y-2">
                  {saved.map((p) => {
                    const rec = briefs.find((b) => b.projectId === p.id);
                    return (
                      <div key={p.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{p.title}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {p.format} · {formatSeconds(p.scenes)}s · {rec ? 'director brief saved' : 'no brief'}{p.model ? ` · ${modelLabel(p.model)}` : ''} ·{' '}
                            <span className={p.status === 'published' ? 'font-semibold text-green-600 dark:text-green-400' : ''}>{p.status}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {rec && (
                            <button onClick={() => restoreBrief(rec)} className={`${chip} bg-purple-600 text-white hover:bg-purple-700`}>
                              <History size={12} /> Restore brief
                            </button>
                          )}
                          <button onClick={() => removeSaved(p.id)}
                            className={`${chip} bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600`}>
                            <Trash2 size={12} /> Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {saved.length === 0 && (
                    <p className="text-xs text-gray-400">Generate a video and it is saved here with its creative brief.</p>
                  )}
                </div>
              </div>

              <p className="mt-4 text-[11px] text-gray-400 flex items-center gap-1">
                <Gauge size={11} /> Brand assets ready: {result.plan.assets.present}/{result.plan.assets.total} · {result.plan.assets.readiness}/100
              </p>
              <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                <Timer size={11} /> Platform: {result.platform} · Post {formatSeconds(result.video.scenes)}s · {result.review.overall}/10 director score
              </p>
            </Panel>
          )}

          {/* Foot note */}
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <Sparkles size={12} /> AI Creative Director plans the campaign. The video renders for real in your browser. NowOpen Studio publishes it everywhere and measures performance.
          </p>
        </>
      )}

      {/* Phone preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(false)}>
          <div className="w-full max-w-xs rounded-[2rem] border-[6px] border-gray-900 overflow-hidden shadow-2xl bg-slate-950" onClick={(e) => e.stopPropagation()}>
            <div className="h-5 bg-gray-900 flex items-center justify-center"><span className="w-12 h-1.5 rounded-full bg-gray-700" /></div>
            <div className="max-h-[62vh] overflow-y-auto">
              {renderBlobUrl ? (
                <>
                  <div className="px-4 pt-4 pb-2 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-purple-300">
                      Real render · {result?.videoType} · {totalSeconds(scenes)}s · {aspect} · {quality} · {resolvedModel.pick.name}
                    </p>
                  </div>
                  <div className="px-4 pb-4">
                    <video key={renderBlobUrl} src={renderBlobUrl} controls autoPlay muted playsInline className="w-full rounded-xl bg-black" />
                  </div>
                </>
              ) : (
                <>
                  <div className="px-5 pt-6 pb-4 bg-gradient-to-b from-purple-900 to-slate-950 text-center">
                    <p className="text-xl">{result?.plan.industry.emoji}</p>
                    <h4 className="mt-2 text-base font-black text-white">{rendered?.title ?? result?.video.title}</h4>
                    <p className="text-[10px] text-purple-200/80 mt-0.5">
                      {result?.videoType} · {totalSeconds(scenes)}s · {quality} · {resolvedModel.pick.name}
                    </p>
                    {result && (
                      <p className="mt-2 flex items-center justify-center gap-1.5 text-amber-300 text-xs font-bold">
                        <Stars n={Math.round(result.review.overall / 2)} /> {result.review.overall}/10
                      </p>
                    )}
                  </div>
                  <div className="px-5 py-4 space-y-3">
                    {scenes.map((s) => (
                      <div key={s.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-purple-300">{s.seconds}s</span>
                          <span className="text-[10px] text-gray-400">Scene {s.order}</span>
                        </div>
                        <p className="text-sm font-bold text-white mt-1">{s.text}</p>
                        <p className="text-[11px] text-gray-300 mt-0.5">{s.camera}</p>
                        {s.voiceover && <p className="text-[11px] text-gray-300 mt-0.5 italic">“{s.voiceover}”</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rendering overlay */}
      {rendering && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 text-center shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-600 flex items-center justify-center">
              <Clapperboard size={22} className="text-white animate-pulse" />
            </div>
            <h4 className="mt-3 text-sm font-black text-gray-900 dark:text-white">AI Video Generator working</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Reading the brief, building the storyboard, matching the {directionByKey(direction).label} direction on {resolvedModel.pick.name}…
            </p>
            <div className="mt-4 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-500 animate-pulse" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatSeconds(list: { seconds: number }[]): number {
  return list.reduce((s, x) => s + x.seconds, 0);
}
