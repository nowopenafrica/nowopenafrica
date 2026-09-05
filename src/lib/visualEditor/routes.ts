/**
 * Where an edited CTA is allowed to point.
 *
 * Deliberately narrower than the router. These are the public destinations a
 * marketing CTA could sensibly have; `/admin`, `/dashboard`, `/profile` and the
 * password-reset flow are real routes but are not marketing destinations, and
 * offering them in a dropdown invites a link that only makes sense for one
 * signed-in person.
 *
 * Guarded by a test that reads App.tsx, because a route removed in a refactor
 * would otherwise leave a live CTA pointing at a 404 — and on this platform a
 * single-segment 404 is worse than a 404: `middleware.ts` would try to resolve
 * it as a business username.
 */
export const LINK_TARGETS: readonly string[] = [
  '/',
  '/about',
  '/adverts',
  '/businesses',
  '/campaign/founding-1000',
  '/contact',
  '/digital-forms',
  '/discover',
  '/forms',
  '/founder',
  '/founding',
  '/keeps',
  '/login',
  '/media',
  '/nearby',
  '/offers',
  '/open-now',
  '/os',
  '/platform',
  '/pricing',
  '/privacy',
  '/register',
  '/security',
  '/studio',
  '/terms',
  '/waitlist',
];
