import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import { INDUSTRIES } from '../data/industrySystems';
import { CATEGORY_FEATURES } from '../data/categoryFeatures';
import {
  DEMO_PROFILES, INDUSTRY_EXAMPLES, countsAsListing, demoPath, exampleBySlug,
  examplePath, orderedExamples, placeholderFor,
} from './industryExamples';

/**
 * The guards on the industry examples.
 *
 * The directory holds two businesses, and the temptation when a grid looks
 * empty is to fill it with plausible ones. That was built once and deleted:
 * thirty seeded profiles a customer could tap, ring, and find nothing behind.
 *
 * These examples are the allowed alternative, and they are only allowed while
 * every one of the following stays true.
 */

const component = readFileSync('src/components/discover/IndustryExamples.tsx', 'utf8');
const directory = readFileSync('src/pages/Businesses.tsx', 'utf8');
const explorer = readFileSync('src/components/home/ListingExplorer.tsx', 'utf8');
const discover = readFileSync('src/pages/Discover.tsx', 'utf8');
const mock = readFileSync('src/components/discover/IndustryPageMock.tsx', 'utf8');
const page = readFileSync('src/pages/IndustryExamplePage.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');

describe('an example is an industry, never a business', () => {
  it('is named after an industry the platform already publishes', () => {
    // This is the load-bearing assertion in the file. A name that is not an
    // industry name is an invented business, and there is no third option.
    const real = new Set(INDUSTRIES.map((i) => i.name));
    for (const ex of INDUSTRY_EXAMPLES) {
      expect(real.has(ex.name), `${ex.name} is not an industry name`).toBe(true);
    }
  });

  it('carries no contact detail of any kind', () => {
    const blob = JSON.stringify(INDUSTRY_EXAMPLES);
    expect(blob).not.toMatch(/\+?234[\s-]?\d{3}/);
    expect(blob).not.toMatch(/\b0[789]\d{9}\b/);
    expect(blob).not.toMatch(/[\w.-]+@[\w.-]+\.\w{2,}/);
    // An address SHAPE, not the bare words: "Food Vendors & Street Food" is a
    // real industry name, and a pattern that rejects it rejects the truth.
    expect(blob).not.toMatch(/\d+[ ,]+\w+ (street|road|avenue|close|crescent|way)\b/i);
    expect(blob).not.toMatch(/\b(no\.?|plot|suite|shop) ?\d+/i);
  });

  it('carries no rating, review, count or opening hour', () => {
    const blob = JSON.stringify(INDUSTRY_EXAMPLES);
    expect(blob).not.toMatch(/★|\b\d(\.\d)? stars?\b|\d+ reviews?\b/i);
    expect(blob).not.toMatch(/\b\d{1,2}(am|pm)\b|\bopen (now|until)\b/i);
    expect(blob).not.toMatch(/\btrusted by\b|\bjoin thousands\b/i);
  });

  it('has no field that could be read as a business identity', () => {
    for (const ex of INDUSTRY_EXAMPLES) {
      const keys = Object.keys(ex);
      for (const forbidden of ['phone', 'address', 'email', 'username', 'rating', 'reviews', 'hours', 'logo']) {
        expect(keys, `${ex.slug}.${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('nothing is written here — it is derived', () => {
  it('shows only modules the product actually ships', () => {
    // If a module is not in CATEGORY_FEATURES it cannot appear in an example,
    // which is what stops an example promising something that does not exist.
    for (const ex of INDUSTRY_EXAMPLES) {
      if (!ex.modules.length) continue;
      expect(ex.category, ex.slug).toBeTruthy();
      expect(CATEGORY_FEATURES[ex.category as string], ex.slug).toEqual(ex.modules);
    }
  });

  it('shows only features the industry itself declares', () => {
    for (const ex of INDUSTRY_EXAMPLES) {
      const declared = new Set(
        (INDUSTRIES.find((i) => i.slug === ex.slug)?.groups ?? []).flatMap((g) => g.features),
      );
      for (const f of ex.highlights) {
        expect(declared.has(f), `${ex.slug}: "${f}" is not in its own config`).toBe(true);
      }
    }
  });

  it('names the category the modules were read from', () => {
    // "Restaurants" powers eleven categories and they do not all run the same
    // tools. Saying which one stops the example implying they do.
    const withModules = INDUSTRY_EXAMPLES.filter((e) => e.modules.length);
    expect(withModules.length).toBeGreaterThan(5);
    for (const ex of withModules) {
      expect(INDUSTRIES.find((i) => i.slug === ex.slug)?.categories, ex.slug)
        .toContain(ex.category as string);
    }
    expect(component).toMatch(/Other categories in this industry run their own/);
  });

  it('covers every industry, and only once each', () => {
    expect(INDUSTRY_EXAMPLES).toHaveLength(INDUSTRIES.length);
    const slugs = INDUSTRY_EXAMPLES.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('keeps a card scannable rather than dumping the whole feature list', () => {
    for (const ex of INDUSTRY_EXAMPLES) {
      expect(ex.highlights.length, ex.slug).toBeLessThanOrEqual(6);
      expect(ex.highlights.length, ex.slug).toBeGreaterThan(0);
    }
  });

  it('leads with the industries that can show a working tool', () => {
    const ordered = orderedExamples();
    const firstWithout = ordered.findIndex((e) => !e.modules.length);
    const lastWith = ordered.map((e) => e.modules.length > 0).lastIndexOf(true);
    if (firstWithout !== -1) expect(firstWithout).toBeGreaterThan(lastWith - 1);
  });

  it('resolves by slug, and returns nothing for one that does not exist', () => {
    expect(exampleBySlug(INDUSTRY_EXAMPLES[0].slug)?.name).toBe(INDUSTRY_EXAMPLES[0].name);
    expect(exampleBySlug('not-an-industry')).toBeUndefined();
  });
});

describe('an example can never be mistaken for a listing', () => {
  it('is never counted as inventory', () => {
    expect(countsAsListing()).toBe(false);
    // The directory must not add examples to anything it counts.
    expect(directory).not.toMatch(/INDUSTRY_EXAMPLES\.length \+|\+ INDUSTRY_EXAMPLES\.length/);
    expect(directory).not.toMatch(/businesses\.length \+ \w*[Ee]xample/);
  });

  it('sits in its own block, never in the listing grid', () => {
    // Interleaving is how "example" becomes "listing" in a reader's head, and
    // it would make the grid contradict the count above it.
    const grid = directory.slice(directory.indexOf('rankedBusinesses.map'));
    expect(grid.slice(0, 400)).not.toContain('IndustryExamples');
    expect(directory).toContain('<IndustryExamples');
  });

  it('says what it is before the reader forms their own idea', () => {
    expect(component).toMatch(/Examples, not listings/);
    expect(component).toMatch(/These are not \{label\}/);
    expect(component).toMatch(/an example of the page, not a business/);
    expect(component).toMatch(/nothing here to call|nobody to contact/);
  });

  it('opens an explanation, not a profile', () => {
    /*
     * No /:username, no claim button, no contact affordance.
     *
     * Comments are stripped first: the header explains at length that there is
     * no claim button, so a naive search for the word finds the explanation
     * rather than a button.
     */
    const code = component
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/to=\{`\/\$\{/);
    expect(code).not.toMatch(/tel:|mailto:|wa\.me/);
    /*
     * No claim ACTION — the word alone is not the problem.
     *
     * The page preview renders "Claimed by the owner" as one of the badges a
     * real page can EARN, drawn dashed and grey because an example has earned
     * none of them. That is worth showing: it is how the trust model works.
     * What must not exist is something to press.
     */
    expect(code).not.toMatch(/(to|href)=["'{][^"'}]*claim/i);
    expect(code).not.toMatch(/claim (this|it|your)/i);
    // Every mention must sit inside a disabled or non-interactive element.
    const lines = code.split(String.fromCharCode(10)).filter((l) => /claim/i.test(l));
    for (const line of lines) {
      expect(line, line.trim()).toMatch(/<span|border-dashed|Claimed by the owner/);
    }
  });

  it('scrolls as a strip that holds every industry', () => {
    // A grid of forty-four is a wall; a grid of six makes the platform look
    // smaller than it is. And the strip must not push the real listings and the
    // call to action apart, which is what a tall grid between them does.
    expect(component).toContain('overflow-x-auto');
    expect(component).toContain('snap-mandatory');
    expect(component).toMatch(/limit = INDUSTRY_EXAMPLES\.length/);
    // Arrows exist and say what they do.
    expect(component).toMatch(/aria-label="Previous industries"/);
    expect(component).toMatch(/aria-label="More industries"/);
    // Spent arrows go away rather than sitting there doing nothing.
    expect(component).toMatch(/disabled=\{edges\.start\}/);
    expect(component).toMatch(/disabled=\{edges\.end\}/);
  });

  it('does not ask for a smooth scroll that snapping will cancel', () => {
    /*
     * Measured on the live page: scrollBy with behavior 'smooth' on a
     * snap-mandatory strip ended back at 0, and so did 'proximity'. The snap
     * animation cancels the scroll animation and wins, so the arrow silently
     * did nothing. Instant it is.
     */
    const code = component
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("behavior: 'auto'");
    expect(code).not.toContain("behavior: 'smooth'");
  });

  it('keeps the cards clickable inside the strip', () => {
    // A carousel of things that only look clickable is the failure mode here.
    expect(component).toMatch(/onClick=\{\(\) => setOpen\(ex\)\}/);
    expect(component).toMatch(/aria-label=\{`See the \$\{ex\.name\} page`\}/);
  });

  it('puts the cards before the send-your-business button', () => {
    const cards = component.indexOf('setOpen(ex)');
    const cta = component.indexOf('Send your business and we build yours');
    expect(cards).toBeGreaterThan(0);
    expect(cta).toBeGreaterThan(cards);
  });

  it('does not dress an example as a business card', () => {
    /*
     * InfiniteSlider is shaped for listings — rating, price, verified, a link
     * to a profile. Reusing it here would make an example look like one.
     *
     * Asserted against the code, because the component's header explains at
     * length WHY it is not reused and a plain search finds the explanation.
     */
    const code = component
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('InfiniteSlider');
    // And none of the fields that make a card read as a real business.
    for (const field of ['rating', 'verified', 'price', 'reach']) {
      // A plain substring: building a RegExp from a template needed a
      // double-escaped dot, and getting that wrong is how the pattern silently
      // stops matching what it was written for.
      expect(code, field).not.toContain(`ex.${field}`);
    }
  });

  it('is drawn as a placeholder rather than as a card', () => {
    // The dashed border does more work than the label: a solid card in that
    // grid reads as a listing whatever the caption says.
    expect(component).toContain('border-dashed');
  });

  it('drives the real action', () => {
    expect(component).toMatch(/to="\/send-business"/);
  });
});

describe('placeholder content', () => {
  it('is obviously placeholder', () => {
    for (const source of ['service', 'product', 'none'] as const) {
      const text = placeholderFor({
        key: 'k', tabLabel: 't', ctaLabel: 'c', itemSource: source,
        showDate: false, showTime: false, showQuantity: false,
      });
      // "Your menu" cannot be mistaken for a menu. "Suya ₦2,500" can.
      expect(text, source).toMatch(/^Your /);
    }
  });
});

describe('it appears where the thin grid actually is', () => {
  it('is on the homepage, not only on /businesses', () => {
    /*
     * The fault this catches: the examples were built and wired into
     * /businesses alone, which is not where anybody meets the problem. The two
     * real listings that make the product look dead are on the HOMEPAGE, so a
     * fix nobody sees is not a fix.
     */
    expect(explorer).toContain('<IndustryExamples');
    expect(discover).toContain('<IndustryExamples');
    expect(directory).toContain('<IndustryExamples');
  });

  it('shows even with no listings yet — the empty grid must not look dead', () => {
    // The examples always render on the homepage explorer, Discover and
    // /businesses. Gate them on listing count and an empty directory is bare
    // again, which is exactly the failure this block exists to prevent.
    expect(explorer).not.toMatch(/length > 0 && \w+\.length < 6/);
    expect(discover).not.toMatch(/length > 0 && \w+\.length < 6/);
    expect(explorer).toMatch(/type === 'businesses' && \(\s*<IndustryExamples/);
    expect(discover).toMatch(/<IndustryExamples/);
    // The live directory grid, on the other hand, stays behind its thin-grid
    // gate so a full directory is not padded with the example layout.
    expect(directory).toMatch(/businesses\.length > 0 && businesses\.length < THIN_DIRECTORY/);
  });

  it('stays on the businesses tab of the homepage explorer', () => {
    // Creative Services answers its own emptiness with the free Create items,
    // and adverts have their own surface.
    expect(explorer).toMatch(/type === 'businesses' &&/);
  });
});

describe('the live preview', () => {
  it('is offered from the panel', () => {
    // The tool list answers "what can it do". It does not answer "what does it
    // look like", which is the question somebody is actually asking.
    // The label now names what you are about to get: a live page where one
    // exists, the layout where it does not.
    expect(component).toMatch(/See a live \{example\.name\.toLowerCase\(\)\} page/);
    expect(component).toMatch(/See the page layout/);
    expect(component).toMatch(/setPreview\(true\)/);
    expect(component).toContain('IndustryPageMock');
  });

  it('is a mock, never the real profile renderer', () => {
    /*
     * The real renderer reads a business row. Feeding it a synthetic one would
     * produce a page indistinguishable from a listing — and put an invented
     * business one screenshot away from looking real.
     */
    expect(component).not.toMatch(/BusinessDetail|BusinessCard|from '\.\.\/business\//);
  });

  it('says it is placeholder before showing anything', () => {
    const preview = mock;
    expect(preview).toMatch(/Placeholder content/);
    expect(preview).toMatch(/Your business name/);
    expect(preview).toMatch(/Your city/);
  });

  it('is inert — a preview whose Book button books is not a preview', () => {
    /*
     * ZERO live controls in the mock itself.
     *
     * Stronger than the version this replaces, which allowed one (a Back
     * button). Extracting the mock so both the popup and the full page render
     * it moved every action out to the caller's footer — so the mock is now
     * incapable of doing anything at all, which is exactly right for something
     * whose whole job is to be looked at.
     */
    const buttons = mock.match(/<button[\s\S]*?>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b, b.slice(0, 60)).toContain('disabled');
  });

  it('shows the module CTAs, which are what makes an industry page differ', () => {
    const preview = mock;
    expect(preview).toMatch(/m\.ctaLabel/);
    expect(preview).toMatch(/m\.tabLabel/);
  });

  it('invents no review, rating, badge or count', () => {
    const preview = mock;
    // The single most damaging thing this preview could do is show a review.
    expect(preview).toMatch(/Reviews appear here once real customers leave them/);
    /*
     * A rating in COPY, not any decimal. The first version of this matched
     * `p-2.5` and `gap-1.5` — Tailwind spacing — and failed on a file that had
     * invented nothing at all.
     */
    expect(preview).not.toMatch(/[★☆]/);
    expect(preview).not.toMatch(/[1-5]\.\d\s*(\/\s*5|stars?|rating|out of)/i);
    expect(preview).not.toMatch(/\b\d+\s*(reviews?|ratings?)\b/i);
    // The badges a page can EARN are shown as empty states, not as earned.
    expect(preview).toMatch(/border-dashed[^"]*text-gray-400/);
  });

  it('carries no contact detail', () => {
    const preview = mock;
    expect(preview).not.toMatch(/tel:|mailto:|wa\.me/);
    expect(preview).not.toMatch(/\b0[789]\d{9}\b/);
  });
});

describe('the example page has a real URL', () => {
  it('is linkable and routed', () => {
    // "See live preview" used to open a panel that closed. What was wanted was
    // a page you can send somebody.
    expect(examplePath('restaurants')).toBe('/example/restaurants');
    expect(app).toContain('path="/example/:slug"');
    expect(app).toContain('path="/example"');
    expect(component).toMatch(/examplePath\(example\.slug\)/);
    expect(component).toMatch(/Open the full page/);
  });

  it('keeps the wireframe out of the real-business namespace', () => {
    /*
     * THE RULE CHANGED HERE, DELIBERATELY, AND THE DISTINCTION IS THE WHOLE
     * POINT.
     *
     * This used to forbid /business/ anywhere in the module. That was right
     * when the only preview was a wireframe: an invented company with a
     * profile URL is exactly the failure being avoided, made worse by the SPA
     * answering 200 for any path — the made-up URL would look like it worked.
     *
     * But `lagos-prime-realty` turned out to be a REAL curated demo profile
     * that /platform has been linking to all along, rendered by the real
     * profile component from an in-memory record. Pointing at that is not
     * inventing anything; it is using what exists.
     *
     * So the split: demoPath may use /business/ because it opens a real
     * rendered profile. examplePath may NOT, because it opens a wireframe.
     */
    expect(examplePath('anything')).toBe('/example/anything');
    expect(examplePath('anything')).not.toContain('/business/');
    expect(demoPath('restaurants')).toContain('/business/');
    // And the wireframe page never hard-codes a profile URL of its own — it
    // only ever links to one demoPath resolved.
    expect(page).not.toMatch(/to="\/business\//);
  });

  it('says what it is before anything else on the page', () => {
    /*
     * Compared inside the FOUND branch only.
     *
     * The first `<h1` in the file belongs to the "no example for that industry"
     * branch, which sits earlier in the source and rendered the original
     * version of this assertion meaningless — it was comparing the banner
     * against a heading on a different screen.
     */
    const found = page.slice(page.indexOf('const Icon = example.icon;'));
    const banner = found.indexOf('This is an example page, not a business');
    const heading = found.indexOf('<h1');
    expect(banner).toBeGreaterThan(-1);
    expect(heading).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(heading);
  });

  it('is never a search result', () => {
    // Somebody searching "restaurant Lekki" must not be handed this: worth a
    // lot inside the product, worth nothing in a results page.
    expect(page).toMatch(/robots: 'noindex, nofollow'/);
    expect(readFileSync('middleware.ts', 'utf8')).toMatch(/'example',/);
  });

  it('renders the same mock as the popup, not a second copy', () => {
    // Two versions of "what the page looks like" would disagree within a
    // month, and the value here is that the preview matches what gets built.
    expect(page).toContain('IndustryPageMock');
    expect(component).toContain('IndustryPageMock');
    expect(mock).toContain('export default function IndustryPageMock');
  });

  it('is not a cul-de-sac', () => {
    expect(page).toMatch(/Other industries/);
    expect(page).toMatch(/to="\/send-business"/);
  });
});

describe('the live demo profile', () => {
  it('points at a curated profile that actually exists', async () => {
    /*
     * The map is written down rather than looked up, because osShowcase imports
     * thirty-three sample-data files and this module is loaded by the HOMEPAGE.
     * So the heavy import happens HERE instead — a test can afford it, and this
     * is what stops the hand-written pairing rotting when a demo is renamed.
     */
    const { OS_SHOWCASE } = await import('../data/osShowcase');
    const usernames = new Set(OS_SHOWCASE.map((c) => c.username));
    for (const [slug, username] of Object.entries(DEMO_PROFILES)) {
      expect(usernames.has(username), `${slug} -> ${username} is not a curated profile`).toBe(true);
    }
  });

  it('pairs each industry with a profile from one of its own categories', async () => {
    // A restaurant example must not open a hotel. This is the assertion that
    // makes the static map trustworthy.
    const { OS_SHOWCASE } = await import('../data/osShowcase');
    const { INDUSTRIES } = await import('../data/industrySystems');
    const catOf = new Map(OS_SHOWCASE.map((c) => [c.username, c.category]));
    for (const [slug, username] of Object.entries(DEMO_PROFILES)) {
      const industry = INDUSTRIES.find((i) => i.slug === slug);
      expect(industry, slug).toBeTruthy();
      expect(industry!.categories, `${slug} -> ${username}`).toContain(catOf.get(username));
    }
  });

  it('resolves to the real profile route, because it IS a real rendered profile', () => {
    expect(demoPath('restaurants')).toMatch(/^\/business\//);
    // And nothing for an industry without one — no invented fallback.
    const without = INDUSTRY_EXAMPLES.find((e) => !e.demo);
    expect(without, 'every industry has a demo — update this test').toBeTruthy();
    expect(demoPath(without!.slug)).toBeNull();
  });

  it('leaves the industries without a demo on the honest wireframe', () => {
    const missing = INDUSTRY_EXAMPLES.filter((e) => !e.demo);
    // Six today. If this hits zero somebody has invented profiles to fill it.
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.length).toBeLessThan(INDUSTRY_EXAMPLES.length / 2);
    expect(component).toMatch(/See the page layout/);
  });

  it('says on the card which industries can show a working page', () => {
    expect(component).toMatch(/ex\.demo/);
    expect(component).toMatch(/Live page/);
  });

  it('offers the live page first and the layout second', () => {
    const live = component.indexOf('See a live ');
    const layout = component.indexOf('Just the layout');
    expect(live).toBeGreaterThan(0);
    expect(layout).toBeGreaterThan(live);
  });
});
