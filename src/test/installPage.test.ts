import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Guards on what the install page is allowed to claim.
 *
 * This is the page most likely to drift into app-store theatre: a Play badge,
 * a star rating, a download count. None of those exist, and a visitor who
 * believes they downloaded a store app and then cannot find it in their
 * purchases has been misled by the page that told them so.
 */

const page = readFileSync('src/pages/Install.tsx', 'utf8');
const button = readFileSync('src/components/InstallApp.tsx', 'utf8');

/* Prose lives in JSX; comments explain the rules and would match them. */
const code = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('it does not pretend to be an app store', () => {
  it('shows no store badge or store download link', () => {
    const text = code(page) + code(button);
    expect(text).not.toMatch(/play\.google\.com|apps\.apple\.com|itunes\.apple/i);
    expect(text).not.toMatch(/google-play-badge|app-store-badge/i);
  });

  it('invents no rating, review count or download number', () => {
    const text = code(page) + code(button);
    expect(text).not.toMatch(/\d(\.\d)?\s*(stars?|\/\s*5)\b/i);
    expect(text).not.toMatch(/\b\d[\d,.]*\s*(k|m|million|thousand)?\s*(downloads|installs|users|reviews)\b/i);
  });

  /*
   * The single most important sentence on the page: it answers the question
   * before somebody forms the wrong belief, and says "no" without hedging.
   */
  it('says plainly that this is not a store download', () => {
    expect(page).toMatch(/Play Store or App Store/);
    expect(page).toMatch(/not a store\s*\n?\s*download|is not a store download/);
  });

  it('offers the website as a perfectly good alternative', () => {
    expect(page).toMatch(/carry on using the website/i);
  });
});

describe('it tells the truth about offline', () => {
  /*
   * The service worker caches static build output only, so nothing that
   * needs the network works without it. Promising otherwise is a promise
   * broken on the first tap.
   */
  it('says offline does not work, rather than implying it might', () => {
    expect(page).toMatch(/Does it work offline/i);
    const answer = page.slice(page.indexOf('Does it work offline'));
    expect(answer.slice(0, 400)).toMatch(/\bNo\b/);
  });
});

describe('it does not rely on guessing the device', () => {
  /*
   * Detection is good and not certain — an iPad reports a Mac, an in-app
   * browser reports a browser it is not — and reading on a laptop about
   * installing on a phone is an ordinary thing to be doing.
   */
  it('lists every platform, not only the detected one', () => {
    for (const label of ['Android', 'iPhone & iPad', 'Computer']) {
      expect(page, label).toContain(label);
    }
  });
});
