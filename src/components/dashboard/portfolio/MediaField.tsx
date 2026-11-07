import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Film, Loader2, Trash2, Upload, X } from 'lucide-react';

import SmartImg from '../../SmartImg';
import { useAuth } from '../../../contexts/AuthContext';
import { isDirectVideo, type ProjectMedia } from '../../../lib/projectStory';
import { uploadProjectMedia } from '../../../lib/projectMediaUpload';

const fieldClass =
  'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-white';

const emptyMedia = (): ProjectMedia => ({ url: '', caption: null, alt: null, credit: null });

/**
 * One image or video, with the words that make it accessible and honest.
 *
 * Caption is what a sighted visitor reads; alt is what a screen reader says;
 * credit names the photographer when the owner wants to. All three are
 * optional, because requiring them would make the editor feel like paperwork.
 */
export function MediaField({
  media,
  onChange,
  kind = 'image',
  label = 'Media',
}: {
  media: ProjectMedia;
  onChange: (media: ProjectMedia) => void;
  kind?: 'image' | 'video' | 'any';
  label?: string;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const isVideo = kind === 'video' || isDirectVideo(media.url);

  const upload = async (file: File | undefined) => {
    if (!file || !user) return;
    setUploading(true);
    try {
      const uploaded = await uploadProjectMedia(file, user.id);
      onChange({ ...media, url: uploaded.url });
      toast.success(uploaded.kind === 'image' ? 'Image uploaded.' : 'Video uploaded.');
    } catch (error) {
      toast.error((error as Error).message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 p-2.5 dark:border-gray-700">
      <div className="flex items-start gap-2.5">
        <div className="grid h-16 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
          {media.url && !isVideo ? (
            <SmartImg src={media.url} alt={media.alt || media.caption || ''} className="h-full w-full object-cover" />
          ) : media.url && isVideo ? (
            <Film size={20} className="text-gray-400" aria-hidden />
          ) : (
            <Upload size={18} className="text-gray-300 dark:text-gray-600" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              value={media.url}
              onChange={(e) => onChange({ ...media, url: e.target.value })}
              placeholder={kind === 'video' ? 'https://…/clip.mp4 or a YouTube link' : 'Image URL'}
              aria-label={`${label} URL`}
              className={fieldClass}
            />
            <input
              ref={inputRef}
              type="file"
              accept={kind === 'video' ? 'video/*' : kind === 'image' ? 'image/*' : 'image/*,video/*'}
              className="sr-only"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              aria-label={`Upload ${label}`}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            </button>
          </div>

          <input
            value={media.caption ?? ''}
            onChange={(e) => onChange({ ...media, caption: e.target.value || null })}
            placeholder="Caption (optional)"
            aria-label={`${label} caption`}
            className={fieldClass}
          />

          {!isVideo && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              <input
                value={media.alt ?? ''}
                onChange={(e) => onChange({ ...media, alt: e.target.value || null })}
                placeholder="Describe it for screen readers"
                aria-label={`${label} description`}
                className={fieldClass}
              />
              <input
                value={media.credit ?? ''}
                onChange={(e) => onChange({ ...media, credit: e.target.value || null })}
                placeholder="Photo credit (optional)"
                aria-label={`${label} credit`}
                className={fieldClass}
              />
            </div>
          )}
        </div>

        {media.url && (
          <button
            type="button"
            onClick={() => onChange(emptyMedia())}
            aria-label={`Remove ${label}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * An ordered set of images: a gallery, or the project's own media bank.
 *
 * Order matters on a story page — the sequence is part of the argument — so
 * moving up and down is a visible control rather than a drag handle that a
 * keyboard cannot reach and a phone cannot reliably start.
 */
export function MediaListField({
  images,
  onChange,
  kind = 'image',
  addLabel = 'Add images',
  emptyLabel = 'No images yet.',
}: {
  images: ProjectMedia[];
  onChange: (images: ProjectMedia[]) => void;
  kind?: 'image' | 'video';
  addLabel?: string;
  emptyLabel?: string;
}) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      const uploaded: ProjectMedia[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadProjectMedia(file, user.id);
        uploaded.push({ url: result.url, caption: null, alt: null, credit: null });
      }
      onChange([...images, ...uploaded]);
      if (uploaded.length) toast.success(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      toast.error((error as Error).message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {images.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 p-3 text-center text-[11px] text-gray-500 dark:border-gray-700">
          {emptyLabel}
        </p>
      )}

      {images.map((media, index) => (
        <div key={`${media.url || 'empty'}-${index}`} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            <MediaField
              media={media}
              kind={kind}
              label={`Image ${index + 1}`}
              onChange={(next) => onChange(images.map((item, i) => (i === index ? next : item)))}
            />
          </div>
          <div className="flex shrink-0 flex-col gap-1 pt-1">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label="Move up"
              className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === images.length - 1}
              aria-label="Move down"
              className="grid h-7 w-7 place-items-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-800"
            >
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              onClick={() => onChange(images.filter((_, i) => i !== index))}
              aria-label="Remove image"
              className="grid h-7 w-7 place-items-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}

      <div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={kind === 'video' ? 'video/*' : 'image/*'}
          className="sr-only"
          onChange={(e) => void upload(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {addLabel}
        </button>
      </div>
    </div>
  );
}
