// Validates the 19 Nov - 1 Dec daily Facebook Story batch (build_nov_stories.py) with the exact rules the publisher
// uses, then writes one SQL file that inserts every post as 'in_review'.
// Refuses to write anything if a single caption is blocked.
//
//   npx tsx scripts/social-cards/load_nov_stories.mts
import { readFileSync, writeFileSync } from 'node:fs';
import { checkVariant, isBlocked, isSensitive, lagosLocalToUtc, type ChannelId } from '../../src/lib/brandSocial.ts';
import { formatProblem, type PostFormat } from '../../src/lib/brandPublish.ts';

const dir = '.superpowers/autopilot/nov-stories/';
const posts = JSON.parse(readFileSync(dir + 'posts.json', 'utf8')) as any[];
const SITE = 'https://www.nowopenafrica.com';
const q = (s: string | null) => (s === null ? 'NULL' : `'${s.replace(/'/g, "''")}'`);

let blocked = 0, sensitive = 0, warns = 0;
const problems: string[] = [];
const sql: string[] = ['BEGIN;', "CREATE TEMP TABLE _camp AS SELECT id FROM public.brand_social_campaigns WHERE slug = 'always-on';"];

for (const p of posts) {
  const at = lagosLocalToUtc(`${p.day}T${p.time}`);
  if (!at) throw new Error(`bad time ${p.day} ${p.time}`);
  const dest = p.dest ? SITE + p.dest : null;
  let postSensitive = false;
  for (const [ch, cap] of Object.entries(p.variants as Record<string, string>)) {
    const fmt = (p.formats[ch] ?? 'post') as PostFormat;
    const checks = fmt === 'story' ? [] : checkVariant({ channel: ch as ChannelId, caption: cap, mediaUrl: p.media, destinationUrl: dest });
    if (isBlocked(checks)) { blocked++; problems.push(`${p.day} ${p.time} ${ch}: ${checks.filter((c) => c.severity === 'block').map((c) => c.code).join(',')}`); }
    if (isSensitive(checks)) { sensitive++; postSensitive = true; problems.push(`SENSITIVE ${p.day} ${p.time} ${ch}: ${checks.filter((c) => c.severity === 'sensitive').map((c) => c.code).join(',')}`); }
    warns += checks.filter((c) => c.severity === 'warn').length;
    if (ch === 'facebook' || ch === 'instagram' || ch === 'threads') {
      const fp = formatProblem(ch, fmt, p.media ? [p.media] : []);
      if (fp && !(ch === 'facebook' && fmt === 'post')) { blocked++; problems.push(`${p.day} ${p.time} ${ch} format: ${fp}`); }
    }
  }
  const id = crypto.randomUUID();
  sql.push(`INSERT INTO public.brand_social_content (id, campaign_id, pillar, audience, objective, hook, caption, media_url, cta, destination_url, evidence, sensitive, planned_at, status, review_note, origin) VALUES (`
    + `'${id}', (SELECT id FROM _camp), ${q(p.pillar)}, ${q(p.audience)}, ${q(p.objective)}, ${q(p.hook)}, ${q(p.caption)}, ${q(p.media)}, ${q(p.cta)}, ${q(dest)}, `
    + `'Written by Claude (Claude Code) 2026-11-18; every card points at a feature checked live on www.nowopenafrica.com that day. No numbers, partners, prices or quotes. Card art rendered by render_cards.py (no placeholders possible).', `
    + `${postSensitive}, '${at}', 'in_review', 'November story batch, written 2026-11-18. Check the card and approve.', 'ai');`);
  for (const [ch, cap] of Object.entries(p.variants as Record<string, string>)) {
    sql.push(`INSERT INTO public.brand_social_variants (content_id, channel, caption, format) VALUES ('${id}', ${q(ch)}, ${q(cap)}, ${q(p.formats[ch] ?? 'post')});`);
  }
}
sql.push("SELECT json_build_object('inserted', (SELECT count(*) FROM brand_social_content WHERE review_note LIKE 'November story batch%'), 'variants', (SELECT count(*) FROM brand_social_variants v JOIN brand_social_content c ON c.id = v.content_id WHERE c.review_note LIKE 'November story batch%')) AS s;");
sql.push('COMMIT;');

console.log(`posts=${posts.length} blocked=${blocked} sensitive=${sensitive} warns=${warns}`);
for (const pr of problems.slice(0, 40)) console.log('  ' + pr);
if (blocked) { console.log('NOT WRITTEN: fix the blocked captions first.'); process.exit(1); }
writeFileSync(dir + 'load.sql', sql.join('\n'));
console.log('wrote ' + dir + 'load.sql');
