import { supabase } from './supabase';
import { parseHeroSlides, type HeroSlide } from './heroSlides';

// Hero banner settings — the admin switches the video slider on or off, and
// picks a background colour for when it is off.
//
// The gradient is the DEFAULT, not a stored value. `bannerColor: null` means
// "unchanged", and the homepage renders the NowOpen gradient. Storing the
// gradient string instead would freeze today's brand colours into the database,
// so a future brand change would silently not apply to any site that had ever
// opened this screen.
//
// Every read fails soft. This table is newer than the live database (see the
// repo's history of migrations lagging the deployed schema), and a homepage
// that white-screens because a settings row is missing would be a far worse
// bug than a banner that ignores a preference.

export const SETTINGS_TABLE = 'site_settings';
export const HERO_KEY = 'hero_banner';

/** The live NowOpen brand gradient. Single source of truth for the hero. */
export const NOWOPEN_GRADIENT =
  'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 20%, #831843 40%, #9a3412 60%, #92400e 80%, #166534 100%)';

export interface HeroSettings {
  /** When false the video slider is not mounted at all — no download, no decode. */
  videoEnabled: boolean;
  /** CSS colour for the banner when video is off. null = keep the gradient. */
  bannerColor: string | null;
  /**
   * Tie the banner headline's fade to the clips instead of a free-running
   * timer: text fades out over each clip's final seconds, the next clip takes
   * over while it is hidden, then it fades back in. Off means the old
   * behaviour, where the two ran independently and regularly collided.
   */
  textSyncWithVideo: boolean;
  /**
   * Slides added by URL — a YouTube link, or a video file on a host the page is
   * allowed to load from. Stored here rather than in a table of their own
   * because site_settings.value is already JSONB and this is a handful of rows
   * an admin edits by hand; a table would be a migration for no benefit.
   */
  urlSlides: HeroSlide[];
}

export const DEFAULT_HERO: HeroSettings = { videoEnabled: true, bannerColor: null, textSyncWithVideo: true, urlSlides: [] };

/** Accept only what we understand; anything else falls back to the default. */
export function parseHeroSettings(value: unknown): HeroSettings {
  if (!value || typeof value !== 'object') return DEFAULT_HERO;
  const v = value as Record<string, unknown>;
  const color = typeof v.bannerColor === 'string' && v.bannerColor.trim() ? v.bannerColor.trim() : null;
  return {
    videoEnabled: v.videoEnabled !== false,
    bannerColor: color,
    textSyncWithVideo: v.textSyncWithVideo !== false,
    // parseHeroSlides re-derives each playback URL and drops anything it cannot
    // play, so a stale or hand-edited row can never reach an iframe src.
    urlSlides: parseHeroSlides(v.urlSlides),
  };
}

/** The background the hero should paint, given its settings. */
export function heroBackground(settings: HeroSettings): string {
  // A colour only applies when the video is off. With video on it would never
  // be seen anyway, and showing it in the admin preview would be a lie.
  if (!settings.videoEnabled && settings.bannerColor) return settings.bannerColor;
  return NOWOPEN_GRADIENT;
}

export async function loadHeroSettings(): Promise<HeroSettings> {
  try {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('value')
      .eq('key', HERO_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_HERO;
    return parseHeroSettings(data.value);
  } catch {
    return DEFAULT_HERO;
  }
}

export interface SaveResult { ok: boolean; error?: string }

export async function saveHeroSettings(settings: HeroSettings, userId?: string): Promise<SaveResult> {
  const { error } = await supabase
    .from(SETTINGS_TABLE)
    .upsert(
      { key: HERO_KEY, value: settings, updated_at: new Date().toISOString(), updated_by: userId ?? null },
      { onConflict: 'key' },
    );
  if (!error) return { ok: true };

  // Name the likely cause. "Failed to save" sends someone hunting through the
  // UI when the real answer is that a migration has not been applied — which
  // has happened repeatedly on this project.
  const missing = /relation .*site_settings.* does not exist|schema cache/i.test(error.message);
  return {
    ok: false,
    error: missing
      ? 'The site_settings table is missing — apply the latest migrations to this project.'
      : error.message,
  };
}
