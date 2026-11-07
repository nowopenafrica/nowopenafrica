import { useEffect, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { ADVERT_CATEGORY_GROUPS } from '../../data/advertCategories';
import { CURRENCIES, loadRates } from '../../lib/currency';
import { isStockPlaceholder } from '../../lib/stockImage';
import {
  createPlacement, updatePlacement, uploadPlacementPhoto, checkPhotoFile, cityOf, placementSavedText, savedWithProblem, readPlacementLifecycle, PARTNER_MESSAGES, PLACEMENT_COUNTRIES,
  type MyMediaOwner, type OwnerPlacement, type PlacementPatch,
} from '../../lib/promote/partner';
import {
  sizeSummary, toUsdPerDay, SIZE_KIND_LABELS, VEHICLE_EXTENT_LABELS,
  type RatePeriod, type SizeKind, type SizeSpec, type VehicleExtent,
} from '../../lib/promote/sizeSpec';

/**
 * The placement form in the Media owner tab: list a new placement, or edit
 * one linked to this owner.
 *
 * WHAT THE DATABASE DECIDES, NOT THIS FORM
 *
 * owner_create_placement sets the lifecycle from the owner's verification:
 * pending_review for an unverified owner (an admin decides), partner_verified
 * for a verified one. The saved message is read from the created row's own
 * lifecycle afterwards, so it never claims more than the row says. It also composes location as "City,
 * Country" from city and country_code; this form never sends a location.
 *
 * WHY EDITS SEND ONLY WHAT CHANGED
 *
 * owner_update_placement refuses keys outside its list, and a price change is
 * what moves the pricing source date to today. Sending every field on every
 * save would restate a price nobody changed. So the patch holds only the
 * changed groups: the price group (amount, currency, period and the derived
 * USD per day) goes together because pricing is derived from all three.
 *
 * PRICE
 *
 * The owner states their own rate (amount, currency, per day/week/month).
 * Promote reads `pricing`, USD per day, derived here with toUsdPerDay from the
 * same rates the CurrencyProvider loads (loadRates, cached). Until those load,
 * the bundled fallback rates stand in, as they do across the site.
 *
 * PHOTOS
 *
 * Real photos only. A stock-library link is refused here in the database's
 * own words before any call. Uploads need the advert id in their path
 * (placements/{advert_id}/), so a new placement is created first and its
 * photos uploaded after; if that second step fails the placement still
 * exists, and the message says so.
 *
 * Touch targets are in explicit px: the app's root font is below 16px.
 */

/*
 * The countries owner_create_placement accepts, with the currency an owner
 * there most likely quotes in: PLACEMENT_COUNTRIES in partner.ts (shared with
 * the spreadsheet import).
 */
const COUNTRIES = PLACEMENT_COUNTRIES;

const PERIOD_LABELS: Record<RatePeriod, string> = { day: 'day', week: 'week', month: 'month' };

const FIELD = 'min-h-[44px] w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-3 py-2 text-sm';
const LABEL = 'block text-sm text-gray-700 dark:text-gray-300 space-y-1';
const BTN = 'min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white hover:bg-blue-700`;
const BTN_PLAIN = `${BTN} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;

interface Values {
  category: string;
  title: string;
  description: string;
  city: string;
  country: string;
  address: string;
  sizeKind: SizeKind | '';
  width: string;
  height: string;
  resolution: string;
  orientation: 'landscape' | 'portrait';
  seconds: string;
  spots: string;
  extent: VehicleExtent;
  otherText: string;
  rateAmount: string;
  currency: string;
  period: RatePeriod;
  photoLink: string;
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

function initialValues(p?: OwnerPlacement): Values {
  const s = p?.size_spec ?? null;
  return {
    category: p?.category ?? '',
    title: p?.title ?? '',
    description: p?.description ?? '',
    city: cityOf(p?.location),
    country: p?.country_code ?? '',
    address: p?.site_address ?? '',
    sizeKind: s?.kind ?? '',
    width: s?.kind === 'area' ? str(s.widthM) : '',
    height: s?.kind === 'area' ? str(s.heightM) : '',
    resolution: s?.kind === 'screen' ? s.resolution : '',
    orientation: s?.kind === 'screen' ? s.orientation : 'landscape',
    seconds: s?.kind === 'airtime' ? str(s.seconds) : '',
    spots: s?.kind === 'airtime' ? str(s.spotsPerDay) : '',
    extent: s?.kind === 'vehicle' ? s.extent : 'both_flanks',
    otherText: s?.kind === 'other' ? s.text : '',
    rateAmount: str(p?.rate_amount),
    currency: p?.currency ?? 'NGN',
    period: p?.rate_period ?? 'month',
    photoLink: '',
  };
}

const positive = (s: string) => { const n = Number(s); return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null; };

/** The structured size, or the words saying what is missing. No kind chosen = no size. */
function readSize(v: Values): { spec: SizeSpec | null; error: string | null } {
  switch (v.sizeKind) {
    case '':
      return { spec: null, error: 'Choose the size of the placement' };
    case 'area': {
      const w = positive(v.width); const h = positive(v.height);
      return w && h ? { spec: { kind: 'area', widthM: w, heightM: h }, error: null } : { spec: null, error: 'Enter the width and height in metres' };
    }
    case 'screen':
      return v.resolution.trim()
        ? { spec: { kind: 'screen', resolution: v.resolution.trim(), orientation: v.orientation }, error: null }
        : { spec: null, error: 'Enter the screen resolution, for example 1920x1080' };
    case 'airtime': {
      const s = positive(v.seconds); const n = positive(v.spots);
      return s && n ? { spec: { kind: 'airtime', seconds: s, spotsPerDay: n }, error: null } : { spec: null, error: 'Enter the seconds per spot and the spots per day' };
    }
    case 'vehicle':
      return { spec: { kind: 'vehicle', extent: v.extent }, error: null };
    case 'other':
      return v.otherText.trim()
        ? { spec: { kind: 'other', text: v.otherText.trim() }, error: null }
        : { spec: null, error: 'Describe the size' };
  }
}

export default function OwnerPlacementForm({ owner, placement, onSaved, onCancel }: {
  owner: MyMediaOwner;
  /** Present when editing a placement linked to this owner. */
  placement?: OwnerPlacement;
  /** Called after a save with the sentence the owner should read. */
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const editing = Boolean(placement);
  const initial = useMemo(() => initialValues(placement), [placement]);
  const [v, setV] = useState<Values>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [rates, setRates] = useState<Record<string, number>>(
    () => Object.fromEntries(CURRENCIES.map((c) => [c.code, c.fallbackRate])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadRates().then((r) => { if (alive) setRates(r.rates); });
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((cur) => ({ ...cur, [k]: value }));

  const rateAmount = v.rateAmount.trim() === '' ? null : Number(v.rateAmount);
  const usdPerDay = rateAmount !== null ? toUsdPerDay(rateAmount, v.currency, v.period, rates) : null;

  /** Everything checked before any call, in the order the form reads. */
  const validate = (): { size: SizeSpec | null; error: string | null } => {
    if (!v.category) return { size: null, error: 'Choose the type of placement' };
    if (!v.title.trim()) return { size: null, error: 'A site name is required' };
    if (!v.city.trim()) return { size: null, error: 'A city is required' };
    if (v.city.includes(',')) return { size: null, error: PARTNER_MESSAGES.cityComma };
    if (!v.country) return { size: null, error: 'Choose the country' };
    const size = readSize(v);
    if (size.error) return { size: null, error: size.error };
    if (rateAmount !== null && (!Number.isFinite(rateAmount) || rateAmount < 0)) return { size: null, error: 'The price must be a number' };
    if (v.photoLink.trim() && isStockPlaceholder(v.photoLink)) return { size: null, error: PARTNER_MESSAGES.stockPhoto };
    for (const f of files) {
      const refused = checkPhotoFile(f);
      if (refused) return { size: null, error: refused };
    }
    return { size: size.spec, error: null };
  };

  const uploadAll = async (advertId: string): Promise<{ urls: string[]; error: string | null }> => {
    const urls: string[] = [];
    for (const f of files) {
      const r = await uploadPlacementPhoto(advertId, f);
      if (!r.ok) return { urls, error: r.error };
      urls.push(r.url);
    }
    return { urls, error: null };
  };

  const create = async (size: SizeSpec | null) => {
    const link = v.photoLink.trim() || null;
    const r = await createPlacement(owner.id, {
      category: v.category, title: v.title, description: v.description,
      city: v.city, country_code: v.country, site_address: v.address,
      size_spec: size, rate_amount: rateAmount, currency: v.currency,
      rate_period: rateAmount === null ? null : v.period, pricing: usdPerDay,
      image_url: link, media_urls: link ? [link] : null,
    });
    if (!r.ok) { setError(r.error); return; }
    // The database chose the lifecycle; say what it chose. A failed read
    // claims nothing ("Saved.") rather than guess from the page's owner row.
    const read = await readPlacementLifecycle(r.advertId);
    const savedSentence = placementSavedText(read.ok ? read.lifecycle : null);
    if (files.length === 0) { onSaved(savedSentence); return; }
    const up = await uploadAll(r.advertId);
    if (up.urls.length) {
      const media = link ? [link, ...up.urls] : up.urls;
      const rec = await updatePlacement(r.advertId, { image_url: link ?? up.urls[0], media_urls: media });
      if (!rec.ok) { onSaved(savedWithProblem(savedSentence, `The photos could not be added: ${rec.error}`)); return; }
    }
    if (up.error) { onSaved(savedWithProblem(savedSentence, `A photo could not be uploaded: ${up.error}`)); return; }
    onSaved(savedSentence);
  };

  const edit = async (p: OwnerPlacement, size: SizeSpec | null) => {
    const patch: PlacementPatch = {};
    if (v.title.trim() !== initial.title) patch.title = v.title.trim();
    if (v.description.trim() !== initial.description.trim()) patch.description = v.description.trim() || null;
    if (v.city.trim() !== initial.city) patch.city = v.city.trim();
    if (v.country !== initial.country) patch.country_code = v.country;
    if (v.address.trim() !== initial.address.trim()) patch.site_address = v.address.trim() || null;
    if (JSON.stringify(size) !== JSON.stringify(readSize(initial).spec)) {
      patch.size_spec = size;
      patch.dimensions = size ? sizeSummary(size) : null;
    }
    // Compared as numbers: "450000.0" is not a new price, and re-sending the
    // group would move the pricing source date and write an audit row.
    const initialRate = initial.rateAmount === '' ? null : Number(initial.rateAmount);
    if (rateAmount !== initialRate || v.currency !== initial.currency || v.period !== initial.period) {
      patch.rate_amount = rateAmount;
      patch.currency = v.currency;
      patch.rate_period = rateAmount === null ? null : v.period;
      patch.pricing = usdPerDay;
    }
    const link = v.photoLink.trim() || null;
    let uploadError: string | null = null;
    if (link || files.length) {
      const up = await uploadAll(p.id);
      uploadError = up.error;
      const added = [...(link ? [link] : []), ...up.urls];
      if (added.length) {
        patch.media_urls = [...(p.media_urls ?? []), ...added];
        if (!p.image_url || link) patch.image_url = link ?? added[0];
      }
    }
    if (Object.keys(patch).length === 0) {
      if (uploadError) setError(uploadError); else onSaved('Nothing changed');
      return;
    }
    const r = await updatePlacement(p.id, patch);
    if (!r.ok) { setError(r.error); return; }
    onSaved(uploadError ? `Changes saved. A photo could not be uploaded: ${uploadError}` : 'Changes saved');
  };

  const save = async () => {
    if (busy) return;
    setError(null);
    const checked = validate();
    if (checked.error) { setError(checked.error); return; }
    setBusy(true);
    try {
      if (placement) await edit(placement, checked.size);
      else await create(checked.size);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="Placement"
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      noValidate
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{editing ? `Edit ${placement!.title}` : 'Add a placement'}</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          <span>Type of placement</span>
          <select aria-label="Type of placement" className={FIELD} value={v.category} disabled={editing}
            onChange={(e) => set('category', e.target.value)}>
            <option value="">Choose…</option>
            {/* Not editable later: owner_update_placement does not accept it. */}
            {ADVERT_CATEGORY_GROUPS.map((g) => (
              <optgroup key={g.key} label={g.label}>
                {g.members.map((m) => <option key={m} value={m}>{m}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          <span>Site name</span>
          <input aria-label="Site name" className={FIELD} value={v.title} onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Ikeja Along unipole" />
        </label>
        <label className={LABEL}>
          <span>City</span>
          <input aria-label="City" className={FIELD} value={v.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Lagos" />
        </label>
        <label className={LABEL}>
          <span>Country</span>
          <select aria-label="Country" className={FIELD} value={v.country}
            onChange={(e) => {
              const code = e.target.value;
              const c = COUNTRIES.find((x) => x.code === code);
              // The currency follows the country only on create. On an edit it
              // would silently re-denominate the owner's rate.
              setV((cur) => ({ ...cur, country: code, currency: !editing && c ? c.currency : cur.currency }));
            }}>
            <option value="">Choose…</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </label>
        <label className={`${LABEL} sm:col-span-2`}>
          <span>Address or landmark</span>
          <input aria-label="Address or landmark" className={FIELD} value={v.address} onChange={(e) => set('address', e.target.value)}
            placeholder="e.g. Opposite Ikeja City Mall, Obafemi Awolowo Way" />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-900 dark:text-white">Size</legend>
        <label className={LABEL}>
          <span className="sr-only">Size</span>
          <select aria-label="Size" className={FIELD} value={v.sizeKind} onChange={(e) => set('sizeKind', e.target.value as SizeKind | '')}>
            <option value="">Choose…</option>
            {(Object.keys(SIZE_KIND_LABELS) as SizeKind[]).map((k) => <option key={k} value={k}>{SIZE_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        {v.sizeKind === 'area' && (
          <div className="grid gap-3 grid-cols-2">
            <label className={LABEL}><span>Width (m)</span>
              <input aria-label="Width (m)" inputMode="decimal" className={FIELD} value={v.width} onChange={(e) => set('width', e.target.value)} />
            </label>
            <label className={LABEL}><span>Height (m)</span>
              <input aria-label="Height (m)" inputMode="decimal" className={FIELD} value={v.height} onChange={(e) => set('height', e.target.value)} />
            </label>
          </div>
        )}
        {v.sizeKind === 'screen' && (
          <div className="grid gap-3 grid-cols-2">
            <label className={LABEL}><span>Resolution</span>
              <input aria-label="Resolution" className={FIELD} value={v.resolution} placeholder="1920x1080" onChange={(e) => set('resolution', e.target.value)} />
            </label>
            <label className={LABEL}><span>Orientation</span>
              <select aria-label="Orientation" className={FIELD} value={v.orientation} onChange={(e) => set('orientation', e.target.value as Values['orientation'])}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </label>
          </div>
        )}
        {v.sizeKind === 'airtime' && (
          <div className="grid gap-3 grid-cols-2">
            <label className={LABEL}><span>Seconds per spot</span>
              <input aria-label="Seconds per spot" inputMode="numeric" className={FIELD} value={v.seconds} onChange={(e) => set('seconds', e.target.value)} />
            </label>
            <label className={LABEL}><span>Spots per day</span>
              <input aria-label="Spots per day" inputMode="numeric" className={FIELD} value={v.spots} onChange={(e) => set('spots', e.target.value)} />
            </label>
          </div>
        )}
        {v.sizeKind === 'vehicle' && (
          <label className={LABEL}><span>Coverage</span>
            <select aria-label="Coverage" className={FIELD} value={v.extent} onChange={(e) => set('extent', e.target.value as VehicleExtent)}>
              {(Object.keys(VEHICLE_EXTENT_LABELS) as VehicleExtent[]).map((k) => <option key={k} value={k}>{VEHICLE_EXTENT_LABELS[k]}</option>)}
            </select>
          </label>
        )}
        {v.sizeKind === 'other' && (
          <label className={LABEL}><span>Describe the size</span>
            <input aria-label="Describe the size" className={FIELD} value={v.otherText} placeholder="e.g. 10 lightboxes, 1.2m × 1.8m each"
              onChange={(e) => set('otherText', e.target.value)} />
            <span className="block text-xs text-gray-500">An admin reads this before it is shown.</span>
          </label>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-900 dark:text-white">Price (optional)</legend>
        <div className="grid gap-3 grid-cols-3">
          <label className={LABEL}><span>Price</span>
            <input aria-label="Price" inputMode="decimal" className={FIELD} value={v.rateAmount} onChange={(e) => set('rateAmount', e.target.value)} />
          </label>
          <label className={LABEL}><span>Currency</span>
            <select aria-label="Currency" className={FIELD} value={v.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </label>
          <label className={LABEL}><span>Per</span>
            <select aria-label="Per" className={FIELD} value={v.period} onChange={(e) => set('period', e.target.value as RatePeriod)}>
              {(Object.keys(PERIOD_LABELS) as RatePeriod[]).map((k) => <option key={k} value={k}>{PERIOD_LABELS[k]}</option>)}
            </select>
          </label>
        </div>
        {usdPerDay !== null && (
          <p className="text-xs text-gray-500">About US${usdPerDay.toFixed(2)} a day at today&apos;s exchange rate. Advertisers see prices in their own currency.</p>
        )}
      </fieldset>

      <label className={LABEL}>
        <span>Description (optional)</span>
        <textarea aria-label="Description (optional)" rows={3} className={FIELD} value={v.description} onChange={(e) => set('description', e.target.value)} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-gray-900 dark:text-white">Photos of the site</legend>
        {placement?.media_urls?.length ? (
          <div className="flex flex-wrap gap-2">
            {placement.media_urls.map((u) => <img key={u} src={u} alt="" className="h-16 w-24 rounded object-cover" />)}
          </div>
        ) : null}
        <label className={`${BTN_PLAIN} cursor-pointer w-fit`}>
          <Upload size={15} /> Upload photos
          <input aria-label="Upload photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        </label>
        {files.length > 0 && <p className="text-xs text-gray-500">{files.length === 1 ? '1 photo chosen' : `${files.length} photos chosen`}</p>}
        <label className={LABEL}>
          <span>Photo link (optional)</span>
          <input aria-label="Photo link (optional)" className={FIELD} value={v.photoLink} placeholder="https://"
            onChange={(e) => set('photoLink', e.target.value)} />
        </label>
        <p className="text-xs text-gray-500">Use photos of this site. Stock photos are not accepted.</p>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 text-sm p-3">{error}</p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>
          {busy && <Loader2 size={15} className="animate-spin" />}
          {editing ? 'Save changes' : 'Save placement'}
        </button>
        <button type="button" className={BTN_PLAIN} disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
