import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/*
 * Every sendEmail call must pass (to, subject, html).
 *
 * MEASURED 2026-10-10: send-onboarding called `sendEmail(email, html)` — two
 * arguments to a three-argument function. The whole rendered document went
 * into the SUBJECT and the body was left undefined, so the branded brand-kit
 * welcome (gradient header, logo, starter-pack cards) never arrived as
 * designed. What owners received was not an official NowOpen Africa message.
 *
 * A compiler catches this in a second, and ours does not look: the function
 * entrypoints are excluded from tsconfig.edge.json, and Supabase deploys them
 * with esbuild, which strips types rather than checking them. Extending that
 * config surfaces 69 pre-existing errors across 18 functions — worth doing,
 * too large to attach to a bug fix — so until then this guards the one call
 * shape that has already shipped broken.
 */
const FN_DIR = join(process.cwd(), 'supabase', 'functions');

/*
 * Comments are prose, not calls.
 *
 * The first run of this test failed on the comment written directly above the
 * FIXED call, because that comment quotes the broken call it describes. A
 * scanner that cannot tell code from commentary reports the documentation as
 * the defect.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

function edgeSources(): Array<{ name: string; code: string }> {
  if (!existsSync(FN_DIR)) return [];
  const out: Array<{ name: string; code: string }> = [];
  for (const entry of readdirSync(FN_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(FN_DIR, entry.name, 'index.ts');
    if (existsSync(file)) out.push({ name: entry.name, code: stripComments(readFileSync(file, 'utf8')) });
  }
  return out;
}

/** Split a call's argument list on top-level commas only. */
function topLevelArgCount(args: string): number {
  let depth = 0;
  let count = 1;
  for (let i = 0; i < args.length; i += 1) {
    const c = args[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) count += 1;
  }
  return args.trim() === '' ? 0 : count;
}

/** The text between the call's own parentheses. */
function callArgs(code: string, start: number): string {
  let depth = 0;
  for (let i = start; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(start + 1, i);
    }
  }
  return '';
}

describe('edge functions send email with a real subject and a real body', () => {
  it('finds the edge functions at all', () => {
    expect(edgeSources().length).toBeGreaterThan(5);
  });

  it('never calls sendEmail with fewer than three arguments', () => {
    const wrong: string[] = [];
    for (const { name, code } of edgeSources()) {
      const re = /\bsendEmail\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const open = m.index + m[0].length - 1;
        const n = topLevelArgCount(callArgs(code, open));
        if (n < 3) wrong.push(`${name}: sendEmail(...) got ${n} argument(s), needs (to, subject, html)`);
      }
    }
    expect(wrong).toEqual([]);
  });
});
