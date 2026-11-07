import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { parseDesignCanvas, resolveTokens } from './designCanvas';

/*
 * Real artboards out of the NowOpen Africa Creative System, not hand-written
 * fixtures. A parser tested only against markup written to suit it is a
 * parser tested against itself.
 */
const read = (name: string) =>
  readFileSync(`src/test/fixtures/creative-system/${name}.dc.html`, 'utf8');

const T01 = read('T01-Bold-Type');
const T15 = read('T15-First-1000');
const MPU = read('C1-MPU');
const CARD = read('F2-Card-Front');

describe('reading a Claude Design artboard', () => {
  it('finds the artboard, its size and its ground', () => {
    const parsed = parseDesignCanvas(T01);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.board.width).toBe(1080);
    expect(parsed.board.height).toBe(1350);
    expect(parsed.board.title).toContain('Bold typographic');
    expect(parsed.board.ink).toBe('#FFFFFF');
  });

  it('reads the levers the author declared', () => {
    const parsed = parseDesignCanvas(T15);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.board.props).sort())
      .toEqual(['comp', 'cta', 'headline', 'kicker', 'number', 'terms']);
    /* $preview is metadata about the frame, not a lever somebody can set. */
    expect(parsed.board.props.$preview).toBeUndefined();
  });

  it('resolves every hole, and says which it could not', () => {
    const parsed = parseDesignCanvas(T01);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.board.html).not.toMatch(/\{\{/);
    expect(parsed.board.html).toContain('Something bigger');
    expect(parsed.board.tokenText.line1).toBe('Something bigger');
  });

  it('leaves an undeclared hole visible rather than blanking it', () => {
    /* "{{price}}" on the canvas names the missing lever; "" hides it. */
    const out = resolveTokens('<p>{{price}} and {{name}}</p>', { name: { editor: 'text', default: 'Ada' } });
    expect(out.html).toBe('<p>{{price}} and Ada</p>');
    expect(out.used).toEqual({ name: 'Ada' });
  });
});

describe('what never reaches the renderer', () => {
  /*
   * The brief these templates come under is explicit: no untrusted HTML or
   * JavaScript executes in the main NowOpen origin. This is the first of the
   * two barriers; the sandboxed frame is the second.
   */
  it('removes scripts, handlers and frames', () => {
    const hostile = T01
      .replace('<x-dc>', '<x-dc><script>fetch("/steal")</script>')
      .replace('<div style="width: 1080px', '<div onclick="alert(1)" style="width: 1080px');
    const parsed = parseDesignCanvas(hostile);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.board.html).not.toMatch(/<script/i);
    expect(parsed.board.html).not.toMatch(/onclick/i);
    expect(parsed.board.html).not.toMatch(/<iframe|<object|<embed/i);
  });

  it('drops the canvas annotation badge instead of importing it as a slot', () => {
    /* "T15 · L1 · D Registration & onboarding" is studio furniture. It has
       ended up in a customer's flyer exactly once too often elsewhere. */
    const parsed = parseDesignCanvas(T15);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.board.html).not.toContain('Registration');
    expect(parsed.board.html).not.toMatch(/<sc-if/i);
  });

  /*
   * A picture keeps its BOX and loses its source. The artwork lives in the
   * design canvas and cannot come across; its place in the composition can,
   * and must — an artboard built around a 760px photograph with the
   * headline beneath it becomes a plain text poster if the box is deleted
   * and everything shuffles up.
   */
  it('keeps the space a picture held, without its unreachable source', () => {
    const parsed = parseDesignCanvas(MPU);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.board.html).not.toMatch(/_blob/);
    expect(parsed.board.html).not.toMatch(/<img/i);
    expect(parsed.board.html).toContain('data-noa-image');
    expect(parsed.board.notes.join(' ')).toMatch(/picture/i);
  });
});

describe('refusing rather than half-importing', () => {
  it('refuses a file that is not an artboard', () => {
    const out = parseDesignCanvas('<html><body><h1>hello</h1></body></html>');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/x-dc/);
  });

  it('refuses an empty file', () => {
    expect(parseDesignCanvas('   ').ok).toBe(false);
  });

  it('refuses a fluid PAGE, which has no fixed canvas', () => {
    const fluid = T01.replace('width: 1080px; height: 1350px;', 'max-width: 1280px;');
    const out = parseDesignCanvas(fluid);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/fixed size/i);
  });

  it('refuses an artboard that repeats or imports at render time', () => {
    /* Whatever happened to be showing would be frozen into the template. */
    const repeating = T01.replace('<x-dc>', '<x-dc><sc-for each="{{rows}}"><span>row</span></sc-for>');
    const out = parseDesignCanvas(repeating);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toMatch(/sc-for/);
  });
});

describe('a print artboard', () => {
  it('reads a business card at its millimetre size', () => {
    const parsed = parseDesignCanvas(CARD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.board.width).toBe(344);
    expect(parsed.board.height).toBe(231);
    /* Light ground, dark ink — the opposite of the social boards. */
    expect(parsed.board.background.toLowerCase()).toContain('#ffffff');
  });
});
