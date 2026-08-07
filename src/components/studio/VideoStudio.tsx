import { useState } from 'react';
import { Clapperboard, Copy, Check, Download, Loader2, Film, Mic, ListVideo, Sparkles } from 'lucide-react';
import { Business } from '../../types';
import { REEL_FORMATS, generateReel, totalDuration, type ReelFormat, type ReelScript } from '../../lib/video';
import { directorScenesFromReel, voiceoverScript, shotList } from '../../lib/reelRender';
import { renderVideo, RENDER_DIMENSIONS, type RenderAspect } from '../../lib/renderVideo';
import { generateKeyArt, keyArtMessage } from '../../lib/aiKeyArt';
import { industryByKey, industryKeyForCategory } from '../../lib/videoCreator';

// Video Studio.
//
// The engine and the script generator both already existed and had never been
// connected: lib/video.ts (the reel writer) had zero consumers, and the only
// route to lib/renderVideo.ts was through the AI Creative Director, which was
// removed. So this is a UI over code that was already written and tested,
// joined by lib/reelRender.ts.
//
// What it deliberately does NOT do: generate footage. There is no text-to-video
// model wired up, and pretending otherwise would be the Pollinations mistake
// again — an "AI video" button that quietly produces nothing. What it renders
// is a real, downloadable motion graphic of the owner's script: titles,
// captions and transitions, filmed by the canvas engine. That is genuinely
// postable, and it is honest about what it is.

const ASPECTS: { key: RenderAspect; label: string; hint: string }[] = [
  { key: 'Vertical', label: 'Vertical', hint: 'Reels, TikTok, Status' },
  { key: 'Square', label: 'Square', hint: 'Feed posts' },
  { key: 'Landscape', label: 'Landscape', hint: 'YouTube, websites' },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        });
      }}
      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {done ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
      {done ? 'Copied' : label}
    </button>
  );
}

export default function VideoStudio({ business }: { business: Business }) {
  const [format, setFormat] = useState<ReelFormat>('15s Reel');
  const [aspect, setAspect] = useState<RenderAspect>('Vertical');
  const [script, setScript] = useState<ReelScript>(() => generateReel(business, '15s Reel'));

  const [useKeyArt, setUseKeyArt] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [stage, setStage] = useState<'idle' | 'art' | 'film'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pickFormat = (f: ReelFormat) => {
    setFormat(f);
    setScript(generateReel(business, f));
    setError(null);
    setNotice(null);
  };

  const download = async () => {
    setRendering(true);
    setError(null);
    setNotice(null);
    setProgress(0);
    try {
      const scenes = directorScenesFromReel(script);
      let aiImages: (string | null)[] | undefined;

      if (useKeyArt) {
        setStage('art');
        const industry = industryByKey(industryKeyForCategory(business.category || ''));
        const art = await generateKeyArt({
          businessName: business.name,
          industryLabel: industry.label,
          directionLabel: format,
          scenes,
          aspect,
          onProgress: (done, total) => setProgress(done / total),
        });
        aiImages = art.images;
        // Say so when it didn't fully work. A video that quietly came back as
        // plain gradients, with no explanation, is how "AI" features lose trust.
        if (art.reason) setNotice(keyArtMessage(art.reason, art.generated, scenes.length));
      }

      setStage('film');
      setProgress(0);
      const result = await renderVideo(
        {
          businessName: business.name,
          directionLabel: format,
          hook: script.hook,
          cta: script.cta,
          aspect,
          scenesCount: script.scenes.length,
          aiImages,
        },
        scenes,
        (p) => setProgress(p),
      );

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      // mp4 when the browser gave us one, webm otherwise — the recorder picks
      // whichever codec it actually supports, so the extension follows it
      // rather than being assumed.
      a.download = `${business.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${format.replace(/\s+/g, '-').toLowerCase()}.${result.mimeType.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not render the video.');
    } finally {
      setRendering(false);
      setStage('idle');
      setProgress(0);
    }
  };

  const dims = RENDER_DIMENSIONS[aspect];
  const seconds = totalDuration(script);

  return (
    <div className="space-y-5">
      {/* Format */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
          <Film size={15} className="text-purple-500" /> What are you filming?
        </h3>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {REEL_FORMATS.map((f) => (
            <button
              key={f.key}
              onClick={() => pickFormat(f.key)}
              aria-pressed={format === f.key}
              className={`text-left p-3 min-h-[44px] rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                format === f.key
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-purple-300'
              }`}
            >
              <span className="block text-xs font-bold text-gray-900 dark:text-white">{f.label}</span>
              <span className="block mt-0.5 text-[10px] leading-snug text-gray-500 dark:text-gray-400">{f.desc}</span>
              <span className="block mt-1 text-[10px] font-semibold text-purple-600 dark:text-purple-400">{f.total}s</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Shape</span>
          {ASPECTS.map((a) => (
            <button
              key={a.key}
              onClick={() => setAspect(a.key)}
              aria-pressed={aspect === a.key}
              className={`px-3 min-h-[44px] rounded-lg text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                aspect === a.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {a.label}
              <span className="ml-1.5 font-normal opacity-70">{a.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Storyboard */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <ListVideo size={15} className="text-purple-500" /> Your storyboard
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              {script.scenes.length} scenes · {seconds}s · {dims.width}×{dims.height}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={shotList(script)} label="Shot list" />
            <CopyButton text={voiceoverScript(script)} label="Voiceover" />
            <CopyButton text={`${script.caption}\n\n${script.hashtags.join(' ')}`} label="Caption" />
          </div>
        </div>

        <ol className="divide-y divide-gray-100 dark:divide-gray-700">
          {script.scenes.map((s, i) => (
            <li key={s.id} className="flex gap-3 p-4">
              <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{s.caption}</p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{s.direction}</p>
                <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                  <Mic size={11} className="mt-0.5 flex-shrink-0 text-gray-400" />
                  <span className="italic">“{s.voiceover}”</span>
                </p>
              </div>
              <span className="flex-shrink-0 text-[11px] font-semibold text-gray-400 tabular-nums">{s.duration}s</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Render */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Clapperboard size={15} className="text-purple-500" /> Download the video
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-md">
              {useKeyArt
                ? 'Generates a still for each scene with an open-weight image model, then films it with camera motion and your captions on top.'
                : 'Renders your script with designed graphics — captions, timing and transitions. Turn on key art to have each scene generated instead.'}
            </p>
          </div>
          <button
            onClick={download}
            disabled={rendering}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            {rendering ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {rendering
              ? stage === 'art'
                ? `Generating key art ${Math.round(progress * 100)}%`
                : `Filming ${Math.round(progress * 100)}%`
              : `Render ${seconds}s video`}
          </button>
        </div>

        <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={useKeyArt}
            onChange={(e) => setUseKeyArt(e.target.checked)}
            disabled={rendering}
            className="mt-0.5 w-4 h-4 rounded accent-purple-600"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-900 dark:text-white inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-purple-500" /> Generate key art for each scene
            </span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
              Adds about {script.scenes.length * 8}s while the images generate. Scenes that fail fall back to designed
              graphics, so you always get a finished video.
            </span>
          </span>
        </label>

        {rendering && (
          <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-purple-600 transition-[width] duration-200"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}

        {notice && (
          <p role="status" className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {notice}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
