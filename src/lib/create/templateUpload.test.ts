import { describe, expect, it } from 'vitest';

import { DESIGN_TEMPLATES, fitSlotSize } from '../designTemplates';
import { DELIVERABLE_CATEGORIES } from '../design/deliverables';
import { PALETTES, displayOnlyRoles } from '../design/palettes';
import {
  UNSUPPORTED_FORMATS, classifyUpload, readTemplateUpload, templateKeyFrom, templateToUploadJson,
} from './templateUpload';

const good = () => ({
  label: 'Launch Poster',
  desc: 'A bold opening announcement.',
  category: 'flyers',
  mood: 'bold',
  scheme: 'dark',
  surface: { kind: 'gradient', angle: 160, intensity: 0.6 },
  slots: [
    { role: 'eyebrow', x: 0.08, y: 0.12, w: 0.5, size: 0.02 },
    { role: 'headline', x: 0.08, y: 0.2, w: 0.84, size: 0.1, weight: 800 },
    { role: 'cta', x: 0.08, y: 0.8, w: 0.5, size: 0.03 },
  ],
});

const accept = (raw: unknown) => {
  const out = readTemplateUpload(raw);
  if (!out.ok) throw new Error(`expected acceptance, got: ${out.reason}`);
  return out;
};

const refuse = (raw: unknown) => {
  const out = readTemplateUpload(raw);
  if (out.ok) throw new Error('expected a refusal');
  return out.reason;
};

describe('a valid upload becomes a real template', () => {
  it('produces the same shape the 66 code templates use', () => {
    const { template, editability } = accept(good());
    expect(editability).toBe('full');
    expect(template.slots).toHaveLength(3);
    expect(template.surface.kind).toBe('gradient');
    /* And the engine can fit type to it, exactly as for a code template. */
    const headline = template.slots.find((s) => s.role === 'headline')!;
    expect(fitSlotSize(headline, template.slots, 'Opening this Friday', 1080, 1080))
      .toBeGreaterThan(0);
  });

  it('never shadows a template that already exists', () => {
    const existing = DESIGN_TEMPLATES[0].key;
    const { template, notes } = accept({ ...good(), key: existing });
    expect(template.key).not.toBe(existing);
    expect(notes.join(' ')).toMatch(/already taken/i);
  });

  it('makes a key out of the label when none is given', () => {
    expect(accept(good()).template.key).toBe('launch-poster');
  });

  it('keeps generating distinct keys under collision', () => {
    const taken = new Set(['launch-poster', 'launch-poster-2']);
    expect(templateKeyFrom('Launch Poster', taken)).toBe('launch-poster-3');
    expect(templateKeyFrom('!!!', new Set())).toBe('template');
  });
});

describe('what it refuses, and why', () => {
  it('refuses a file that is not a template at all', () => {
    expect(refuse(null)).toMatch(/not a design template/i);
    expect(refuse([1, 2, 3])).toMatch(/not a design template/i);
    expect(refuse('hello')).toMatch(/not a design template/i);
  });

  it('refuses a template with nothing to edit', () => {
    expect(refuse({ ...good(), slots: [] })).toMatch(/no slots/i);
  });

  it('refuses a slot role the renderer does not know', () => {
    const raw = good();
    raw.slots[0].role = 'sidebar';
    expect(refuse(raw)).toMatch(/does not know/i);
  });

  /*
   * A template authored at 1080 and pasted in raw would put every slot
   * hundreds of units off the page — and a flat export does not clip what
   * sits outside the frame, it loses it.
   */
  it('refuses pixel coordinates rather than clamping them into nonsense', () => {
    const raw = good();
    raw.slots[1].x = 86;
    expect(refuse(raw)).toMatch(/fractions of the canvas, not pixels/i);
  });

  it('refuses two slots with the same role', () => {
    const raw = good();
    raw.slots.push({ role: 'headline', x: 0.1, y: 0.5, w: 0.5, size: 0.05, weight: 400 });
    expect(refuse(raw)).toMatch(/two "headline" slots/i);
  });

  /* The fitter sizes against the headline, and the gallery previews it. */
  it('refuses a template with no headline', () => {
    const raw = good();
    raw.slots = raw.slots.filter((s) => s.role !== 'headline');
    expect(refuse(raw)).toMatch(/needs a headline/i);
  });

  it('refuses a category that does not exist, and lists the ones that do', () => {
    const reason = refuse({ ...good(), category: 'brochures' });
    expect(reason).toMatch(/not a deliverable category/i);
    for (const c of DELIVERABLE_CATEGORIES) expect(reason).toContain(c.id);
  });

  it('refuses a template with no label', () => {
    expect(refuse({ ...good(), label: '   ' })).toMatch(/needs a label/i);
  });

  it('refuses an absurd number of slots', () => {
    const raw = good();
    raw.slots = Array.from({ length: 40 }, (_, i) => ({
      role: i === 0 ? 'headline' : 'meta', x: 0.1, y: 0.1, w: 0.5, size: 0.03, weight: 400,
    }));
    expect(refuse(raw)).toMatch(/beyond what a single design should carry/i);
  });
});

describe('numbers are clamped, not trusted', () => {
  it('keeps type inside a drawable range', () => {
    const raw = good();
    raw.slots[1].size = 9;
    expect(accept(raw).template.slots[1].size).toBeLessThanOrEqual(0.4);
  });

  it('rounds a weight to a real one', () => {
    const raw = good();
    raw.slots[1].weight = 7000;
    expect(accept(raw).template.slots[1].weight).toBe(900);
  });

  it('wraps a surface angle instead of rejecting it', () => {
    const raw = good();
    raw.surface.angle = 420;
    expect(accept(raw).template.surface.angle).toBe(60);
  });

  it('says so when it had to supply a surface', () => {
    const raw = good();
    delete (raw as Record<string, unknown>).surface;
    expect(accept(raw).notes.join(' ')).toMatch(/plain gradient/i);
  });
});

describe('what a FILE may become, before it is read', () => {
  it('takes the formats that genuinely work', () => {
    expect(classifyUpload('poster.json', 'application/json')).toMatchObject({ supported: true, becomes: 'full' });
    expect(classifyUpload('art.png', 'image/png')).toMatchObject({ supported: true, becomes: 'asset' });
  });

  /*
   * Refusing by name beats accepting a .psd, storing it, and telling
   * somebody afterwards that nothing in it can be changed.
   */
  it('refuses a format with no importer, and says what to do instead', () => {
    for (const ext of Object.keys(UNSUPPORTED_FORMATS)) {
      const out = classifyUpload(`design.${ext}`, 'application/octet-stream');
      expect(out.supported, ext).toBe(false);
      if (!out.supported) expect(out.reason.length, ext).toBeGreaterThan(20);
    }
  });

  it('refuses something it has never heard of, and lists what it takes', () => {
    const out = classifyUpload('thing.xyz', 'application/octet-stream');
    expect(out.supported).toBe(false);
    if (!out.supported) expect(out.reason).toMatch(/\.json/);
  });
});

describe('a template that carries its own look', () => {
  /*
   * The look is palette KEYS and ROLES, never colours — that is what lets an
   * uploaded design be redrawn in somebody else's brand. The shapes field was
   * once stored and silently dropped on the way out of this allowlist; these
   * pin that the look cannot go the same way.
   */
  /* A look this fixture's words can be read on: the upload measures it now. */
  const LOOK = {
    palette: 'harbour-blue',
    type: 'editorial',
    gradient: { kind: 'linear', stops: ['ground', 'secondary'], angle: 160 },
    pattern: { key: 'dots', role: 'highlight', opacity: 0.08, scale: 0.08, zone: 'bottom' },
    duotone: ['ground', 'primary'],
  };

  it('keeps the look on an uploaded template', () => {
    const raw = JSON.parse(JSON.stringify({ ...good(), look: LOOK }));
    expect(accept(raw).template.look).toEqual(LOOK);
  });

  it('survives being written out and uploaded back', () => {
    const shipped = { ...accept(good()).template, look: LOOK } as Parameters<typeof templateToUploadJson>[0];
    const back = accept({ ...JSON.parse(templateToUploadJson(shipped, 'flyers')), key: 'fresh-key' });
    expect(back.template.look).toEqual(LOOK);
  });

  it('keeps role tones and the ground a slot sits on', () => {
    const raw = good();
    Object.assign(raw.slots[0], { tone: 'secondary', on: 'primary' });
    const slot = accept({ ...raw, look: LOOK }).template.slots[0];
    expect(slot.tone).toBe('secondary');
    expect(slot.on).toBe('primary');
  });

  it('refuses a look that carries hex', () => {
    expect(refuse({ ...good(), look: { ...LOOK, palette: '#ff7a45' } })).toMatch(/palette roles, never colours/i);
    expect(refuse({ ...good(), look: { ...LOOK, gradient: { kind: 'linear', stops: ['#ffffff', 'primary'] } } }))
      .toMatch(/look\.gradient.*never colours/i);
    expect(refuse({ ...good(), look: { ...LOOK, pattern: { ...LOOK.pattern, role: '#000' } } }))
      .toMatch(/never colours/i);
    expect(refuse({ ...good(), look: { ...LOOK, extra: { note: 'brand is #0f766e' } } }))
      .toMatch(/never colours/i);
  });

  it('refuses a palette, pattern or role that does not exist', () => {
    expect(refuse({ ...good(), look: { ...LOOK, palette: 'gone' } })).toMatch(/"gone" is not a palette/i);
    expect(refuse({ ...good(), look: { ...LOOK, pattern: { ...LOOK.pattern, key: 'kente' } } })).toMatch(/"kente" is not a pattern/i);
    expect(refuse({ ...good(), look: { ...LOOK, gradient: { kind: 'linear', stops: ['ground', 'accent2'] } } })).toMatch(/roles/i);
    expect(refuse({ ...good(), look: { ...LOOK, type: 'comic' } })).toMatch(/"comic" is not a type pairing/i);
    expect(refuse({ ...good(), look: 'lagos-sunset' })).toMatch(/look/i);
  });

  /*
   * Gated until the editor can draw it and textNeeds can measure it: a file
   * asking for a gradient headline gets flat ink and a note, not a refusal.
   */
  it('leaves out a gradient headline, with a note', () => {
    const out = accept({ ...good(), look: { ...LOOK, headlineGradient: true } });
    expect(out.template.look).toEqual(LOOK);
    expect(out.template.look?.headlineGradient).toBeUndefined();
    expect(out.notes.join(' ')).toMatch(/gradient headline/i);
  });

  /*
   * The contrast rule at the door. Plain ink over a ground that runs into
   * lagos-sunset's primary and secondary is unreadable small type; the shipped
   * looks are held to this by looks.test, an upload by the validator.
   */
  it('drops a look its words cannot be read on, and keeps the template', () => {
    const unreadable = { ...LOOK, palette: 'lagos-sunset', gradient: { kind: 'linear', stops: ['ground', 'primary', 'secondary'], angle: 160 } };
    const out = accept({ ...good(), look: unreadable });
    expect(out.template.look).toBeUndefined();
    expect(out.template.slots).toHaveLength(3);
    expect(out.notes.join(' ')).toMatch(/look was dropped.*lagos-sunset/i);
  });

  it('drops a look that sets body copy on a display-only role', () => {
    // The eyebrow is body size; `on` a role the palette only reaches 3:1 on it
    // cannot be read, whatever the needs say about the ground.
    const pal = PALETTES.find((p) => displayOnlyRoles(p).length > 0
      && readTemplateUpload({ ...good(), look: { palette: p.key, type: 'editorial' } }).ok);
    expect(pal).toBeTruthy();
    if (!pal) return;
    const role = displayOnlyRoles(pal)[0];
    const raw = good();
    Object.assign(raw.slots[0], { on: role });
    const out = accept({ ...raw, look: { palette: pal.key, type: 'editorial' } });
    expect(out.template.look).toBeUndefined();
  });

  /* A stored row is already in the catalogue: its look can go, the row cannot. */
  it('keeps a stored row whose look no longer reads, without the look', () => {
    const stored = readTemplateUpload({ ...good(), look: { ...LOOK, palette: 'gone' } }, new Set(), { stored: true });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.template.look).toBeUndefined();
    expect(stored.notes.join(' ')).toMatch(/look was dropped.*"gone" is not a palette/i);
    /* The same file uploaded fresh is still refused, with the reason. */
    expect(refuse({ ...good(), look: { ...LOOK, palette: 'gone' } })).toMatch(/"gone" is not a palette/i);
  });

  it('keeps a pattern quiet enough to sit behind words', () => {
    const out = accept({ ...good(), look: { ...LOOK, pattern: { ...LOOK.pattern, opacity: 0.6 } } });
    expect(out.template.look?.pattern?.opacity).toBe(0.12);
    expect(out.notes.join(' ')).toMatch(/0\.12/);
  });
});
