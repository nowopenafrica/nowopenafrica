/**
 * A business's own brand, resolved for use in a design.
 *
 * ── THE RIGHTS PROBLEM THIS EXISTS TO SOLVE ──────────────────────────────
 *
 * "Create with my brand" sounds like a convenience feature. It is a
 * LICENSING feature, because the output gets printed and sold.
 *
 * MEASURED on production, 2026-10-21: 528 businesses carry a logo.
 *
 *     319  provenance 'business'   (29 with a recorded licence)
 *     209  provenance 'unknown'    (0 with a licence)
 *
 * Those 209 came from somewhere nobody wrote down. Dropping one into a
 * customer's flyer and sending it to a printer is a rights risk we would be
 * creating on their behalf, silently, in exchange for saving them one
 * upload. So provenance decides: a logo is used when the business supplied
 * it, and withheld — with the reason said out loud — when it did not.
 *
 * ── WHAT A BRAND KIT ACTUALLY CONTAINS HERE ──────────────────────────────
 *
 * Less than the word suggests, and the gaps are stated rather than filled
 * with plausible defaults:
 *
 *   name      `businesses.name` — real, always present.
 *   logo      the business's logo, gated on provenance as above.
 *   tagline   the owner's own words from BrandIdentity, when they wrote one.
 *   colour    NOT STORED ANYWHERE. There is no brand-colour column on the
 *             businesses table and no field for one in BrandIdentity, which
 *             holds voice and copy. The colour on a design today is whatever
 *             was picked in the customiser for that design. So the kit
 *             carries the chosen colour and reports it as chosen, never as
 *             "your brand colour".
 *   fonts     NOT STORED either. The type system is per-design.
 *
 * Reporting those two as missing is the whole point. A kit that quietly
 * invents a brand colour teaches the owner that the platform knows their
 * brand when it does not.
 */

import type { DesignPage } from './designDocument';
import { normaliseColour, type PatchOp } from './designPatch';

/**
 * Where a logo came from, as the database records it.
 *
 * The caller maps the column; this module never queries. That separation is
 * deliberate — see `logoSource` below for the failure it prevents.
 */
export type LogoSource = 'business' | 'unknown' | (string & {});

export interface BrandSource {
  name: string;
  logoUrl?: string | null;
  /**
   * The recorded provenance, which the CALLER must have actually loaded.
   *
   * `undefined` and `'unknown'` are different facts and this module keeps
   * them apart. A business fetched by the public directory does not carry
   * provenance at all, so passing one here gives `undefined` — and silently
   * treating that as "unknown" would be indistinguishable from a business
   * whose logo really is unattributed. Both withhold the logo, which is the
   * safe answer either way, but only one of them is a bug in the caller and
   * the message says which.
   */
  logoSource?: LogoSource | null;
  logoLicence?: string | null;
  /** The owner's own one-line positioning, when they have written one. */
  tagline?: string | null;
}

export interface BrandKit {
  name: string;
  /** Present only when the business supplied the logo itself. */
  logoUrl: string | null;
  /** When a logo exists but may not be used, this says why. */
  logoWithheld: string | null;
  /** Normalised, or null when nothing usable was chosen. */
  accent: string | null;
  /**
   * Never 'business': no brand colour is stored against a business. Saying
   * 'chosen' keeps the screen honest about whose decision it was.
   */
  accentSource: 'chosen' | 'none';
  tagline: string | null;
  /** What the owner would have to supply for this to be a real brand kit. */
  missing: string[];
}

/**
 * The only provenance that may be used in a customer's artwork.
 *
 * `business` means the owner put it there. Everything else — an importer, a
 * scrape, a source nobody recorded — is someone else's asset until proven
 * otherwise, and proving otherwise is not something this code can do.
 */
const USABLE_LOGO_SOURCES = new Set<string>(['business']);

export function resolveBrandKit(source: BrandSource, chosenAccent?: string | null): BrandKit {
  const name = (source.name ?? '').trim();
  const accent = normaliseColour(chosenAccent ?? '') ?? null;
  const tagline = (source.tagline ?? '').trim() || null;

  let logoUrl: string | null = null;
  let logoWithheld: string | null = null;
  const logo = (source.logoUrl ?? '').trim();

  if (logo) {
    if (source.logoSource === undefined) {
      /* The caller did not load provenance. Still withheld — but say so, or
         this looks identical to a genuinely unattributed logo. */
      logoWithheld = 'This logo cannot be used because its source was not loaded. '
        + 'Fetch the provenance alongside the logo, or upload your own.';
    } else {
      const provenance = (source.logoSource ?? '').trim().toLowerCase();
      if (USABLE_LOGO_SOURCES.has(provenance)) {
        logoUrl = logo;
      } else {
        logoWithheld = provenance
          ? `This logo was recorded as "${provenance}", not supplied by the business, so it is not used in artwork. Upload your own to use it here.`
          : 'This logo has no recorded source, so it is not used in artwork. Upload your own to use it here.';
      }
    }
  }

  const missing: string[] = [];
  if (!logoUrl) missing.push('a logo you own');
  /*
   * Always missing, for everybody, until a brand colour has somewhere to
   * live. Listing it is how that gap stays visible instead of being papered
   * over by whatever colour the last design happened to use.
   */
  missing.push('a saved brand colour');
  missing.push('a saved brand typeface');
  if (!tagline) missing.push('a tagline');

  return {
    name,
    logoUrl,
    logoWithheld,
    accent,
    accentSource: accent ? 'chosen' : 'none',
    tagline,
    missing,
  };
}

/**
 * The edits that apply this kit to a page.
 *
 * Deliberately expressed as the SAME ten operations a typed instruction
 * produces, so a brand kit is validated, clamped and undone by exactly the
 * machinery everything else uses. Applying a brand must not be a second,
 * privileged way to write into a document.
 *
 * It touches only what it can justify:
 *
 *   - the `brand` slot's words become the business's real name,
 *   - an accent-toned text object takes the chosen colour.
 *
 * It does NOT restyle headlines, swap fonts or recolour the background.
 * Those are design decisions, and a feature that rearranges somebody's
 * artwork because they pressed "use my brand" is one they press once.
 */
export function brandKitOps(kit: BrandKit, page: DesignPage): PatchOp[] {
  const ops: PatchOp[] = [];

  if (kit.name) {
    const brand = page.objects.find((o) => o.type === 'text' && o.slotRole === 'brand' && !o.locked);
    if (brand) ops.push({ op: 'setText', id: brand.id, text: kit.name });
  }

  if (kit.accent) {
    for (const o of page.objects) {
      if (o.type !== 'text' || o.locked) continue;
      /* Only what the template already marked as the accent line. */
      if (o.slotRole !== 'eyebrow' && o.slotRole !== 'cta') continue;
      ops.push({ op: 'setColour', id: o.id, colour: kit.accent });
    }
  }

  return ops;
}

/** One line for the screen: what was applied, and what is still missing. */
export function describeBrandKit(kit: BrandKit): string {
  if (!kit.name) return 'No business selected, so there is no brand to apply.';
  const parts = [`Using ${kit.name}'s name`];
  if (kit.logoUrl) parts.push('and logo');
  if (kit.accent) parts.push('with the colour you chose');
  return `${parts.join(' ')}. Still to add: ${kit.missing.join(', ')}.`;
}
