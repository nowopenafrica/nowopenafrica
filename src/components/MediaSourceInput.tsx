import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Camera, Loader2, X, Film } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { captureVideoPoster } from '../lib/openReel';
import { POSTER_SUFFIX } from '../lib/reelShare';
import { isVideoUrl, videoThumbnailSrc } from '../lib/galleryMedia';
import { parseVideoEmbed, embedRejectionReason } from '../lib/videoEmbeds';
import VideoEmbedFrame from './VideoEmbedFrame';
import OpenReelCapture from './dashboard/OpenReelCapture';

// One media picker for every surface that needs an image or a video: upload a
// file, paste a link from anywhere, or record with the OpenReel camera.
//
// It exists because those three routes were re-implemented per screen, so the
// gallery gained link previews and camera capture while the Studio backdrops,
// the motion layers and the scheduler kept only a bare file input. Anything
// wired through here gets all three, with the same validation and the same live
// preview, and stores a plain URL — a `<video src>`/`<img loading="lazy" decoding="async" src>` for uploads and
// direct links, the platform's own player for a pasted social link.

export type MediaAccept = 'image' | 'video' | 'both';

interface Props {
  value: string;
  onChange: (url: string) => void;
  /** What this slot can hold. Video-only hides the image affordances. */
  accept?: MediaAccept;
  /** Offer the OpenReel camera. Off where a camera makes no sense. */
  allowCamera?: boolean;
  /** Longest camera recording, seconds (plan-dependent; see reelLimitForPlan). */
  cameraMaxSeconds?: number;
  /** Storage path prefix inside the business-images bucket. */
  pathPrefix?: string;
  label?: string;
  hint?: string;
  className?: string;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export default function MediaSourceInput({
  value,
  onChange,
  accept = 'both',
  allowCamera = true,
  cameraMaxSeconds = 60,
  pathPrefix = 'media',
  label,
  hint,
  className = '',
}: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const trimmed = value.trim();
  const embed = useMemo(() => parseVideoEmbed(trimmed), [trimmed]);
  const rejection = useMemo(() => {
    if (!trimmed || !/[./]/.test(trimmed)) return null;
    return embedRejectionReason(trimmed);
  }, [trimmed]);

  const acceptAttr = accept === 'image' ? 'image/*' : accept === 'video' ? 'video/*' : 'image/*,video/*';

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) { toast.error('Sign in to upload.'); return; }

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (accept === 'image' && !isImage) { toast.error('This slot takes an image.'); return; }
    if (accept === 'video' && !isVideo) { toast.error('This slot takes a video.'); return; }
    if (!isImage && !isVideo) { toast.error('Choose an image or a video file.'); return; }
    if (isImage && file.size > MAX_IMAGE_BYTES) { toast.error('Image is too large — max 5 MB'); return; }
    if (isVideo && file.size > MAX_VIDEO_BYTES) { toast.error('Video is too large — max 50 MB'); return; }

    setUploading(true);
    try {
      let body: Blob = file;
      let ext = file.name.split('.').pop()?.toLowerCase() || (isVideo ? 'mp4' : 'jpg');
      let contentType = file.type;
      if (isImage) {
        const compressed = await compressImage(file);
        body = compressed;
        contentType = compressed.type || 'image/jpeg';
        ext = contentType === 'image/webp' ? 'webp' : 'jpg';
      }

      const stamp = Date.now();
      const path = `${user.id}/${pathPrefix}-${stamp}.${ext}`;
      const { error } = await supabase.storage
        .from('business-images')
        .upload(path, body, { cacheControl: '3600', upsert: false, contentType });
      if (error) throw error;

      // Give videos the same poster still as reels, so previews and share cards
      // have an image to show without decoding the clip.
      if (isVideo) {
        try {
          const poster = await captureVideoPoster(file);
          if (poster) {
            await supabase.storage.from('business-images').upload(
              `${user.id}/${pathPrefix}-${stamp}${POSTER_SUFFIX}`,
              poster,
              { cacheControl: '3600', upsert: true, contentType: 'image/jpeg' },
            );
          }
        } catch { /* preview falls back to a video frame */ }
      }

      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success(isVideo ? 'Video uploaded' : 'Image uploaded');
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message || 'unknown error'}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input ref={fileRef} type="file" accept={acceptAttr} onChange={upload} className="hidden" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm disabled:opacity-50 flex-shrink-0"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Uploading…' : trimmed ? 'Replace' : accept === 'video' ? 'Upload video' : 'Upload'}
        </button>

        {allowCamera && user && accept !== 'image' && (
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition text-sm flex-shrink-0"
          >
            <Camera size={14} /> OpenReel Camera
          </button>
        )}

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={accept === 'image'
            ? '…or paste an image URL'
            : '…or paste a link — YouTube, TikTok, Instagram, Vimeo, or a file URL'}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {hint && <p className="text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>}

      {/* Live preview of whatever is set, so nothing is saved blind. */}
      {trimmed && (
        <div className="relative rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear media"
            className="absolute top-2 right-2 p-1 rounded bg-black/60 text-white hover:bg-black/80"
          >
            <X size={12} />
          </button>

          {embed ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 inline-flex items-center gap-1">
                <Film size={11} /> {embed.label}
              </p>
              <VideoEmbedFrame url={trimmed} className="w-full max-w-xs" />
            </>
          ) : rejection ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{rejection}</p>
          ) : isVideoUrl(trimmed) ? (
            <video
              src={videoThumbnailSrc(trimmed)}
              controls
              muted
              playsInline
              preload="metadata"
              className="w-full max-w-xs rounded-lg bg-black"
            />
          ) : (
            <img loading="lazy" decoding="async"
              src={trimmed}
              alt="Selected media preview"
              className="w-full max-w-xs rounded-lg object-cover"
              onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            />
          )}
        </div>
      )}

      {showCamera && user && (
        <OpenReelCapture
          userId={user.id}
          maxSeconds={cameraMaxSeconds}
          onCaptured={(url) => { onChange(url); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
