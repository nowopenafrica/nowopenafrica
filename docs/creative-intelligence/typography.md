# Typography

> Generated from `src/lib/create/intel/pairings.ts` by `npm run intel:docs`. Edit the registry, not this file; a test fails when they differ.

Customer designs use only faces we self-host with a recorded licence. NowOpen Create's own interface uses Coolvetica; customer designs do not inherit it.

## Faces we ship

| Key | Face | Role | Weights | Licence |
|---|---|---|---|---|
| sans | Outfit | text | 400, 600, 800 | SIL OFL 1.1 |
| serif | Playfair Display | display | 700, 900 | SIL OFL 1.1 |
| mono | Space Mono | accent | 700 | SIL OFL 1.1 |
| condensed | Bebas Neue | display | 400 | SIL OFL 1.1 |
| editorial | DM Serif Display | display | 400 | SIL OFL 1.1 |
| soft | Fraunces | display | 600 | SIL OFL 1.1 |
| grotesk | Space Grotesk | text | 500, 700 | SIL OFL 1.1 |
| heavy | Archivo Black | display | 400 | SIL OFL 1.1 |
| humanist | Source Sans 3 | text | 400, 600, 700 | SIL OFL 1.1 |
| script | Dancing Script | display | 400 | SIL OFL 1.1 |
| geometric | Jost | display | 600 | SIL OFL 1.1 |
| didone | Bodoni Moda | display | 600 | SIL OFL 1.1 |
| slab | Zilla Slab | display | 700 | SIL OFL 1.1 |
| oldstyle | Cormorant Garamond | display | 600 | SIL OFL 1.1 |
| coolvetica | Coolvetica | display | 300, 400, 700 | Free for commercial use |

## Pairings

A pairing is the decision already made: which face carries the headline, which the reading, which the small labels.

| Pairing | Display | Text | Accent | Suits | Movements |
|---|---|---|---|---|---|
| Modern (`modern`) | Space Grotesk | Outfit | Space Mono | Agencies, tech, services. Neutral and current. | Swiss International, Bauhaus, Afro-Contemporary, African Modernism, Retro-Futurism, Corporate Precision, 3D and CGI, Memphis, Gradient Futurism |
| Editorial (`editorial`) | DM Serif Display | Outfit | Space Mono | Menus, magazines, considered announcements. | Editorial, Analog Experimental, Collage |
| Luxury (`luxury`) | Playfair Display | Outfit | Space Mono | Property, fashion, salons, anything premium. | Luxury Minimalism, Art Deco, Heritage Craft |
| Impact (`impact`) | Archivo Black | Space Grotesk | Bebas Neue | One-line statements. Sales that need to be seen across a street. | Neo-Brutalism, Contemporary Maximalism, Y2K and Psychedelic, Kinetic Typography, Constructivism, Typographic Monumentalism |
| Street (`street`) | Bebas Neue | Space Grotesk | Space Mono | Events, nightlife, flash sales, gyms. | Neo-Brutalism, Contemporary Maximalism, Retro-Futurism, Analog Experimental, Y2K and Psychedelic, Constructivism, Collage |
| Warmth (`warmth`) | Fraunces | Outfit | Outfit | Food, wellness, family businesses. Friendly rather than corporate. | Organic Natural, Memphis |
| Statement (`statement`) | Archivo Black | Outfit | Bebas Neue | One idea, very large, with a condensed label under it. | Bauhaus, Neo-Brutalism, Contemporary Maximalism, Afro-Contemporary, 3D and CGI, Kinetic Typography, Typographic Monumentalism |
| Swiss (`swiss`) | Space Grotesk | Source Sans 3 | Space Mono | Grid-led, objective work: programmes, institutions, technology. | Swiss International, African Modernism, Corporate Precision, Information Design, Monochrome Photographic, Gradient Futurism |
| Couture (`couture`) | Playfair Display | Source Sans 3 | Source Sans 3 | High-contrast serif over a quiet sans: fashion, fragrance, property. | Luxury Minimalism, Editorial, Afro-Contemporary, Art Deco, Japanese Minimalism, Monochrome Photographic |
| Gallery (`gallery`) | DM Serif Display | Source Sans 3 | Source Sans 3 | Reading-first pages: culture, hospitality, long menus. | Editorial, African Modernism, Japanese Minimalism, Organic Natural, Monochrome Photographic, Collage |
| Poster (`poster`) | Bebas Neue | Outfit | Bebas Neue | Tall condensed capitals for dates, line-ups and street posters. | Retro-Futurism, Analog Experimental, Kinetic Typography, Constructivism, Typographic Monumentalism |
| Craft (`craft`) | Fraunces | Source Sans 3 | Dancing Script | Made-by-hand businesses: bakeries, makers, family trades. Script for one word only. | Organic Natural, Heritage Craft |
| Ledger (`ledger`) | Outfit | Source Sans 3 | Space Mono | Facts and figures: price lists, schedules, reports. | Corporate Precision, Information Design |
| Bauhaus (`bauhaus`) | Jost | Outfit | Space Mono | Constructed, circle-built headlines: schools, studios, playful geometry. | Bauhaus, Memphis |
| Deco (`deco`) | Jost | Source Sans 3 | Source Sans 3 | Tall tracked capitals for hotels, bars, galas and invitations. | Art Deco |
| Vogue (`vogue`) | Bodoni Moda | Source Sans 3 | Source Sans 3 | Hairline-contrast headlines set large: fashion, fragrance, portraits. | Luxury Minimalism, Editorial, Monochrome Photographic |
| Workshop (`workshop`) | Zilla Slab | Source Sans 3 | Space Mono | Slab headlines with weight: trades, rallies, labels, raw posters. | Neo-Brutalism, Constructivism, Heritage Craft |
| Heirloom (`heirloom`) | Cormorant Garamond | Source Sans 3 | Dancing Script | Old-style serif for provenance: makers, tailoring, bridal, institutions. | African Modernism, Heritage Craft |

## Rules

- Two families per piece at most, in three weights at most. Contrast comes from size and weight.
- A steep scale: headline at least 3x body on posts and billboards; name at least 1.6x details on cards.
- Capitals for labels are tracked +4 to +12%. Large headlines are tracked slightly negative. Body stays at 0.
- Real typographic marks: curly quotes, en and em dashes where the language uses them, the naira sign from the face itself.
- No widows or orphans in headlines; balance the lines.
- Aligned (tabular) figures in prices, times and contact blocks.
- A monospace face is for small labels and codes, never a headline, and never on luxury, corporate or clinical work where it reads as software.
- Script is for one word, never a sentence, and never in capitals.

## Voices we cannot produce yet

Four of the six gaps found in CI-1 were closed on 16 November 2026 (Jost, Bodoni Moda, Zilla Slab and Cormorant Garamond, one display weight each). Two remain. Neither is installed.

| Missing voice | Weakens | Candidate | Licence | What the check found |
|---|---|---|---|---|
| Neutral neo-grotesque for text and display | Swiss International, Corporate Precision, Information Design | Inter | SIL OFL 1.1 (verified in the upstream OFL.txt) | One weight is 42.8 KB and would fit the 600 KB font budget with under 5 KB to spare. It was held back because it draws the Hausa letters no shipped face has: a test requires that gap list to shrink when a covering face arrives, which means making Inter the glyph fallback in place of Source Sans 3. That is its own piece of work, and it would close the Hausa gap. |
| Wide, extended display sans | Retro-Futurism, Gradient Futurism, 3D and CGI | Unbounded | SIL OFL 1.1 (verified in the upstream OFL.txt) | One weight is 63.4 KB, more than the 47 KB left in the 600 KB font budget. |
