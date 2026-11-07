import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * No category renderer may state an operational promise as a fact.
 *
 * WHY THIS TEST EXISTS
 *
 * Three were found in one afternoon, all the same shape — a capability chip
 * rendered unconditionally against live data:
 *
 *   HealthCenter      "24/7 Emergency", "Video consultation", "Laboratory"
 *                     on 1,654 hospital listings (NOA-029)
 *   ServiceProviders  "Emergency call", "Available now", "Live ETA on the way"
 *                     on 190 professional-services listings
 *   RetailStorefront  "Same-day delivery", "Cut / packed to order"
 *
 * Every one of those phrases is on the enrichment engine's forbidden-claims
 * list. The generator could not have produced them; the UI simply asserted
 * them. That asymmetry — holding generated text to a standard the hand-written
 * components escape — is what this test closes.
 *
 * WHAT COUNTS AS SAFE
 *
 * The phrase may appear if it is CONDITIONAL: inside a `{flag && …}` or a
 * ternary, so some piece of data decides it. `RepairShop` is the model — its
 * "Warranty" step renders only under `{showProcess && …}`, and the call site
 * passes `isSample`.
 */

const DIR = 'src/components';

/**
 * Operational promises: things a business does, guarantees or is certified for.
 *
 * Deliberately narrow. Words like "verified" and "confirmed" are absent because
 * the codebase uses them constantly to say the OPPOSITE ("Not yet verified",
 * "Hours not confirmed"), and a test that cried wolf on those would be muted —
 * which is how a guard stops guarding.
 */
const CLAIMS: readonly string[] = [
  '24/7 Emergency',
  'Emergency call',
  'Same-day delivery',
  'Free delivery',
  'Nationwide delivery',
  'Available now',
  'Live ETA',
  'Money-back',
  'Free diagnosis',
  'Award-winning',
];

function isConditional(line: string, prev: string[]): boolean {
  // The claim itself, or any of the three rendered lines above it, opening a guard.
  const window = [...prev.slice(-3), line].join(' ');
  return /\{\s*[A-Za-z0-9_.!?]+\s*&&/.test(window)
    || /\?\s*\(/.test(window)
    || /\{\s*[A-Za-z0-9_.]+\s*\?/.test(window);
}

/**
 * Strip comments and object-literal definitions, keeping only lines that render.
 *
 * Both exclusions are load-bearing:
 *   - the comments in these files EXPLAIN the banned phrases, quoting them, so
 *     a naive scan flags the very notes that document the fix;
 *   - a phrase inside a `const STEPS = [...]` becomes visible only where that
 *     const is rendered, and RepairShop renders its under `{showProcess && …}`.
 *     Judging the definition rather than the render site blames the wrong line.
 */
function renderableLines(src: string): Array<{ line: string; index: number }> {
  const out: Array<{ line: string; index: number }> = [];
  let inBlockComment = false;

  src.split('\n').forEach((raw, i) => {
    let line = raw;

    if (inBlockComment) {
      const close = line.indexOf('*/');
      if (close === -1) return;
      line = line.slice(close + 2);
      inBlockComment = false;
    }

    // Opening a block comment, including the JSX `{/* … */}` form.
    for (;;) {
      const open = line.indexOf('/*');
      if (open === -1) break;
      const close = line.indexOf('*/', open + 2);
      if (close === -1) { line = line.slice(0, open); inBlockComment = true; break; }
      line = line.slice(0, open) + line.slice(close + 2);
    }

    const lineComment = line.indexOf('//');
    if (lineComment !== -1) line = line.slice(0, lineComment);

    if (!line.trim()) return;
    // An object-literal entry is a definition, not a render.
    if (/^\s*\{?\s*(icon|label|key|title|name)\s*:/.test(line) && !line.includes('<')) return;

    out.push({ line, index: i });
  });

  return out;
}

describe('category renderers never assert an operational promise', () => {
  it('states no capability that no data supports', () => {
    const offenders: string[] = [];

    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))) {
      const rendered = renderableLines(readFileSync(`${DIR}/${file}`, 'utf8'));
      rendered.forEach(({ line, index }, pos) => {
        for (const claim of CLAIMS) {
          if (!line.includes(claim)) continue;
          const prev = rendered.slice(Math.max(0, pos - 3), pos).map((x) => x.line);
          if (isConditional(line, prev)) return;
          offenders.push(`${file}:${index + 1} "${claim}" ${line.trim().slice(0, 70)}`);
          return;
        }
      });
    }

    const hint = [
      'These state an operational promise unconditionally, about real businesses',
      'that have never seen the page. Gate it on data (see HealthCenter',
      'confirmed24h) or remove it:',
      ...offenders,
    ].join(' | ');

    expect(offenders, hint).toEqual([]);
  });

  it('still recognises a genuine violation', () => {
    /*
     * A guard nobody has tested is a guard nobody can trust. This proves the
     * detector fires on the exact shape that shipped, rather than passing
     * because the regex quietly matches nothing.
     */
    const bad = '          <Siren size={18} /> Emergency call';
    expect(CLAIMS.some((c) => bad.includes(c))).toBe(true);
    expect(isConditional(bad, ['<div className="flex">'])).toBe(false);
  });

  it('accepts the same claim when data decides it', () => {
    const good = '            <Ambulance size={18} /> 24/7 Emergency';
    const context = ['{hasPhone && (', '  confirmed24h ? (', '    <a href={`tel:${phone}`}>'];
    expect(isConditional(good, context)).toBe(true);
  });

  it('does not flag a phrase that only appears in a comment', () => {
    const src = [
      '/* "Same-day delivery" used to render here unconditionally. */',
      '<div>Shop</div>',
    ].join('\n');
    const lines = renderableLines(src).map((x) => x.line).join(' ');
    expect(lines.includes('Same-day delivery')).toBe(false);
  });
});
