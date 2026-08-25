import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Tells assistive technology that the page changed.
//
// A full page load announces itself: the browser resets focus and reads the new
// title. A single-page app does neither. Every route change here swapped the
// entire screen while a screen reader said nothing and keyboard focus stayed
// wherever the last click left it — usually on a link that no longer exists.
// Someone navigating by keyboard would tab from the middle of a page they had
// already left.
//
// This is the standard fix, and it has two halves that are easy to confuse:
//
//   * The live region announces the new page by name.
//   * Focus moves to <main>, so the next Tab starts at the top of the new
//     content rather than in the previous page's remains.
//
// Both are needed. Announcing without moving focus tells someone the page
// changed and then strands them; moving focus without announcing silently
// teleports them.


export default function RouteAnnouncer() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');

  // The previous pathname, not a boolean "have we navigated yet". StrictMode
  // invokes effects twice in development, which flips a boolean guard on the
  // discarded run and lets the real one announce over the browser's own
  // page-load announcement. Comparing paths is idempotent however often it runs.
  const prevPath = useRef(pathname);

  // The heading we last saw. Kept across renders because the effect cannot
  // read it at navigation time: React commits the new page BEFORE running
  // effects, so by then <main> may already hold the new heading — comparing
  // against a reading taken here would compare the new page with itself.
  const lastHeading = useRef('');

  useEffect(() => {
    // innerText, not textContent: a headline split by <br> concatenates to
    // "The Operating System forBusiness Growth in Africa" without it.
    const readHeading = () => {
      const h1 = document.querySelector<HTMLElement>('main h1');
      return (h1?.innerText || h1?.textContent || '').replace(/\s+/g, ' ').trim();
    };

    let timer = 0;
    const deadline = Date.now() + 3000;

    // First run. The browser announces the initial page itself, so say
    // nothing — just record what is on screen so the first navigation has
    // something to compare against. Routes are code-split, so the heading may
    // not have painted yet; wait for it rather than seeding an empty string.
    if (prevPath.current === pathname) {
      const seed = () => {
        const h = readHeading();
        if (h) lastHeading.current = h;
        else if (Date.now() < deadline) timer = window.setTimeout(seed, 60);
      };
      seed();
      return () => window.clearTimeout(timer);
    }

    prevPath.current = pathname;

    // Announce only once the heading is genuinely the new page's. A cached
    // route swaps synchronously and passes on the first try; a route still
    // being fetched leaves the OLD heading in place, and announcing that would
    // read out the page somebody just left — worse than saying nothing.
    const announce = () => {
      const heading = readHeading();
      const settled = heading !== '' && heading !== lastHeading.current;

      if (!settled && Date.now() < deadline) {
        timer = window.setTimeout(announce, 60);
        return;
      }

      // Past the deadline the route either renders no <h1> or reuses the
      // previous one. document.title is set by applySeo by now and is the
      // honest fallback.
      const title = document.title.split('—')[0].trim();
      if (settled) lastHeading.current = heading;
      setMessage(`${(settled ? heading : title) || 'Page'} — page loaded`);

      const main = document.getElementById('main-content');
      if (main) {
        // preventScroll because the router already restores scroll position;
        // without it the page jumps twice on every navigation.
        main.focus({ preventScroll: true });
      }
    };

    announce();
    return () => window.clearTimeout(timer);
  }, [pathname]);


  return (
    <div
      // polite, not assertive: a page change should wait for whatever the
      // person is currently hearing to finish rather than cutting across it.
      aria-live="polite"
      aria-atomic="true"
      // Visually hidden but still rendered — display:none or visibility:hidden
      // would remove it from the accessibility tree and silence it entirely.
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {message}
    </div>
  );
}
