# Media plans

Several placements, taken to the media owners as one ask.

Built 2026-10-27, after the preview studio and the surface editor.

---

## The gap

A business could already book **one** placement through the existing
Paystack flow (`kind: 'placement_booking'`), or send **one** enquiry through
`PlatformEnquiryModal`. Both work and neither was touched.

What it could not do was assemble the thing it actually wants — three
billboards, a bus and a screen, across two cities, against a budget — and
put that in front of anybody.

## Why not `public.campaigns`

There is already a `campaigns` table and it means something else: the
**platform's own** marketing campaigns, with a slug, a hero headline and a
target number of signups ("Africa is NowOpen", "Restaurant Week"). An
advertiser's media plan shares a word with it and nothing else.

This codebase has been bitten twice by two ideas sharing one noun —
`industrySystems` vs `categoryFeatures`, and the two format registries that
disagreed about A4. So `ad_campaigns` and `ad_campaign_placements` are
separate tables with separate names.

## The number this page will not show

**MEASURED on production: all 97 rows of `advertisements` carry
`provenance = 'unverified_import'` and zero rights verifications.** Their
rates come from published Nigerian OOH rate cards — not from a quote a
board's owner has given NowOpen, for anybody, for any dates.

So there is no confirmed cost in this inventory today, and the plan never
prints one confident total under a list of billboards:

- costs are grouped by **where the number came from** (`quoted`,
  `indicative`, `unpriced`) and each group is labelled;
- a group containing **any** uncosted line shows no total at all, because a
  partial sum presented as a total is the same lie in smaller type;
- a line with no duration costs `null`, not `0` — zero would make a plan
  look *cheaper* the more unknowns it carries, which is backwards;
- `hasConfirmedTotal` is **computed**, not hardcoded, so the answer changes
  by itself the day a real quote arrives.

Under the figures, always: *"These are indicative rates from published rate
cards, not quotes for your dates. The media owners confirm the price."*

And before the send button, not after: *"Nothing is booked and nothing is
charged until a media owner confirms and you pay."*

`status` can only reach `draft`, `enquiry_sent` or `archived`. There is no
`confirmed` — a booking is the existing payment flow and lives where it
already lives.

## Where it is

| | |
|---|---|
| `/advertise/plan` | the plan |
| `/adverts/:id` → **Save to my plan** | adds a placement, creating a plan on first use |
| `lib/promote/campaignPlan.ts` | the decisions — totals, gaps, readiness. No network. |
| `lib/promote/campaigns.ts` | the database, kept thin |

Creating a plan on first save is deliberate: the first placement somebody
likes *is* the moment they want a plan, and making them set one up first
loses the ones who were only browsing.

A plan is private working material — what a business is considering and what
it can spend. RLS scopes both tables to the owner, the child policy joins
back to the parent's owner so a `campaign_id` cannot be used to read
somebody else's, and the page is `noindex, nofollow`.

## The bug the test caught

The first working plan showed **"₦14 / day"** for a billboard whose own
listing said ₦18,680/day.

`advertisements.pricing` is stored in **USD** and converted for display by
`useCurrency`. The plan page had its own `Intl.NumberFormat('en-NG')`, which
formatted the raw dollar figure as naira — a plausible-looking number wrong
by three orders of magnitude, on the one page whose entire job is being
careful about money.

Now it uses the same formatter as everything else. Re-measured: ₦19,039/day
and ₦223,026/day against a listing showing ₦18,680/day, the difference being
the live FX rate. Total ₦7,261,930, labelled indicative.

The lesson is the ordinary one: a second formatter is a second opinion, and
money is not a place for two.

## Verified

A real two-medium plan built through the interface on live data —
a Port Harcourt unipole and a Channels TV spot:

- per-line cost from each placement's own rate and duration
- totals grouped under *"Indicative, from published rate cards"*
- mix: Billboard 1, Television 1
- *"Artwork ready on 0 of 2"* and *"2 placements have no artwork attached yet"*
- dimensions read correctly per medium — `12m × 6m` and `30 second slot`

The test plan was deleted afterwards.

`npm run verify`: 0 errors, 12/12 guards, 429 files / 6,201 tests.

## Not built

- **No artwork attached to a line yet.** The column and the readiness count
  exist; what is missing is the picker that puts a Create Media design or an
  upload onto a specific placement. That is the natural next step, and it is
  the join between Promote and Create the brief asks for.
- **No comparison view**, no budget filtering against the plan, no
  per-placement quote tracking. All of those are worth more once somebody
  has actually sent a plan and a media owner has answered.
- **Nothing writes `price_basis = 'quoted'`.** It exists so a real quote can
  be shown differently — not so today's numbers can be dressed up.
