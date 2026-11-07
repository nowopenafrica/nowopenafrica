/*
  # Business cover video banner

  The profile banner can now be a video -- an uploaded file or a pasted
  platform link -- but `businesses.image_url` is read as a *photo* by dozens
  of surfaces (cards, studio tools, brand kit, og:image). Storing the video
  there would break all of them, so it gets its own column instead.

  The relationship is directional: when `cover_video_url` is set, the profile
  header plays it, with `image_url` as the poster while it loads -- and as the
  cover everywhere that needs a still (share cards, directory listings).
*/

alter table public.businesses add column if not exists cover_video_url text;

comment on column public.businesses.cover_video_url is
  'Video banner for the profile header: a direct file URL (.mp4/.webm/...) or a pasted YouTube/TikTok/Instagram/Vimeo/Facebook link. image_url stays the poster and the cover used everywhere else.';