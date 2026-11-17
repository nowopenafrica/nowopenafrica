// Stand-in for the Supabase REST API, for e2e.sh only. Answers table reads and
// RPC calls from a local Postgres, always acting as the seeded admin.
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const TABLES = new Set(['design_templates', 'design_template_collections']);
const FUNCTIONS = new Set(['import_template_collection', 'review_template', 'publish_template_collection', 'unpublish_template']);

function sql(statement) {
  const out = spawnSync('psql', ['-h', '127.0.0.1', '-p', process.env.PGPORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-qAt'], {
    input: `SET test.uid = '${ADMIN}';\n${statement};\n`, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
  });
  if (out.status !== 0) throw new Error((/ERROR:\s*(.*)/.exec(out.stderr)?.[1] ?? out.stderr).trim());
  return out.stdout.trim();
}

const literal = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error(`bad identifier ${s}`); return s; };

createServer((req, res) => {
  const send = (status, body) => {
    res.writeHead(status, {
      'content-type': 'application/json', 'access-control-allow-origin': '*',
      'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return send(200, {});
  const url = new URL(req.url, 'http://x');
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    try {
      const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(url.pathname)?.[1];
      const table = /^\/rest\/v1\/(\w+)$/.exec(url.pathname)?.[1];
      if (rpc && FUNCTIONS.has(rpc)) {
        const args = Object.entries(JSON.parse(raw || '{}')).map(([k, v]) => `${ident(k)} => ${literal(v)}`).join(', ');
        return send(200, JSON.parse(sql(`SELECT to_json(public.${rpc}(${args}))`) || 'null'));
      }
      if (table && TABLES.has(table) && req.method === 'GET') {
        const cols = (url.searchParams.get('select') ?? '*').split(',').map((c) => ident(c.trim())).join(', ');
        const where = url.searchParams.get('published') === 'eq.true' ? 'WHERE published' : '';
        const [col, dir] = (url.searchParams.get('order') ?? 'id.asc').split('.');
        return send(200, JSON.parse(sql(`SELECT coalesce(json_agg(t), '[]'::json) FROM (SELECT ${cols} FROM public.${table} ${where} ORDER BY ${ident(col)} ${dir === 'desc' ? 'DESC' : 'ASC'}) t`)));
      }
      // Everything else the app asks for at start-up: no data, no session.
      return send(200, url.pathname.startsWith('/auth/') ? {} : []);
    } catch (err) {
      return send(400, { message: err.message });
    }
  });
}).listen(Number(process.env.SHIM_PORT), '127.0.0.1');
