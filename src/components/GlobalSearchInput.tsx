import { useMemo, useRef, useState, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Tag, Store, Megaphone, Clapperboard, ArrowUpRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { rankMatches, splitMatch } from '../lib/search';
import { AFRICAN_PLACES, placeLabel } from '../data/locations';
import { BUSINESS_CATEGORIES } from '../data/categories';
import { ADVERT_CATEGORIES } from '../data/advertCategories';
import { generateBusinesses, generateAdverts, generateMediaServices } from '../data/populateData';

type SearchType = 'businesses' | 'adverts' | 'media';

interface IndexItem {
  type: SearchType;
  label: string;
  sub: string;
  href: string;
  category?: string;
  location?: string;
  /** Additional categories a business also serves (primary is in `category`) */
  secondaryCategories?: string[];
}

interface SearchIndex {
  items: IndexItem[];
  categories: Record<SearchType, string[]>;
  locations: string[];
}

const TYPE_ICONS: Record<SearchType, typeof Store> = {
  businesses: Store,
  adverts: Megaphone,
  media: Clapperboard,
};

// Build the search index once per session: live rows from all three tables
// (name/title + category + location only — a light query), falling back to
// the sample generators for any table that's still empty.
let indexPromise: Promise<SearchIndex> | null = null;

async function buildIndex(): Promise<SearchIndex> {
  const [bizRes, adRes, mediaRes] = await Promise.all([
    // Public view only — see VoiceAssistant for why RLS alone is not enough here.
    supabase.from('businesses').select('id, name, username, category, secondary_categories, location').eq('is_listable', true).limit(300),
    supabase.from('advertisements').select('id, title, category, location').limit(300),
    supabase.from('media_services').select('id, title, service_type').limit(300),
  ]).catch(() => [null, null, null] as const);

  const biz = bizRes?.data?.length ? bizRes.data : generateBusinesses(30);
  const ads = adRes?.data?.length ? adRes.data : generateAdverts();
  const media = mediaRes?.data?.length ? mediaRes.data : generateMediaServices(30);

  const items: IndexItem[] = [
    ...biz.map((b: any): IndexItem => ({
      type: 'businesses',
      label: b.name,
      sub: [b.category, ...(b.secondary_categories ?? []), b.location].filter(Boolean).join(' · '),
      href: b.username ? `/${b.username}` : `/businesses/${b.id}`,
      category: b.category,
      location: b.location,
      secondaryCategories: b.secondary_categories ?? [],
    })),
    ...ads.map((a: any): IndexItem => ({
      type: 'adverts',
      label: a.title,
      sub: [a.category, a.location].filter(Boolean).join(' · '),
      href: `/adverts/${a.id}`,
      category: a.category,
      location: a.location,
    })),
    ...media.map((m: any): IndexItem => ({
      type: 'media',
      label: m.title,
      sub: m.service_type,
      href: `/media/${m.id}`,
      category: m.service_type,
    })),
  ];

  const collect = (type: SearchType, extra: string[] = []) =>
    [...new Set([...extra, ...items.filter(i => i.type === type).map(i => i.category).filter(Boolean) as string[]])];

  return {
    items,
    categories: {
      businesses: collect('businesses', BUSINESS_CATEGORIES),
      adverts: collect('adverts', ADVERT_CATEGORIES),
      media: collect('media'),
    },
    locations: [...new Set(items.map(i => i.location).filter(Boolean) as string[])],
  };
}

function getIndex(): Promise<SearchIndex> {
  if (!indexPromise) indexPromise = buildIndex();
  return indexPromise;
}

function Highlight({ label, query }: { label: string; query: string }) {
  const parts = splitMatch(label, query);
  if (!parts) return <>{label}</>;
  return (
    <>
      {parts[0]}
      <span className="font-semibold text-gray-900 dark:text-white">{parts[1]}</span>
      {parts[2]}
    </>
  );
}

type Row =
  | { kind: 'entity'; item: IndexItem }
  | { kind: 'category'; label: string }
  | { kind: 'location'; label: string };

interface GlobalSearchInputProps {
  searchType: SearchType;
  value: string;
  onChange: (value: string) => void;
  /** Category suggestion clicked — run the search with this term */
  onPickCategory: (category: string) => void;
  /** Location suggestion clicked — fill the location filter */
  onPickLocation: (location: string) => void;
  placeholder: string;
}

export default function GlobalSearchInput({
  searchType, value, onChange, onPickCategory, onPickLocation, placeholder,
}: GlobalSearchInputProps) {
  const navigate = useNavigate();
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const loadStarted = useRef(false);

  const ensureIndex = () => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    getIndex().then(setIndex).catch(err => console.warn('Search index failed to load:', err));
  };

  const rows = useMemo<Row[]>(() => {
    if (!index || !value.trim()) return [];

    const entities: Row[] = rankMatches(
      index.items.filter(i => i.type === searchType),
      value,
      (i) => [i.label, i.category, i.location, ...(i.secondaryCategories ?? [])],
      5
    ).map(item => ({ kind: 'entity', item }));

    const categories: Row[] = rankMatches(
      index.categories[searchType],
      value,
      (c) => [c],
      3
    ).map(label => ({ kind: 'category', label }));

    // Media services aren't location-bound; skip place suggestions there
    const locations: Row[] = searchType === 'media' ? [] : rankMatches(
      [...index.locations, ...AFRICAN_PLACES.map(placeLabel)],
      value,
      (l) => [l],
      2
    ).map(label => ({ kind: 'location', label }));

    return [...entities, ...categories, ...locations].slice(0, 9);
  }, [index, value, searchType]);

  const pick = (row: Row) => {
    setOpen(false);
    setActive(-1);
    if (row.kind === 'entity') {
      navigate(row.item.href);
    } else if (row.kind === 'category') {
      onPickCategory(row.label);
    } else {
      onPickLocation(row.label);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => (a + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => (a <= 0 ? rows.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(rows[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const EntityIcon = TYPE_ICONS[searchType];

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open && rows.length > 0}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); ensureIndex(); }}
        onFocus={() => { setOpen(true); ensureIndex(); }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-gray-50 dark:bg-gray-900"
      />

      {open && rows.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          {rows.map((row, i) => {
            const key = row.kind === 'entity' ? `e-${row.item.href}` : `${row.kind}-${row.label}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  onClick={() => pick(row)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition ${
                    i === active ? 'bg-gray-100 dark:bg-gray-700' : ''
                  }`}
                >
                  {row.kind === 'entity' ? (
                    <>
                      <EntityIcon size={15} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-gray-800 dark:text-gray-200 truncate">
                          <Highlight label={row.item.label} query={value} />
                        </span>
                        {row.item.sub && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{row.item.sub}</span>
                        )}
                      </span>
                      <ArrowUpRight size={14} className="ml-auto text-gray-400 flex-shrink-0" />
                    </>
                  ) : row.kind === 'category' ? (
                    <>
                      <Tag size={15} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        <Highlight label={row.label} query={value} />
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">Category</span>
                    </>
                  ) : (
                    <>
                      <MapPin size={15} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        <Highlight label={row.label} query={value} />
                      </span>
                      <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">Location</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
