/**
 * One upload path for project media.
 *
 * The bucket, the compression and the size ceilings are the ones the rest of
 * the dashboard already uses (`business-images`, `compressImage`, 5 MB images,
 * 50 MB video). Repeating them in the portfolio editor would let the two drift,
 * and the first thing to drift would be the limit that keeps videos playable on
 * a phone.
 */

import { supabase } from './supabase';
import { compressImage } from './imageCompression';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export class ProjectUploadError extends Error {}

export interface UploadedMedia {
  url: string;
  kind: 'image' | 'video';
}

const extensionOf = (name: string, fallback: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
};

const uniqueName = (): string => {
  const cryptoObj = globalThis.crypto;
  const id = cryptoObj && typeof cryptoObj.randomUUID === 'function'
    ? cryptoObj.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return id;
};

export async function uploadProjectMedia(
  file: File,
  userId: string,
): Promise<UploadedMedia> {
  if (!userId) throw new ProjectUploadError('Sign in again to upload media.');

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    throw new ProjectUploadError('Please choose an image or a video file.');
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new ProjectUploadError('That image is over 5 MB. Try a smaller one.');
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new ProjectUploadError('That video is over 50 MB. Try a shorter clip.');
  }

  let body: File | Blob = file;
  let ext: string;
  let contentType: string;

  if (isImage) {
    body = await compressImage(file);
    ext = extensionOf((body as File).name ?? '', 'jpg');
    contentType = body.type || 'image/jpeg';
  } else {
    ext = extensionOf(file.name, 'mp4');
    contentType = file.type || 'video/mp4';
  }

  const path = `${userId}/projects/${uniqueName()}.${ext}`;
  const { error } = await supabase.storage
    .from('business-images')
    .upload(path, body, { cacheControl: '3600', upsert: false, contentType });
  if (error) throw new ProjectUploadError(error.message);

  const { data } = supabase.storage.from('business-images').getPublicUrl(path);
  if (!data?.publicUrl) throw new ProjectUploadError('The upload finished but no URL came back.');
  return { url: data.publicUrl, kind: isImage ? 'image' : 'video' };
}
