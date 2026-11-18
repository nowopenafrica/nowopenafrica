# NowOpen Create — multi-studio architecture and plan

Status: Phase A DONE 2026-11-18 (kind column live in production, ledger recorded). Phase B DONE 2026-11-18 (src/lib/studio/videoDocument.ts + fromMotionProject.ts, 23 tests; localStorage import deferred to Phase C, since nothing can open a video row until Video Studio exists). All client changes uncommitted, not deployed. Phase C BUILT 2026-11-18: /media/video editor (VideoStudio.tsx, components/video/*, lib/studio/videoEdit.ts, videoCompositor.ts, videoAssets.ts), motion import from the start screen and an "Open in Video Studio" link in Motion Studio. Browser-verified on localhost against production DB; media upload and Frame PNG not exercised. Phase D (file export) next.

Source brief: "NowOpen Create — Transforming It Into a Complete AI Creative
Production Studio" (pasted 2026-11-18). This document is Phase 1 (audit) and
the Phase 2–3 design. It does not claim any studio below is built.

---

## 1. Audit — what already exists (measured in this repo, f1d2426)

| Area | What is there | State |
|---|---|---|
| Design Editor | `/media/studio`, `/media/studio/:id` → `pages/StudioEditor.tsx` (2,484 lines). DOM slot model, `lib/studio/designDocument.ts` (schema v2: text/image/shape/group, pages, normalised 0..1 coords). PNG/PDF export via `html-to-image` + `jsPDF`. Import SVG/PPTX/PDF/EPS. | Live, deployed. **Must not regress.** |
| Project storage | `design_projects` table: `document jsonb`, `schema_version`, `version` (optimistic concurrency via `save_design_project`), owner-only RLS, asset *references* only, `thumbnail_path`. | Live. Design-only — no `kind` column. |
| Motion / video | `lib/motionGraphics.ts` (11 motion styles: logo reveal, kinetic type, lower third, countdown, billboard LED…), `lib/motionProject.ts` (MotionProject + `MotionTimeline` overlay: reorder / trim / split / duplicate / remove / per-clip caption overrides), `lib/renderVideo.ts` (1,866 lines: canvas painter + `MediaRecorder` → real WebM/MP4, poster + contact sheet, clip audio routed through AudioContext). UI: `components/admin/MotionGraphicsStudio.tsx` (2,433 lines), mounted in `/studio` and the admin creator shell. | Works, but: **scene-card model, single track, no real multi-track timeline, no audio tracks, no keyframes**; projects saved to **localStorage only** (`nowopen_motion_projects`) — lost on another device or a cleared browser. |
| Creative Director | `lib/creativeDirector.ts` (rule-based: directions, script, scenes, review scores) + `CreativeDirectorStudio.tsx`. | Works; honestly rule-based, no model. |
| Request router | `lib/create/intent.ts` — deterministic sentence reader → `routeFor` → workflow. Plus `lib/create/needs.ts`, `createCategories.ts` (13 categories, Billboard links to `/adverts`). | Live. Routes design work only; it is the natural home for the "Creative Request Router". |
| Brand data | Business profile (logo, colours via `brandPalette`), Studio brand kit, Brand Autopilot. | No single persistent multi-brand kit object shared by editors. |
| Render infra | All rendering is in the browser. No render service, no FFmpeg, no job queue. `mp4-muxer` is in `package.json` but not imported by any `src/**/*.ts`. | Gap. |
| Parallel work | Worktree `nowopen-creative-intel` (CI-3 compose engine, galleries) is uncommitted/unmerged and its rule keeps `StudioEditor` + Promote files off-limits to it. | Must not collide. |

**Conclusion of the audit:** the brief describes the Video and Motion studios
as new. They are not new from zero — there is a working scene-based motion
renderer and a trim/split timeline. What is missing is (a) a real multi-track
timeline document, (b) server persistence, (c) audio/keyframes/captions, and
(d) a shared project envelope so studios can hand work to each other. Building
a second, parallel video engine would duplicate 4,000+ lines; the plan below
extends what exists.

## 2. Architecture

### 2.1 One envelope, typed documents

Extend `design_projects` rather than adding a new table:

```sql
alter table public.design_projects
  add column kind text not null default 'design'
    check (kind in ('design','video','motion','presentation')),
  add column campaign_id uuid null;   -- later, Campaign Studio
```

- Every existing row becomes `kind = 'design'` with no data rewrite; the
  Design Editor keeps reading exactly what it reads today.
- RLS, `version` concurrency, `save_design_project`, autosave rules and the
  thumbnail column are reused unchanged — they were the hard part.
- `document` stays jsonb, but its shape is owned per kind:
  `designDocument.ts` (unchanged), new `videoDocument.ts`, later
  `motionDocument.ts`, `presentationDocument.ts`. Each has its own
  `schemaVersion`, `readDocument` that refuses newer versions, and migrations.
- The loader dispatches on `kind` → lazy-loads only that editor.

Why not a new `creative_projects` table: it would fork RLS, concurrency and
autosave logic that already works, and every project list would need a union.

### 2.2 VideoDocument v1 (the new contract)

```
VideoDocument {
  schemaVersion: 1
  width, height, fps (24|25|30|60), durationMs
  tracks: Track[]            // ordered bottom→top for video; audio separate
  assets: { [assetId]: { kind: 'video'|'image'|'audio', path, durationMs?, w?, h?, proxyPath? } }
  brandRef?: { businessId }  // pulls logo/colours/fonts, never copies them
  source?: { projectId, kind } // "made from this design"
}
Track { id, kind: 'video'|'overlay'|'text'|'audio', name, muted, locked, hidden, clips: Clip[] }
Clip  { id, assetId?, startMs, durationMs, inMs (source offset),
        transform { x, y, w, h, rotation, opacity }  // normalised 0..1 like design
        keyframes?: { prop, tMs, value, ease }[]
        text?: TextStyle (reuse lib/studio/textStyle.ts)
        volume?, fadeInMs?, fadeOutMs?, transitionIn?: { type, ms } }
```

Time is integer milliseconds (never float seconds: drift accumulates on
split). Coordinates stay normalised 0..1 so 9:16 ↔ 16:9 reuses the design
resize choice (keep proportions vs fill).

**Adapter, not rewrite:** `fromMotionProject()` converts today's scene cards
into a VideoDocument (each scene → a background clip + text clips), so the
existing 11 motion styles and every localStorage project become editable
timelines on day one.

### 2.3 Rendering — honest about where it runs

| Stage | Where | Tech |
|---|---|---|
| Edit + preview | Browser | Canvas 2D compositor (extend `drawSceneFrame`), `<video>` elements as sources, Web Audio for mix |
| Export v1 | Browser | WebCodecs `VideoEncoder`/`AudioEncoder` → `mp4-muxer` (already a dependency). Frame-exact: renders frame N at N/fps, not real-time capture. Fallback: existing MediaRecorder path where WebCodecs is absent (Firefox < 130, older Safari). |
| Export v2 (later) | Server | Render worker with FFmpeg / Remotion. **Not available today**: Vercel functions and Supabase Edge Functions cannot run multi-minute FFmpeg jobs. Needs a separate worker host (founder decision + cost). |

Limits stated in the UI, not hidden: v1 export runs on the customer's device,
needs the tab open, and caps at 1080p / 60 s until the server worker exists.
No 4K originals in the editor — uploads above 1080p get a proxy on import
(browser-side transcode via WebCodecs).

### 2.4 Router

Extend `lib/create/intent.ts` `routeFor` with an `editor` field
(`design|video|motion|presentation|service|elsewhere`) and duration/format
extraction ("15-second reel" → video, 1080×1920, 15,000 ms). Same
deterministic, tested approach; no model. Multi-deliverable sentences return a
list (Campaign Studio later).

### 2.5 Cross-studio hand-off

- **Design → Video:** `videoFromDesign(designDoc)` — each design object
  becomes a clip on a text/overlay track spanning the full duration, with an
  optional default entrance keyframe. Fully editable; nothing rasterised
  except what the design already flattened.
- **Video → Design:** "Make a matching poster" builds a DesignDocument from a
  chosen frame's text clips + brand + the frame as an image layer.
- New project row with `source` pointing back; assets referenced, never copied.

## 3. Phases (re-ordered from the brief to fit what exists)

| # | Phase | Delivers | Size |
|---|---|---|---|
| A | **Envelope** | `kind` column migration (shared prod DB — needs go-ahead), loader dispatch, project list shows kind, lazy editor chunks. Design Editor untouched; regression test that every existing row opens. | S |
| B | **VideoDocument + adapter** | `videoDocument.ts` schema/validate/migrate, `fromMotionProject`, tests. Motion projects move from localStorage to `design_projects` (one-time import on open). | M |
| C | **Video Studio v1** | `/media/video/:id`: preview canvas, multi-track timeline (insert, trim, split, move, duplicate, delete, snap, lock/hide, zoom), media library (upload video/image/audio to storage), text clips with the Design Editor's text controls, volume + fades, basic transitions (cut/fade/slide), undo/redo, autosave, format presets 9:16/1:1/4:5/16:9/custom. | L |
| D | **Frame-exact export** | WebCodecs + mp4-muxer MP4, WebM fallback, progress + cancel, verified output inspected frame by frame. | M |
| E | **Templates as timelines** | The brief's video template list built as VideoDocuments (original work, no stock MP4s as "templates"). | M |
| F | **Motion keyframes** | Keyframes + easing on any clip transform; logo reveal / kinetic type as keyframed documents. Motion Studio = Video Studio with the graphics toolset forward, same document — not a third engine. | M |
| G | **Hand-offs + router** | Design↔Video, router `editor` field, "Create matching design". | M |
| H | Captions, Presentation, Campaign, Brand kit object, server render worker, AI video import | Each its own spec. | — |

Deliberately **not** in scope until demand shows: separate 3D, Audio and
Digital Experience editors (the brief itself says to avoid unnecessary
editors). Printing, billboard booking and hiring stay routed to Promote /
Media services as today.

## 4. Decisions needed from the founder

1. **Run migration A on production** (shared dev/prod DB). Additive column with
   a default; no existing row changes meaning.
2. **Motion Studio = mode of Video Studio** (one timeline document) rather than
   a third editor. Recommended.
3. **Server render worker** — needed for long/4K exports and Remotion. Requires
   a host outside Vercel/Supabase. Defer until v1 export usage is known?

## 5. Acceptance (per phase, before anything is called done)

Tests for every pure module; a browser run on localhost (note: localhost
writes to production DB) that creates, edits, saves, reloads and exports;
the exported file probed (duration, fps, frame count, audio present); the
Design Editor regression pass (open 5 saved designs, edit, export). No
performance numbers reported that were not measured.
