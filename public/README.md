# public/

Files in this folder are served from the site root (`/`).

## Homepage hero background video

To use a video background on the homepage banner:

1. Add your video file here, e.g. `public/hero-background.mp4`.
2. Open `src/pages/Home.tsx` and check the `HERO_VIDEO` constant near the
   top — it defaults to `'/hero-background.mp4'`. Change it if your file has
   a different name.
3. (Optional) Add a still image (e.g. `hero-poster.jpg`) and set
   `HERO_VIDEO_POSTER = '/hero-poster.jpg'` to show it before the video plays.

Notes:
- The blue→purple gradient is always the base. The video fades in on top once
  it can play, so the banner looks unchanged while the video loads or if the
  file is missing.
- Set `HERO_VIDEO = ''` in `Home.tsx` to disable the video entirely.
- Recommended: a short (5–15s) silent, looping clip, 1920×1080 or smaller,
  compressed to keep the file a few MB (H.264 `.mp4` for broad browser support).
