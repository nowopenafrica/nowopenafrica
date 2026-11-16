# Creative Intelligence Library

What NowOpen Create knows about design, written down so every person and every model working on Create starts from the same place.

The library exists because the CI-0 baseline (15 November 2026) scored 35 of Create's designs on the founder's 100-point rubric and none reached 70. The layouts were tidy. What was missing was the thinking before layout: who the piece is for, what idea it carries, which visual language suits it, and what the picture should show.

## How it is organised

| File | What it holds | Source |
|---|---|---|
| [fundamentals.md](fundamentals.md) | The rules that hold in every movement | hand-written |
| [movements.md](movements.md) | 25 design movements, with when to use each and when not to; 16 composition archetypes | generated |
| [industries.md](industries.md) | 25 industry profiles: audience, goals, what a piece must carry, movements that fit or hurt | generated |
| [request-taxonomy.md](request-taxonomy.md) | The seven kinds of request, and what a brief must settle for each | generated |
| [typography.md](typography.md) | Faces we ship, pairings, type rules, and the voices we cannot produce yet | generated |
| [photography.md](photography.md) | What a picture is for in each mode, and what makes it unusable | generated |
| [print-production.md](print-production.md) | Bleed, safe area, resolution, colour and large format | hand-written |
| [trends-2026.md](trends-2026.md) | Dated, reviewable notes on what is current; off until approved | generated |

"Generated" files are written from the typed registry in `src/lib/create/intel/` by `npm run intel:docs`. Edit the registry, then run the command. A test (`intel.test.ts`) fails when a generated file differs from the registry, so the docs and the code cannot drift.

## How Create uses it

1. **Brief.** The industry profile supplies defaults: audience, goals, what the piece must carry.
2. **Concepts.** Three concepts are drawn from three different movements and three different composition archetypes. A palette change alone is not a different concept.
3. **Art direction.** The movement sets grid, type, colour and imagery behaviour. Its "avoid when" list can veto it for this brief.
4. **Imagery.** The photography direction decides what the picture must show. If no relevant picture exists, the concept uses an archetype that needs none.
5. **Quality.** The rubric's defects are named in this library's terms.

## Rules for anyone editing it

- **Principles, never copies.** Movements are public design history, described in our own words. Do not describe, trace or imitate a specific poster, identity, campaign or template, and do not lift assets from any brand, studio, Canva or Freepik.
- **No invented facts.** No statistics without a source. Trends are editorial notes, dated, and `proposed` until the founder approves them.
- **Culture with permission.** Patterns, motifs and scripts that belong to a community are used only with a real tie and permission, and are named, not generalised.
- **Only what we can deliver.** A pairing may use only faces we self-host. Missing voices are listed as proposals in typography.md, not assumed.
- **Coolvetica is NowOpen's.** Create's own interface uses it. Customer designs do not inherit it.
- **Cautions are prompts, not legal advice.** Advertising rules differ by country and sector.
