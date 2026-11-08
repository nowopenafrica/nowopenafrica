import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import ScrollToTop from '../components/ScrollToTop';

/*
 * The Create page as a visitor gets it: the real /media page component,
 * not CreateMarketplace on its own (Ruling F) — "Hire a creator" and the
 * services list used to live in Media.tsx, so only rendering Media proves
 * they have left it.
 *
 * Counts are DERIVED from shownNeeds / listedFor, never written down: a
 * parallel task keeps finishing designs, and a tile count pinned here would
 * fail every time a need crossed the bar.
 */

/* The catalogue the page reads; a test may swap in a thinner one. */
const catalogue = vi.hoisted(() => ({ list: null as null | unknown[] }));
vi.mock('../hooks/useDesignCatalogue', async () => {
  const mod = await import('../lib/designTemplates');
  return { useDesignCatalogue: () => ({ templates: catalogue.list ?? mod.DESIGN_TEMPLATES, ready: true }) };
});
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ format: (n: number) => `$${n}` }),
}));
vi.mock('../lib/telemetry', () => ({ track: () => {} }));
vi.mock('../lib/create/services', () => ({
  loadServices: async () => [],
  loadCategories: async () => [],
}));
vi.mock('../lib/supabase', () => {
  const rows: Record<string, unknown[]> = {
    media_services: [{
      id: 's1', title: 'Test Studio Shoot', service_type: 'Photography', description: 'A test listing',
      pricing: 100, rating: null, review_count: 0, created_at: '2026-10-01T00:00:00Z',
    }],
  };
  const chain = (table: string): any => {
    const result = { data: rows[table] ?? [], error: null };
    const c: any = {
      select: () => c, eq: () => c, in: () => c, order: () => c, range: () => c, limit: () => c,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (f?: any, r?: any) => Promise.resolve(result).then(f, r),
    };
    return c;
  };
  return { supabase: { from: (t: string) => chain(t), rpc: async () => ({ data: null, error: null }) } };
});

import Media from '../pages/Media';
import MediaServices from '../pages/MediaServices';
import TemplateGallery from '../components/create/TemplateGallery';
import { carouselPicks } from '../components/create/ProductCarousel';
import { DESIGN_TEMPLATES } from '../lib/designTemplates';
import {
  NEEDS, POPULAR, deliverableSlugFor, isListed, listedFor, listedIn, needFor, shownNeeds,
} from '../lib/create/needs';

beforeAll(() => {
  // jsdom has no scrollIntoView; the gallery scrolls itself into view on a request.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); catalogue.list = null; });

/* The address as the router holds it, and a Back button, for the URL tests. */
function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div data-testid="location" data-search={location.search} data-path={location.pathname}>
      <button type="button" onClick={() => navigate(-1)}>Go back</button>
    </div>
  );
}
const search = () => new URLSearchParams(screen.getByTestId('location').getAttribute('data-search') ?? '');

const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <LocationProbe />
    <Routes>
      <Route path="/media" element={<Media />} />
      <Route path="/media/services" element={<MediaServices />} />
    </Routes>
  </MemoryRouter>,
);

const sections = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-create-section]')].map((el) => el.getAttribute('data-create-section'));

const tiles = () => screen.getAllByTestId('need-tile');
const popularChips = () => screen.queryAllByTestId('popular-chip');
const SHOWN = shownNeeds(DESIGN_TEMPLATES);
const POPULAR_SHOWN = POPULAR.filter((p) => listedFor(p.deliverable, DESIGN_TEMPLATES).length > 0);

/** min-h-[Npx] in explicit px — rem undersizes on this app's root font. */
const minHeightPx = (el: HTMLElement) => Number(el.className.match(/min-h-\[(\d+)px\]/)?.[1] ?? 0);

describe('the Create page, top to bottom', () => {
  it('renders spec §4 in order, and the need view only once something is chosen', () => {
    /*
     * Task 15 added the featured collections (spec §10) below the need view.
     * "browse" is absent: no product spans four directions yet, so Browse by
     * category is not rendered (CategoryBrowse.test.tsx covers it once one does).
     */
    const { container } = at('/media');
    expect(sections(container)).toEqual(['request', 'products', 'popular', 'collections', 'footer']);
    fireEvent.click(tiles()[0]);
    expect(sections(container)).toEqual(['request', 'products', 'popular', 'need', 'collections', 'footer']);
  });

  it('carries none of the sections that moved to /media/services', () => {
    const { container } = at('/media');
    const text = container.textContent ?? '';
    for (const gone of ['Hire a creator', 'Browse by discipline', 'Business packs', 'Create credits']) {
      expect(text, gone).not.toContain(gone);
    }
    // The facts strip is removed, not moved.
    expect(text).not.toContain('Nothing is charged upfront.');
  });

  it('shows one tile per need that passes the bar, and no other', () => {
    at('/media');
    expect(tiles().map((t) => t.getAttribute('data-need'))).toEqual(SHOWN.map((n) => n.slug));
  });

  it('drops a tile whose need falls below the bar, and a chip whose item has nothing', () => {
    /*
     * Every need may pass the bar on the real catalogue, which would let the
     * test above pass for a page that ignored the bar. So thin one out: keep
     * one finished menu and no invitations.
     */
    const menus = listedIn('menus', DESIGN_TEMPLATES);
    const invitations = new Set(listedFor('invitation', DESIGN_TEMPLATES).map((t) => t.key));
    const thin = DESIGN_TEMPLATES.filter((t) =>
      !invitations.has(t.key) && (needFor(t) !== 'menus' || t.key === menus[0].key));
    catalogue.list = thin;
    at('/media');
    const tileNeeds = tiles().map((t) => t.getAttribute('data-need'));
    expect(tileNeeds).toEqual(shownNeeds(thin).map((n) => n.slug));
    expect(tileNeeds).not.toContain('menus');
    const labels = popularChips().map((c) => c.textContent?.trim());
    expect(labels).not.toContain('Invitation');
    expect(labels).toEqual(POPULAR.filter((p) => listedFor(p.deliverable, thin).length > 0).map((p) => p.label));
  });

  it('shows a popular chip only for a deliverable with a finished design', () => {
    at('/media');
    expect(popularChips().map((c) => c.textContent?.trim())).toEqual(POPULAR_SHOWN.map((p) => p.label));
  });

  it('gives every tile and popular chip a 44px touch target in explicit px', () => {
    at('/media');
    for (const el of [...tiles(), ...popularChips()]) {
      expect(minHeightPx(el), el.textContent ?? '').toBeGreaterThanOrEqual(44);
    }
  });

  it('opens the business-card options and the lane from Popular now', () => {
    const { container } = at('/media');
    const chip = popularChips().find((c) => c.textContent?.trim() === 'Business card');
    expect(chip, 'Business card has finished designs, so its chip is shown').toBeTruthy();
    fireEvent.click(chip!);

    const view = container.querySelector('[data-create-section="need"]') as HTMLElement;
    expect(view.getAttribute('data-need')).toBe('stationery');

    const cards = within(view).getAllByRole('button', { name: /^Edit / });
    const allowed = new Set(listedFor('business-card', DESIGN_TEMPLATES).map((t) => `Edit ${t.label}`));
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(allowed.has(card.getAttribute('aria-label') ?? ''), card.getAttribute('aria-label') ?? '').toBe(true);

    expect(within(view).getByRole('link', { name: /Have it made for you/ })).toHaveAttribute('href', '/media/services#made-for-you');
    expect(within(view).getByRole('button', { name: /Order prints/ })).toBeInTheDocument();
  });
});

describe('old links land on a need', () => {
  it.each([
    ['packaging', 'brand'],
    ['menus', 'menus'],
    ['branding', 'brand'],
    ['flyers', 'flyers'],
  ])('/media?category=%s opens %s', (legacy, need) => {
    const { container } = at(`/media?category=${legacy}`);
    const view = container.querySelector('[data-create-section="need"]');
    expect(view?.getAttribute('data-need')).toBe(need);
    expect(within(view as HTMLElement).getByRole('heading', { level: 2 }).textContent)
      .toBe(NEEDS.find((n) => n.slug === need)!.title);
  });

  it.each(['video', 'photography'])('/media?category=%s opens the services lane, not an empty need', (legacy) => {
    const { container } = at(`/media?category=${legacy}`);
    expect(container.querySelector('[data-create-section="need"]')).toBeNull();
    const lane = container.querySelector('[data-create-section="services-lane"]') as HTMLElement;
    expect(lane).not.toBeNull();
    expect(within(lane).getByRole('link', { name: /Hire a creator/ })).toHaveAttribute('href', '/media/services');
  });
});

describe('the request bar answers with a need', () => {
  const ask = (words: string) => {
    fireEvent.change(screen.getByLabelText(/Describe what you need/), { target: { value: words } });
    fireEvent.click(screen.getByRole('button', { name: 'Read my idea' }));
  };

  it('opens the need view, not a text panel, when the words resolve', () => {
    const { container } = at('/media');
    ask('I need a business card for my salon');
    expect(container.querySelector('[data-create-section="need"]')?.getAttribute('data-need')).toBe('stationery');
    expect(screen.queryByRole('button', { name: /Open it in the editor/ })).toBeNull();
  });

  it('says so plainly when nothing matches, and offers the made-for-you lane', () => {
    const { container } = at('/media');
    ask('a 20 second promotional video');
    expect(container.querySelector('[data-create-section="need"]')).toBeNull();
    const answer = screen.getByTestId('intent-no-match');
    expect(within(answer).getByRole('link', { name: /Have it made for you/ })).toHaveAttribute('href', '/media/services#made-for-you');
  });
});

describe('the footer strip', () => {
  it('links to order tracking and to every service', () => {
    const { container } = at('/media');
    const footer = container.querySelector('[data-create-section="footer"]') as HTMLElement;
    expect(within(footer).getByRole('link', { name: /Track an order/ })).toHaveAttribute('href', '/order');
    expect(within(footer).getByRole('link', { name: /All services/ })).toHaveAttribute('href', '/media/services');
  });
});

describe('inside the need view, the gallery is embedded', () => {
  it('shows only the need view\'s chips, not the gallery\'s own need and item rows', () => {
    const { container } = at('/media');
    fireEvent.click(popularChips().find((c) => c.textContent?.trim() === 'Business card')!);
    const view = container.querySelector('[data-create-section="need"]') as HTMLElement;
    expect(within(view).queryByText('I need')).toBeNull();
    // One "Business card" chip (NeedView's), not a second one from the gallery.
    expect(within(view).getAllByRole('button', { name: /^Business card\b/ })).toHaveLength(1);
    expect(within(view).queryByRole('button', { name: /^Everything\b/ })).toBeNull();
  });

  it('shows no count heading inside the need view', () => {
    const { container } = at('/media');
    fireEvent.click(popularChips().find((c) => c.textContent?.trim() === 'Business card')!);
    const view = container.querySelector('[data-create-section="need"]') as HTMLElement;
    expect(within(view).queryByTestId('gallery-count')).toBeNull();
    expect(view.textContent).not.toMatch(/designs, made from your brand/);
    expect(view.textContent).not.toMatch(/layouts ×/);
  });

  it('counts the designs on offer when standalone, never layouts × styles', () => {
    render(<MemoryRouter><TemplateGallery /></MemoryRouter>);
    const listed = DESIGN_TEMPLATES.filter(isListed).length;
    expect(screen.getByTestId('gallery-count').textContent)
      .toBe(`${listed.toLocaleString('en-NG')} designs, made from your brand`);
    expect(document.body.textContent).not.toMatch(/layouts ×/);
  });
});

describe('the products carousel', () => {
  const LISTED = DESIGN_TEMPLATES.filter(isListed);
  const expected = carouselPicks(LISTED);
  const region = () => screen.getByRole('region', { name: 'Creative products' });

  it('picks 10 to 12 real, listed designs, one per thing, popular first', () => {
    expect(expected.length).toBeGreaterThanOrEqual(Math.min(10, LISTED.length));
    expect(expected.length).toBeLessThanOrEqual(12);
    for (const p of expected) expect(isListed(p.template), p.template.key).toBe(true);
    const things = expected.map((p) => deliverableSlugFor(p.template));
    expect(new Set(things).size).toBe(things.length);
    const popularWithDesigns = POPULAR.filter((x) => listedFor(x.deliverable, LISTED).length > 0).map((x) => x.deliverable);
    expect(things.slice(0, popularWithDesigns.length)).toEqual(popularWithDesigns);
  });

  it('renders those cards once for real, and once more hidden for the loop', () => {
    at('/media');
    const real = within(region()).getByTestId('products-list');
    const cards = [...real.querySelectorAll('[data-template]')];
    expect(cards.map((c) => c.getAttribute('data-template'))).toEqual(expected.map((p) => p.template.key));
    const listedKeys = new Set(LISTED.map((t) => t.key));
    for (const c of cards) expect(listedKeys.has(c.getAttribute('data-template') ?? '')).toBe(true);
    expect(real.tagName).toBe('UL');
    expect(real.querySelectorAll(':scope > li')).toHaveLength(expected.length);

    const clone = within(region()).getByTestId('products-clone');
    expect(clone).toHaveAttribute('aria-hidden', 'true');
    const cloneCards = [...clone.querySelectorAll('[data-template]')];
    expect(cloneCards).toHaveLength(expected.length);
    for (const c of cloneCards) expect(c).toHaveAttribute('tabindex', '-1');
  });

  it('has a pause button that stops the loop and starts it again', () => {
    at('/media');
    const track = within(region()).getByTestId('products-track');
    const button = within(region()).getByRole('button', { name: 'Pause products' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.className).toMatch(/h-\[44px\]/);
    expect(button.className).toMatch(/w-\[44px\]/);
    expect(track.className).not.toMatch(/is-paused/);

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveAccessibleName('Play products');
    expect(track.className).toMatch(/is-paused/);
    expect(track.style.animationPlayState).toBe('paused');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(track.className).not.toMatch(/is-paused/);
  });

  it('pauses while the tab is hidden', () => {
    at('/media');
    const track = within(region()).getByTestId('products-track');
    const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try {
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(track.className).toMatch(/is-paused/);
    } finally {
      delete (document as unknown as Record<string, unknown>).hidden;
      if (hidden) Object.defineProperty(Document.prototype, 'hidden', hidden);
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    }
    expect(track.className).not.toMatch(/is-paused/);
  });

  it('clips the strip, with room inside the clip for a card\'s hover lift', () => {
    at('/media');
    expect(region().className).toMatch(/overflow-hidden/);
    const viewport = within(region()).getByTestId('products-viewport');
    expect(viewport.className).toMatch(/overflow-hidden/);
    expect(viewport.className).toMatch(/\bpy-3\b/);
    // A gutter for the pause button, so it never covers a caption (M11).
    expect(viewport.className).toMatch(/mr-\[52px\]/);
  });

  it('does not move under reduced motion: one scrollable copy, no clone', () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('prefers-reduced-motion'), media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      at('/media');
      expect(within(region()).queryByTestId('products-clone')).toBeNull();
      const list = within(region()).getByTestId('products-list');
      expect(list.className).toMatch(/overflow-x-auto/);
      expect(list.className).toMatch(/snap-x/);
      expect(list.querySelectorAll('[data-template]')).toHaveLength(expected.length);
      expect(region().querySelector('.nowopen-products-track')).toBeNull();
      // Nothing moves, so there is nothing to pause.
      expect(within(region()).queryByRole('button', { name: /products$/ })).toBeNull();
      // At the start of the strip the first card is not faded on the left.
      const viewport = within(region()).getByTestId('products-viewport');
      // (jsdom drops mask-image, so the fade is read from data-fade.)
      expect(viewport).toHaveAttribute('data-fade', 'right');
      Object.defineProperty(list, 'scrollLeft', { configurable: true, value: 120 });
      fireEvent.scroll(list);
      expect(viewport).toHaveAttribute('data-fade', 'both');
    } finally {
      window.matchMedia = original;
    }
  });
});

const needView = (root: HTMLElement) => root.querySelector('[data-create-section="need"]') as HTMLElement | null;
const tile = (slug: string) => tiles().find((t) => t.getAttribute('data-need') === slug)!;

describe('opening a need', () => {
  it('scrolls the need view itself into view, title and chips first (I1)', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    try {
      const { container } = at('/media');
      fireEvent.click(tiles()[0]);
      await waitFor(() => expect(spy.mock.contexts).toContain(needView(container)));
      expect(needView(container)?.id).toBe('create-need');
      // Not the gallery further down, which left the title and chips above the fold.
      expect(spy.mock.contexts).not.toContain(container.querySelector('#create-designs'));
    } finally {
      spy.mockRestore();
    }
  });

  it('moves focus to the need heading, and closing hands it back to the tile (M5)', async () => {
    const { container } = at('/media');
    const opener = tile(SHOWN[0].slug);
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(document.activeElement?.id).toBe('need-view-title'));
    fireEvent.click(within(needView(container)!).getByRole('button', { name: 'Close' }));
    expect(needView(container)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(tile(SHOWN[0].slug)));
  });

  it('starts a new need with a clean search (I2)', () => {
    const { container } = at('/media');
    const [first, second] = SHOWN;
    fireEvent.click(tile(first.slug));
    const box = within(needView(container)!).getByLabelText('Search designs') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'zzzz nothing matches this' } });
    expect(box.value).toBe('zzzz nothing matches this');
    fireEvent.click(tile(second.slug));
    expect(needView(container)?.getAttribute('data-need')).toBe(second.slug);
    expect((within(needView(container)!).getByLabelText('Search designs') as HTMLInputElement).value).toBe('');
  });

  it('never holds a thing with no designs: falls back to the need and says so (I4)', () => {
    // Precondition, from the data: packaging has nothing finished yet.
    expect(listedFor('packaging', DESIGN_TEMPLATES)).toHaveLength(0);
    const { container } = at('/media');
    fireEvent.change(screen.getByLabelText(/Describe what you need/), { target: { value: 'packaging for my soap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read my idea' }));
    const view = needView(container)!;
    expect(view.getAttribute('data-need')).toBe('brand');
    const note = within(view).getByTestId('need-missing');
    expect(note.textContent).toBe('No packaging designs yet — here is everything in Brand & packaging. Or have it made for you.');
    expect(within(note).getByRole('link', { name: 'have it made for you' })).toHaveAttribute('href', '/media/services#made-for-you');
    // The chips agree with the grid: "All" is pressed, and the address holds no item.
    const chips = view.querySelector('[aria-label="Things in Brand & packaging"]') as HTMLElement;
    expect(within(chips).getByRole('button', { name: /^All\b/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chips).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(search().get('item')).toBeNull();
  });

  it('offers only the things in the need that have a finished design', () => {
    const { container } = at('/media');
    fireEvent.click(tile('stationery'));
    expect(listedFor('compliment-slip', DESIGN_TEMPLATES)).toHaveLength(0);
    expect(within(needView(container)!).queryByRole('button', { name: /^Compliment slip/ })).toBeNull();
  });
});

describe('the open need lives in the address (M10)', () => {
  it('writes ?need= on opening, &item= on a chip, and Back undoes the opening', () => {
    const { container } = at('/media');
    fireEvent.click(tile('stationery'));
    expect(search().get('need')).toBe('stationery');
    fireEvent.click(within(needView(container)!).getByRole('button', { name: /^Business card\b/ }));
    expect(search().get('item')).toBe('business-card');
    // The chip replaced the entry rather than pushing one, so one Back closes the need.
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(search().get('need')).toBeNull();
    expect(needView(container)).toBeNull();
  });

  it('opens the need (and thing) a ?need= address names', () => {
    const { container } = at('/media?need=stationery&item=business-card');
    const view = needView(container)!;
    expect(view.getAttribute('data-need')).toBe('stationery');
    expect(within(view).getByRole('button', { name: /^Business card\b/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a ?need= that is not a need', () => {
    const { container } = at('/media?need=spaceships');
    expect(needView(container)).toBeNull();
  });
});

describe('shared design links still open on /media (I3)', () => {
  beforeAll(() => {
    // The customiser draws nothing until it has a measured stage.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });
  });

  it('opens the template\'s need and the customiser on it', async () => {
    const t = DESIGN_TEMPLATES.find((x) => x.key === 'swiss-event-poster')!;
    expect(isListed(t)).toBe(true);
    const { container } = at(`/media?template=${t.key}&look=777`);
    expect(needView(container)?.getAttribute('data-need')).toBe(needFor(t));
    expect(await screen.findByRole('dialog', { name: /Edit/ })).toBeInTheDocument();
  });

  it('ignores an unknown or unlisted template quietly', () => {
    const lookless = DESIGN_TEMPLATES.find((x) => !isListed(x))!;
    for (const key of ['no-such-template', lookless.key]) {
      const { container } = at(`/media?template=${key}&look=777`);
      expect(needView(container)).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      cleanup();
    }
  });
});

describe('creator links point at /media/services (I5)', () => {
  it('repoints the detail page, search and the explorer', () => {
    const detail = readFileSync('src/pages/MediaDetail.tsx', 'utf8');
    expect(detail).not.toMatch(/to="\/media"/);
    expect(detail.match(/to="\/media\/services"/g)).toHaveLength(3);
    expect(readFileSync('src/lib/universalSearch.ts', 'utf8'))
      .toMatch(/label: 'Media & creators', href: '\/media\/services'/);
    const explorer = readFileSync('src/components/home/ListingExplorer.tsx', 'utf8');
    expect(explorer).toMatch(/label: 'Creative Services', viewAll: '\/media\/services'/);
  });

  it('lists /media/services for crawlers', () => {
    expect(readFileSync('api/sitemap.xml.ts', 'utf8')).toMatch(/loc: '\/media\/services'/);
  });
});

describe('ScrollToTop respects a #hash (I6)', () => {
  it('scrolls to the named element, and to the top when there is no hash', async () => {
    const into = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
    const top = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      render(
        <MemoryRouter initialEntries={['/media/services#made-for-you']}>
          <ScrollToTop />
          <section id="made-for-you" />
        </MemoryRouter>,
      );
      await waitFor(() => expect(into.mock.contexts).toContain(document.getElementById('made-for-you')));
      expect(top).not.toHaveBeenCalled();
      cleanup();
      render(<MemoryRouter initialEntries={['/media/services']}><ScrollToTop /></MemoryRouter>);
      expect(top).toHaveBeenCalledWith(0, 0);
    } finally {
      into.mockRestore();
      top.mockRestore();
    }
  });

  it('the services page carries the target', async () => {
    const { container } = at('/media/services');
    await screen.findByText('Test Studio Shoot');
    expect(container.querySelector('#made-for-you')).not.toBeNull();
  });
});

describe('/media/services', () => {
  it('holds Hire a creator and the services list', async () => {
    at('/media/services');
    expect(screen.getByRole('heading', { name: 'Hire a creator' })).toBeInTheDocument();
    expect(await screen.findByText('Test Studio Shoot')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Test Studio Shoot/ })).toHaveAttribute('href', '/media/s1');
  });

  it('holds the made-for-you catalogue, business packs and credits', async () => {
    const { container } = at('/media/services');
    await screen.findByText('Test Studio Shoot');
    expect(container.querySelector('#made-for-you')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Business packs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create credits' })).toBeInTheDocument();
  });
});
