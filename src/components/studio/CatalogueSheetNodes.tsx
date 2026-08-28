import { forwardRef } from 'react';

import { Business } from '../../types';
import { type SheetItem, type CatalogueLayout } from '../../lib/catalogueSheets';
import { profileUrl } from '../../lib/studio';

/**
 * The catalogue sheets.
 *
 * NO `dark:` VARIANTS, for the same reason the receipts have none: these are
 * exported and printed, and an owner working at night must not hand a customer
 * — or a print shop — a black page.
 *
 * Every sheet is drawn at its layout's exact pixel size and at the paper's own
 * proportions, so the PDF can place it full-bleed without a fit calculation
 * that would letterbox it.
 */

export interface SheetProps {
  business: Business;
  items: SheetItem[];
  layout: CatalogueLayout;
  accent: string;
  page: number;
  totalPages: number;
  qr?: string;
}

const INK = '#0f172a';
const MUTED = '#64748b';
const FAINT = '#94a3b8';
const LINE = '#e2e8f0';

/**
 * A product photograph, or a legible stand-in.
 *
 * The placeholder carries the item's initial rather than a generic icon: on a
 * page of nine, an owner scanning their own catalogue needs to tell the gaps
 * apart to know which product still needs a photograph.
 */
function Photo({ item, accent, radius = 10 }: { item: SheetItem; accent: string; radius?: number }) {
  if (item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt=""
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: radius, display: 'block' }}
      />
    );
  }
  return (
    <div
      style={{
        width: '100%', height: '100%', borderRadius: radius, background: `${accent}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent, fontWeight: 800, fontSize: 28,
      }}
    >
      {item.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function SheetHeader({ business, accent, subtitle }: { business: Business; accent: string; subtitle: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottom: `2px solid ${accent}` }}>
      {business.logo_url ? (
        <img src={business.logo_url} alt="" crossOrigin="anonymous"
          style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <span style={{
          width: 44, height: 44, borderRadius: 10, background: accent, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0,
        }}>{business.name.slice(0, 1).toUpperCase()}</span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 19, fontWeight: 800, color: INK, lineHeight: 1.2 }}>{business.name}</p>
        <p style={{ margin: 0, fontSize: 11, color: MUTED }}>{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * The footer.
 *
 * Carries the profile link on every page, not just the last: catalogue pages
 * get separated — forwarded one at a time, printed and pinned up — and a page
 * with no way back to the business is a page that sells nothing.
 */
function SheetFooter({ business, page, totalPages, qr }: { business: Business; page: number; totalPages: number; qr?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, color: INK, fontWeight: 600 }}>
          {[business.phone, business.location].filter(Boolean).join(' · ')}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: FAINT }}>
          {profileUrl(business).replace(/^https?:\/\//, '')}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 10, color: FAINT }}>Page {page} of {totalPages}</p>
        {qr && <img src={qr} alt="" style={{ width: 52, height: 52 }} />}
      </div>
    </div>
  );
}

/**
 * NO `maxWidth: '100%'` HERE, unlike the card nodes.
 *
 * A sheet is a fixed-size document — 794x1123 is A4 — and letting it shrink to
 * its container reflows the whole layout before anything is captured. The
 * preview strip found that out: it scaled the sheet with a transform, but the
 * sheet had already collapsed to the 300px preview width, so the thumbnail
 * showed a squashed page that was not what exported. Fixed width, and callers
 * scale it visually.
 */
const sheetBase = (layout: CatalogueLayout): React.CSSProperties => ({
  width: layout.width,
  height: layout.height,
  background: '#fff',
  color: INK,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
});

/** Shown when a page has no items, so the preview is never a blank rectangle. */
function EmptyNote({ accent }: { accent: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
      <p style={{ margin: 0, fontSize: 13, color: MUTED, maxWidth: 360 }}>
        Add products to your listing and they will appear here, laid out and ready to send.
        <span style={{ display: 'block', marginTop: 6, color: accent, fontWeight: 600 }}>Nothing to show yet.</span>
      </p>
    </div>
  );
}

// --- 1. Product grid ----------------------------------------------------------

export const GridSheet = forwardRef<HTMLDivElement, SheetProps>(
  ({ business, items, layout, accent, page, totalPages, qr }, ref) => (
    <div ref={ref} style={{ ...sheetBase(layout), padding: 36 }}>
      <SheetHeader business={business} accent={accent} subtitle={`Product catalogue · ${business.location || ''}`} />
      {items.length === 0 ? <EmptyNote accent={accent} /> : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '18px 0', alignContent: 'start' }}>
          {items.map((i) => (
            <div key={i.id} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ width: '100%', aspectRatio: '1 / 1', marginBottom: 8 }}>
                <Photo item={i} accent={accent} />
              </div>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {i.name}
              </p>
              {i.description && (
                <p style={{ margin: '2px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {i.description}
                </p>
              )}
              <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 800, color: accent }}>{i.price}</p>
            </div>
          ))}
        </div>
      )}
      <SheetFooter business={business} page={page} totalPages={totalPages} qr={qr} />
    </div>
  ),
);
GridSheet.displayName = 'GridSheet';

// --- 2. Lookbook --------------------------------------------------------------

export const LookbookSheet = forwardRef<HTMLDivElement, SheetProps>(
  ({ business, items, layout, accent, page, totalPages, qr }, ref) => (
    <div ref={ref} style={{ ...sheetBase(layout), padding: 36 }}>
      <SheetHeader business={business} accent={accent} subtitle="Lookbook" />
      {items.length === 0 ? <EmptyNote accent={accent} /> : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18, padding: '18px 0' }}>
          {items.map((i) => (
            <div key={i.id} style={{ flex: 1, display: 'flex', gap: 18, minHeight: 0 }}>
              <div style={{ width: '58%', minHeight: 0 }}>
                <Photo item={i} accent={accent} radius={14} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                {i.featured && (
                  <span style={{ alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: accent, marginBottom: 6 }}>
                    FEATURED
                  </span>
                )}
                <p style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{i.name}</p>
                {i.description && (
                  <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical' }}>
                    {i.description}
                  </p>
                )}
                <p style={{ margin: '12px 0 0', fontSize: 17, fontWeight: 800, color: accent }}>{i.price}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <SheetFooter business={business} page={page} totalPages={totalPages} qr={qr} />
    </div>
  ),
);
LookbookSheet.displayName = 'LookbookSheet';

// --- 3. Line sheet ------------------------------------------------------------

export const LineSheet = forwardRef<HTMLDivElement, SheetProps>(
  ({ business, items, layout, accent, page, totalPages, qr }, ref) => (
    <div ref={ref} style={{ ...sheetBase(layout), padding: 34 }}>
      <SheetHeader business={business} accent={accent} subtitle="Line sheet · wholesale" />
      {items.length === 0 ? <EmptyNote accent={accent} /> : (
        <div style={{ flex: 1, padding: '14px 0', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 12, padding: '0 0 6px', borderBottom: `1px solid ${LINE}`, fontSize: 9.5, fontWeight: 800, color: MUTED, letterSpacing: '0.06em' }}>
            <span style={{ width: 44 }}>ITEM</span>
            <span style={{ flex: 1 }}>DESCRIPTION</span>
            <span style={{ width: 72 }}>CODE</span>
            <span style={{ width: 90, textAlign: 'right' }}>PRICE</span>
          </div>
          {items.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '7px 0', borderBottom: `1px solid #f1f5f9` }}>
              <div style={{ width: 44, height: 44, flexShrink: 0 }}><Photo item={i} accent={accent} radius={6} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.name}</p>
                {i.description && (
                  <p style={{ margin: 0, fontSize: 9.5, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.description}</p>
                )}
              </div>
              {/* A short, stable code from the row's own id — a wholesale sheet
                  is ordered from by reference, and the id is the only stable
                  handle these rows have. */}
              <span style={{ width: 72, fontSize: 10, color: FAINT, fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}>
                {i.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}
              </span>
              <span style={{ width: 90, textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: accent }}>{i.price}</span>
            </div>
          ))}
        </div>
      )}
      <SheetFooter business={business} page={page} totalPages={totalPages} qr={qr} />
    </div>
  ),
);
LineSheet.displayName = 'LineSheet';

// --- 4. Menu ------------------------------------------------------------------

export const MenuSheet = forwardRef<HTMLDivElement, SheetProps>(
  ({ business, items, layout, accent, page, totalPages, qr }, ref) => (
    <div ref={ref} style={{ ...sheetBase(layout), padding: 40 }}>
      <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: `2px solid ${accent}` }}>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '0.02em' }}>{business.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: MUTED, letterSpacing: '0.22em' }}>MENU</p>
      </div>
      {items.length === 0 ? <EmptyNote accent={accent} /> : (
        // Two columns, because a menu is read down a column and a single column
        // of eighteen rows wastes half the page.
        <div style={{ flex: 1, columnCount: 2, columnGap: 34, padding: '20px 0' }}>
          {items.map((i) => (
            <div key={i.id} style={{ breakInside: 'avoid', marginBottom: 13 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{i.name}</span>
                {/* The dotted leader is what makes a price line scan as a menu. */}
                <span style={{ flex: 1, borderBottom: `1px dotted ${FAINT}`, transform: 'translateY(-3px)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: accent, whiteSpace: 'nowrap' }}>{i.price}</span>
              </div>
              {i.description && (
                <p style={{ margin: '1px 0 0', fontSize: 10, color: MUTED, lineHeight: 1.35 }}>{i.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
      <SheetFooter business={business} page={page} totalPages={totalPages} qr={qr} />
    </div>
  ),
);
MenuSheet.displayName = 'MenuSheet';

// --- 5. Social square ---------------------------------------------------------

export const SocialSheet = forwardRef<HTMLDivElement, SheetProps>(
  ({ business, items, layout, accent, page, totalPages, qr }, ref) => (
    <div ref={ref} style={{ ...sheetBase(layout), padding: 52 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>{business.name}</p>
          <p style={{ margin: '4px 0 0', fontSize: 17, color: accent, fontWeight: 700 }}>
            {totalPages > 1 ? `Catalogue · ${page} of ${totalPages}` : 'Catalogue'}
          </p>
        </div>
        {qr && <img src={qr} alt="" style={{ width: 92, height: 92, flexShrink: 0 }} />}
      </div>

      {/* Rows share the height rather than each demanding a square photo. With
          `aspectRatio: 1/1` a full page of four overflowed the 1080 frame by
          240px — the fourth product was simply cut off the exported image,
          silently. The photo flexes into whatever is left instead, and
          object-fit keeps it from distorting. */}
      {items.length === 0 ? <EmptyNote accent={accent} /> : (
        <div style={{
          flex: 1, minHeight: 0, display: 'grid',
          gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr',
          gap: 22, padding: '30px 0',
        }}>
          {items.map((i) => (
            <div key={i.id} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
              <div style={{ width: '100%', flex: 1, minHeight: 0, marginBottom: 12 }}>
                <Photo item={i} accent={accent} radius={18} />
              </div>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {i.name}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: accent }}>{i.price}</p>
            </div>
          ))}
        </div>
      )}

      <p style={{ margin: 0, fontSize: 19, color: MUTED, textAlign: 'center' }}>
        {profileUrl(business).replace(/^https?:\/\//, '')}
      </p>
    </div>
  ),
);
SocialSheet.displayName = 'SocialSheet';

// --- 6. Story / status --------------------------------------------------------

export const StorySheet = forwardRef<HTMLDivElement, SheetProps>(
  ({ business, items, layout, accent, page, totalPages, qr }, ref) => (
    <div ref={ref} style={{ ...sheetBase(layout), padding: 68 }}>
      <div style={{ paddingTop: 40 }}>
        <p style={{ margin: 0, fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>{business.name}</p>
        <p style={{ margin: '8px 0 0', fontSize: 24, color: accent, fontWeight: 700 }}>
          {totalPages > 1 ? `Catalogue · ${page} of ${totalPages}` : 'Our catalogue'}
        </p>
      </div>

      {items.length === 0 ? <EmptyNote accent={accent} /> : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 30, padding: '52px 0', justifyContent: 'center' }}>
          {items.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: 26, alignItems: 'center', minWidth: 0 }}>
              <div style={{ width: 230, height: 230, flexShrink: 0 }}>
                <Photo item={i} accent={accent} radius={22} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 34, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {i.name}
                </p>
                <p style={{ margin: '10px 0 0', fontSize: 36, fontWeight: 800, color: accent }}>{i.price}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', paddingBottom: 40 }}>
        {qr && <img src={qr} alt="" style={{ width: 150, height: 150, margin: '0 auto 14px', display: 'block' }} />}
        {/* Printed as text as well as encoded, because a re-shared screenshot
            keeps the words and loses nothing else that still works. */}
        <p style={{ margin: 0, fontSize: 24, color: MUTED }}>
          {profileUrl(business).replace(/^https?:\/\//, '')}
        </p>
      </div>
    </div>
  ),
);
StorySheet.displayName = 'StorySheet';
