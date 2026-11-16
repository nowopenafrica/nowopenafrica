// 2026 trend module: dated, reviewable, and switched off until approved.
//
// A trend is a note about what is current, not a rule of design. It ages, so
// every entry carries the date it was written and the date by which somebody
// must look again; a test fails once that date passes.
//
// HONESTY: these are editorial observations by the build team, not measured
// facts. None cites a statistic, because we have none we can source. Every
// entry starts `proposed`: the concept engine ignores it and customers never
// see it until the founder marks it `approved`.

import type { Trend } from './types';

const ADDED = '2026-11-15';
const REVIEW = '2027-02-15';
const BASIS = 'Editorial observation by the build team from published brand and campaign work; not a measured statistic.';

export const TRENDS: Trend[] = [
  { key: 'tactile-print-texture', name: 'Tactile texture on screen', summary: 'Grain, paper fibre and ink spread added to digital work so it feels printed and made.',
    movements: ['analog-experimental', 'heritage-craft', 'retro-futurism', 'african-modernism'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Texture over a weak layout is still a weak layout. Never on small text.' },
  { key: 'oversized-serif-headlines', name: 'Oversized serif headlines', summary: 'High-contrast serifs set very large, replacing the neutral sans as the default premium voice.',
    movements: ['editorial', 'luxury-minimalism', 'monochrome-photographic'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Needs a true display serif; we ship two. Hairlines fail at small sizes and on billboards.' },
  { key: 'local-specificity', name: 'Named places and local detail', summary: 'Work that names its street, cloth, dish or dialect rather than a generic regional look.',
    movements: ['afro-contemporary', 'african-modernism', 'heritage-craft'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Only with real ties and permission. Never borrow another community\'s symbols.' },
  { key: 'honest-photography', name: 'Unretouched, direct-light photography', summary: 'Flash, daylight and visible skin texture in place of airbrushed studio polish.',
    movements: ['afro-contemporary', 'editorial', 'organic-natural', 'monochrome-photographic'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Still needs consent, good framing and correct exposure for darker skin tones.' },
  { key: 'rendered-product-worlds', name: 'Rendered product worlds', summary: 'Products staged in impossible lit scenes, at monumental or miniature scale.',
    movements: ['cgi-3d', 'gradient-futurism', 'retro-futurism'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Must be labelled when it is not a photograph of the product sold. Depends on decision D1.' },
  { key: 'visible-grid-systems', name: 'Visible grids and system marks', summary: 'Registration marks, column lines and data labels shown as part of the design.',
    movements: ['swiss-international', 'retro-futurism', 'information-design', 'neo-brutalism'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Labels must be true. No invented coordinates, codes or specifications.' },
  { key: 'type-in-motion', name: 'Type built to move', summary: 'Headlines designed first for short video, with the still as a frame from the loop.',
    movements: ['kinetic-typography', 'typographic-monumentalism', 'neo-brutalism'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Create exports stills today. Motion belongs to a later phase.' },
  { key: 'saturated-colour-blocking', name: 'Saturated colour blocking', summary: 'Two or three flat, strong colours meeting on hard edges, without gradients.',
    movements: ['bauhaus', 'contemporary-maximalism', 'memphis', 'typographic-monumentalism'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Check contrast in every pairing; equal-value colours vibrate.' },
  { key: 'quiet-luxury-restraint', name: 'Quiet restraint in premium work', summary: 'Smaller marks, fewer words and material cues in place of logos and gold.',
    movements: ['luxury-minimalism', 'japanese-minimalism', 'heritage-craft'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Fails without an excellent photograph or object. Wrong for offers.' },
  { key: 'collage-and-cutout', name: 'Cut-out collage', summary: 'Hand-cut photographs and paper shapes combined with clean type.',
    movements: ['collage', 'analog-experimental', 'contemporary-maximalism'], added: ADDED, reviewBy: REVIEW, status: 'proposed', basis: BASIS,
    caution: 'Every source image needs a licence that allows cutting and combining.' },
];

/** Trends the engine and customers may see: approved and not past review. */
export function activeTrends(today: string): Trend[] {
  return TRENDS.filter((t) => t.status === 'approved' && t.reviewBy >= today);
}

/** Entries somebody must look at again. */
export function overdueTrends(today: string): Trend[] {
  return TRENDS.filter((t) => t.status !== 'retired' && t.reviewBy < today);
}
