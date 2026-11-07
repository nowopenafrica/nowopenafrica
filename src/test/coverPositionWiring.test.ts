import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The cover frame is h-36 sm:h-72 md:h-96 at full width, so its aspect ratio
 * changes with the viewport — and the same picture is cropped again as a
 * directory card. One stored focal point serves every shape; a crop would be
 * right at one size and wrong at the rest.
 */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const FORM = strip(readFileSync('src/components/dashboard/BusinessForm.tsx', 'utf8'));
const DETAIL = strip(readFileSync('src/pages/BusinessDetail.tsx', 'utf8'));
const CARD = strip(readFileSync('src/components/discover/BusinessCard.tsx', 'utf8'));
const PAYLOAD = strip(readFileSync('src/lib/fetchAllBusinesses.ts', 'utf8'));
const EDITOR = strip(readFileSync('src/components/dashboard/CoverPositionEditor.tsx', 'utf8'));

describe('an owner can position their cover', () => {
  it('offers the editor once there is a cover to position', () => {
    expect(FORM).toMatch(/<CoverPositionEditor/);
    expect(FORM).toMatch(/formData\.image_url \|\| formData\.cover_video_url/);
  });

  it('positions a video cover as well as a photo', () => {
    expect(FORM).toMatch(/kind=\{formData\.cover_video_url \? 'video' : 'image'\}/);
    expect(EDITOR).toMatch(/kind === 'video'/);
  });

  it('saves the choice, and survives a database without the columns', () => {
    expect(FORM).toMatch(/cover_focal_x/);
    expect(FORM).toMatch(/cover_focal_\//);
  });
});

describe('every surface that crops the cover honours it', () => {
  it('the profile header', () => {
    expect(DETAIL).toMatch(/objectPosition: focalToCss\(business\.cover_focal_x/);
  });

  /* A cover positioned on the profile would otherwise be wrong in the directory. */
  it('and the directory card', () => {
    expect(CARD).toMatch(/objectPosition: focalToCss\(/);
    expect(PAYLOAD).toMatch(/'cover_focal_x'/);
    expect(PAYLOAD).toMatch(/'cover_focal_y'/);
  });
});

describe('the editor is usable without a mouse', () => {
  it('takes arrow keys and is focusable', () => {
    expect(EDITOR).toMatch(/onKeyDown/);
    expect(EDITOR).toMatch(/ArrowLeft/);
    expect(EDITOR).toMatch(/tabIndex=\{0\}/);
    expect(EDITOR).toMatch(/aria-label=/);
  });

  /* Touch-first audience: pointer events cover finger, pen and mouse alike. */
  it('uses pointer events and does not scroll the page mid-drag', () => {
    expect(EDITOR).toMatch(/onPointerDown/);
    expect(EDITOR).toMatch(/setPointerCapture/);
    expect(EDITOR).toMatch(/touch-none/);
  });

  it('never re-encodes or crops the uploaded file', () => {
    expect(EDITOR).not.toMatch(/canvas|toDataURL|toBlob|createImageBitmap/);
  });
});

describe('a cover is a photo or a video, not both', () => {
  it('offers an explicit choice rather than two open fields', () => {
    expect(FORM).toMatch(/\['photo', 'video'\] as const/);
    expect(FORM).toMatch(/coverKind === kind/);
  });

  /*
   * The selected tab is data where it can be — a stored video URL means the
   * cover IS a video — and intent only where it cannot, because somebody who
   * clicked Video before pasting one has nothing in the row to remember it by.
   */
  it('lets stored data win over the intent flag', () => {
    expect(FORM).toMatch(/formData\.cover_video_url \|\| wantsVideo \? 'video' : 'photo'/);
  });

  it('drops the video when the owner chooses a photo', () => {
    expect(FORM).toMatch(/cover_video_url: ''/);
  });

  /*
   * And NOT the other way round: image_url is the poster the player shows
   * while the video loads, and the still every directory card falls back to
   * (`business.image_url || business.logo_url`). Clearing it would leave a
   * video-only business with no card image at all.
   */
  it('keeps the still when the owner chooses a video', () => {
    const choose = FORM.slice(FORM.indexOf("if (kind === 'photo')"), FORM.indexOf('setWantsVideo(true)'));
    expect(choose).not.toMatch(/image_url: ''/);
    expect(FORM).toMatch(/shown on cards and while the video loads/);
  });

  it('only shows the paste field for the chosen kind', () => {
    expect(FORM).toMatch(/\{coverKind === 'video' && \(/);
  });
});
