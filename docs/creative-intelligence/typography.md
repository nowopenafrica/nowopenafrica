# Typography

> Generated from `src/lib/create/intel/pairings.ts` by `npm run intel:docs`. Edit the registry, not this file; a test fails when they differ.

## Rules that always hold

- Two families at most on one piece, and a reason for the second.
- One face leads. The step in size from the headline to the next line is steep, never timid.
- A display face is for a few words set large. It never sets small text.
- A script is for one to four words. It is never set in capitals and never tracked.
- Small capitals are tracked open; a headline in lower case is tracked slightly tight.
- Text near six points needs a sturdy, open face. Hairlines disappear in print at that size.
- Figures that are compared (prices, times) are set in a face whose digits share one width.
- From a road: heavy or condensed, seven words, no hairlines.
- A face with no lower case is for names and titles, never sentences.
- Every character the customer types must have a glyph. The fallback face draws what the chosen face cannot.
- The type is a named system: one face for the headline, one for the text, one for the labels. A customer is told which is which.

## What each kind of piece asks of its type

| Piece | How it is read | Headline | Text | Avoid |
|---|---|---|---|---|
| Billboard and roadside board | About three seconds, moving, from far away. | Heavy or condensed sans, or a sturdy slab. Seven words at most. At least a fifth of the board’s height. | None. The name and one line to act on, both large. | Hairline serifs, scripts, light weights, and any second message. |
| Business card and small label | Held in the hand, read once, kept for the number. | The name, in a face with some character, no larger than it needs. | A sturdy sans or mono at six to eight points: the phone number has to survive a bad printer. | Display serifs and scripts for the details. Anything under six points. More than two families. |
| Social post and story | A thumb pause on a phone, one idea, then gone. | One confident face used large. Character matters more than neutrality here. | One or two short lines in a clear sans. | Paragraphs. Small type near the edges the platform crops. |
| Poster and flyer | Glanced at on a wall, then read up close if the glance worked. | A strong display face; the size steps down steeply to everything else. | A reading sans or serif for the what, where and when. Figures that line up. | Three or more families. A headline and details at nearly the same size. |
| Menu and price list | Scanned in rows; the eye runs from a name to its price. | A face with the place’s character, for section names. | A reading serif or humanist sans for dishes; figures in a face where digits align, such as a mono. | Scripts for dish names. Prices in a face whose digits do not line up. |
| Brand name and identity | Seen thousands of times at every size, from a sign to a favicon. | One distinctive face for the name, tested small as well as large. | A neutral partner that will not compete with it. | A face chosen because it is fashionable this year. Effects standing in for a real choice. |
| Invitation and ceremony | Read slowly, kept, sometimes framed. | Classical capitals, an old-style serif, or a script for one or two words. | A text serif with room around it. | A script for the date and address. Capitals in a script. |
| Notices, schedules and reports | Looked up, not read through: the reader wants one fact. | Plain and clear; the structure does the work. | A neutral sans with a tall x-height, and a mono or tabular face for figures. | Display faces anywhere. Centred text in tables. |

## What each face is for

"Smallest" is the smallest job the face may be given: small print, running text, or headlines only. "Road" means it holds up on a billboard.

| Face (`key`) | Smallest | Capitals | Paragraphs | Road | Figures | Most words | Loaded | When to reach for it |
|---|---|---|---|---|---|---|---|---|
| Outfit (`sans`) | small | either | yes | yes | yes | any | always | Clean geometric sans. The safe, modern default for anything that has to be read. |
| Playfair Display (`serif`) | display | either | no | no | no | any | always | High-contrast serif. Fashion, property, anything that needs to feel expensive. |
| Space Mono (`mono`) | small | either | no | no | yes | any | always | Technical monospace. Use small and spaced, for eyebrows and codes. |
| Bebas Neue (`condensed`) | display | only | no | yes | yes | any | always | Tall condensed caps. Sales, events, street posters — loud without shouting. |
| DM Serif Display (`editorial`) | display | either | no | no | no | any | always | Editorial serif with tight fit. Magazine covers, menus, considered headlines. |
| Fraunces (`soft`) | display | either | no | no | no | any | always | Warm, slightly odd serif. Food, wellness, anything that should feel handmade. |
| Space Grotesk (`grotesk`) | text | either | yes | yes | yes | any | always | Modern grotesk with character. Tech, agencies, studios. |
| Archivo Black (`heavy`) | display | either | no | yes | no | 8 | always | One weight, very heavy. For a headline that is the whole design. |
| Source Sans 3 (`humanist`) | small | either | yes | yes | yes | any | always | Open humanist sans. Long reading and small print; the widest African-letter coverage we ship. |
| Dancing Script (`script`) | display | never | no | no | no | 4 | always | Lively handwritten script. Invitations, cakes and boutiques; keep it to a few words. |
| Jost (`geometric`) | text | either | no | yes | yes | any | always | Circle-built geometric sans. Bauhaus, Deco and anything that should feel constructed. |
| Bodoni Moda (`didone`) | display | either | no | no | no | any | always | Hairline-contrast display serif. Fashion and fragrance headlines, set large; never small. |
| Zilla Slab (`slab`) | text | either | no | yes | yes | any | always | Sturdy slab serif. Trades, posters and labels that should feel built to last. |
| Cormorant Garamond (`oldstyle`) | display | either | no | no | no | any | always | Old-style book serif with a light touch. Heritage, bridal and quiet luxury headlines. |
| Inter (`neutral`) | small | either | yes | yes | yes | any | when used | Neutral neo-grotesque with a tall x-height. Interfaces, tables, small print and any long text that must simply be read. |
| Unbounded (`wide`) | display | either | no | yes | no | 5 | when used | Wide, rounded display sans. Tech launches, music and retro-future headlines of a few words. |
| Anton (`impact`) | display | either | no | yes | yes | any | when used | Heavy condensed sans with a lower case. Sales, sport and headlines that must be read from far away. |
| Oswald (`narrow`) | text | either | no | yes | yes | any | when used | Narrow gothic. Fits a long headline, a date or a price into a tight width without shouting. |
| Instrument Serif (`elegant`) | display | either | no | no | no | any | when used | Light, condensed display serif. Editorial and beauty headlines; set large, never small. |
| Cinzel (`classical`) | display | only | no | no | no | 6 | when used | Roman inscriptional capitals. It has no lower case: names, titles and monograms for luxury, law and ceremony. |
| Lora (`reading`) | text | either | yes | no | yes | any | when used | Text serif with a calligraphic touch. Menus, stories and any paragraph that should feel written, not typed. |
| Poppins (`friendly`) | small | either | yes | yes | yes | any | when used | Round geometric sans, familiar and approachable. Small businesses, schools, health and community notices. |
| Montserrat (`urban`) | text | either | no | yes | yes | any | when used | Wide urban sans. Confident headlines for property, fitness, retail and events. |
| Nunito (`rounded`) | display | either | no | yes | no | any | when used | Rounded sans. Children, food, care and anything that should feel safe and kind. |
| Caveat (`handwritten`) | display | never | no | no | no | 6 | when used | Quick handwriting. A note, a price tag or one aside; a few words at most. |
| Pacifico (`retro`) | display | never | no | no | no | 3 | when used | Bold brush script. Cafes, beach, ice cream and nostalgia; one or two words, never capitals. |
| JetBrains Mono (`technical`) | small | either | no | no | yes | any | when used | Clear monospace with a real lower case. Codes, references, prices in columns and small technical labels. |
| Bricolage Grotesque (`expressive`) | display | either | no | yes | no | any | when used | Grotesque with visible character. Studios, culture and brands that should not look like software. |
| Abril Fatface (`fatface`) | display | either | no | no | no | 6 | when used | Very heavy high-contrast serif. Food, fashion and magazine-cover headlines of a few words. |
| Big Shoulders (`industrial`) | display | either | no | yes | yes | any | when used | Tall industrial condensed sans. Sport, logistics, trades and numbers set very large. |
| Syne (`artistic`) | display | either | no | yes | no | 5 | when used | Unusual wide sans from the art world. Galleries, festivals and fashion; short lines only. |
| Noto Sans (`universal`) | small | either | yes | yes | yes | any | always | Plain sans that draws every supported African letter. It is the face every other face borrows missing letters from. |
| Quicksand (`gentle`) | text | either | yes | no | yes | any | when used | Light, rounded geometric sans. Wellness, beauty, children and soft-spoken brands; best as a sub-heading and short text. |
| DM Sans (`clean`) | small | either | yes | yes | yes | any | when used | Compact low-contrast sans. A quiet partner under a display serif, and clear at small sizes. |
| Coolvetica (`coolvetica`) | display | either | no | yes | no | any | always | Tight, rounded and confident. The NowOpen house face — good for a short, loud line. |

## Where these rules were checked

Principles only; no design, layout or asset is copied from any of these (Ruling AJ). Checked 2026-11-16.

- **Behance, most-appreciated brand identity projects of the week (behance.net, search "brand identity typography"):** The related tags were "variable grotesque type", "bold light grotesk", "sans serif typeface", "black white contrast", "logo design fonts" and "kinetic motion designer". Identity work is leading with one grotesque family used at two contrasting weights. Answered here by Inter in two weights (`system`) and Bricolage Grotesque (`studio`).
- **Awwwards, the Typography collection (awwwards.com/websites/typography):** Its font filter is dominated by grotesques, condensed display faces (Anton, Bebas, Barlow, Druk), editorial serifs (Cormorant, Bodoni Moda, Canela, Editorial New) and monospace. The page states that consistency is key in the use of typography. Anton, Bebas Neue, Cormorant Garamond and Bodoni Moda are in the library; the commercial faces are not imitated.
- **Pinterest, search "branding typography" (read 2026-11-17, signed in as the founder; one results page):** Pinterest suggests narrowing the search by trade (luxury, fashion, beauty, food, coffee, skincare, tech, streetwear, perfume) and by "guidelines", "system" and "layout": people look for type by the business it is for, and expect it presented as a system. The brand boards shown name three levels outright, for example a heading face, a sub-heading face and a body face. Two treatments recur: heavy or condensed sans headlines for impact, and high-contrast serifs for luxury and beauty. Many boards use one saturated colour on black or white. Open faces named on the boards include Inter, Montserrat, Playfair Display, Bebas Neue and Bodoni, all in the library; Quicksand and DM Sans are named and are not. A second search timed out and was not read.
- **Type forecasts for 2026 (Creative Bloq, Muzli, Design and Paper, type.today):** Agreed points: editorial and "curvy" serifs returning; monospace moving into branding; variable fonts now ordinary; expressive display type; and restraint, with two families at most. Disagreed or unusable here: distorted and kinetic lettering, which a static layout engine cannot honestly produce. These are opinion pieces, not measurements.
- **Muzli, "Best free Google Fonts for 2026":** Named Inter, Lora, Oswald, Anton, Montserrat, Bebas Neue, Zilla Slab, Pacifico, Dancing Script and JetBrains Mono among its picks, all now in the library, with the advice to use scripts in short bursts and to load only the weights used.

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
| neutral | Inter | text | 400, 700 | SIL OFL 1.1 |
| wide | Unbounded | display | 700 | SIL OFL 1.1 |
| impact | Anton | display | 400 | SIL OFL 1.1 |
| narrow | Oswald | display | 600 | SIL OFL 1.1 |
| elegant | Instrument Serif | display | 400 | SIL OFL 1.1 |
| classical | Cinzel | display | 700 | SIL OFL 1.1 |
| reading | Lora | text | 400, 600 | SIL OFL 1.1 |
| friendly | Poppins | text | 500, 700 | SIL OFL 1.1 |
| urban | Montserrat | display | 700 | SIL OFL 1.1 |
| rounded | Nunito | display | 800 | SIL OFL 1.1 |
| handwritten | Caveat | accent | 700 | SIL OFL 1.1 |
| retro | Pacifico | accent | 400 | SIL OFL 1.1 |
| technical | JetBrains Mono | accent | 500 | SIL OFL 1.1 |
| expressive | Bricolage Grotesque | display | 700 | SIL OFL 1.1 |
| fatface | Abril Fatface | display | 400 | SIL OFL 1.1 |
| industrial | Big Shoulders | display | 800 | SIL OFL 1.1 |
| artistic | Syne | display | 700 | SIL OFL 1.1 |
| universal | Noto Sans | text | 400, 700 | SIL OFL 1.1 |
| gentle | Quicksand | text | 500, 700 | SIL OFL 1.1 |
| clean | DM Sans | text | 400, 700 | SIL OFL 1.1 |
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
| System (`system`) | Inter | Inter | JetBrains Mono | One neutral family in two weights with a mono for figures: notices, schedules, technology, institutions. | Swiss International, Corporate Precision, Information Design |
| Broadcast (`broadcast`) | Anton | Inter | Oswald | A heavy condensed headline over plain text: sales, sport, rallies and anything read from across a street. | Neo-Brutalism, Kinetic Typography, Constructivism, Typographic Monumentalism |
| Atelier (`atelier`) | Instrument Serif | Lora | Inter | A light display serif over a text serif: beauty, fashion, hospitality and quiet luxury. | Luxury Minimalism, Editorial, Japanese Minimalism, Monochrome Photographic |
| Monument (`monument`) | Cinzel | Lora | Inter | Inscriptional capitals for a name or title: law, ceremony, heritage, hotels. Short lines only. | Luxury Minimalism, Art Deco, Heritage Craft |
| Neighbourhood (`neighbourhood`) | Poppins | Poppins | Inter | One round, familiar family: local shops, schools, clinics and community notices. | Afro-Contemporary, Organic Natural |
| Signal (`signal`) | Unbounded | Inter | JetBrains Mono | A wide display face for a few words, with mono labels: launches, music, technology, retro-future. | Retro-Futurism, 3D and CGI, Y2K and Psychedelic, Gradient Futurism |
| Masthead (`masthead`) | Abril Fatface | Lora | Oswald | A very heavy serif headline like a magazine cover: food, fashion, culture. | Editorial, Contemporary Maximalism, Collage |
| Works (`works`) | Big Shoulders | Inter | JetBrains Mono | Tall industrial capitals and large numbers: logistics, trades, fitness, sport. | Neo-Brutalism, Kinetic Typography, Constructivism, Typographic Monumentalism |
| Studio (`studio`) | Bricolage Grotesque | Inter | JetBrains Mono | A grotesque with visible character: studios, culture and brands that should not look like software. | Afro-Contemporary, African Modernism, Analog Experimental, Collage |
| Artline (`artline`) | Syne | Inter | Inter | An unusual wide sans for short lines: galleries, festivals, fashion. | Y2K and Psychedelic, Monochrome Photographic, Gradient Futurism |
| Playroom (`playroom`) | Nunito | Poppins | Inter | Rounded and kind: children, food, care, parties. | Contemporary Maximalism, Memphis |
| City (`city`) | Montserrat | Inter | Oswald | A confident wide sans: property, retail, fitness and events. | Bauhaus, African Modernism, Corporate Precision |
| Marquee (`marquee`) | Bebas Neue | Quicksand | Quicksand | Tall condensed capitals softened by a rounded sans: cafes, wellness, family businesses, friendly events. | Afro-Contemporary, Memphis, Heritage Craft |
| Salon (`salon`) | Instrument Serif | DM Sans | DM Sans | A light display serif over a compact sans: beauty, skincare, boutiques, considered services. | Luxury Minimalism, Editorial, Japanese Minimalism, Organic Natural |

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
