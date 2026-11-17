// Concepts lab: a local page for looking at what the composition engine makes.
//
// DEVELOPMENT ONLY. It is served by `vite dev` at /lab/concepts.html and is not
// an entry in the production build. It reads nothing from the database and
// saves nothing. Photographs come from a local folder served on another port
// (?assets=http://127.0.0.1:5197), so licensed files never enter the repo.

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { BrowserRouter } from 'react-router-dom';

import '../index.css';
import BriefPanel from '../components/create/BriefPanel';
import ConceptPanel from '../components/create/ConceptPanel';
import { AuthProvider } from '../contexts/AuthContext';
import DesignSurface from '../components/studio/DesignSurface';
import { readBrief } from '../lib/create/brief';
import { BENCHMARK } from '../lib/create/compose/benchmark';
import { conceptsFor, distinctnessProblems, documentFor } from '../lib/create/compose/concepts';
import { IMPLEMENTED, compose } from '../lib/create/compose/archetypes';
import { ARCHETYPES, archetypeOf, movementOf } from '../lib/create/intel';
import { PALETTES } from '../lib/design/palettes';
import { formatOf } from '../lib/design/formats';
import { paletteOf } from '../lib/design/palettes';
import { TYPEFACES, ensureTypefacesReady } from '../lib/design/typefaces';
import { faceUse } from '../lib/create/intel';

const params = new URLSearchParams(location.search);
const assets = params.get('assets');
const formatOverride = params.get('format') ?? undefined;
const only = params.get('brief');
/* ?types=portrait (or any format key): every composition type on one copy, to review the types themselves. */
const types = params.get('types');
const typeKeys = params.get('only')?.split(',');
/* ?shot=b1-2 (or type-collage-layered): that one render and nothing else, flush to the corner, for a clean capture. */
const shot = params.get('shot');
/* ?panel=<request>: Create's own brief and concept panels for that request, as a customer would see them. Read only. */
const panel = params.get('panel');
/* ?faces=1: a specimen of every face, with the job each is for. ?faces=core or =extended shows one tier. */
const faces = params.get('faces');
const hidden = (key: string) => (shot && shot !== key ? { display: 'none' } : {});

function Lab() {
  const [ready, setReady] = useState(false);
  /* The specimen names every face, so it asks for every face; the other views warm the core set and let the rest arrive when drawn. */
  useEffect(() => { void ensureTypefacesReady(faces ? TYPEFACES.map((f) => f.key) : undefined).then(() => setReady(true)); }, []);

  return (
    <main data-ready={ready || undefined} data-shot={shot || undefined} style={{ padding: shot ? 0 : 24, background: '#e9ecf1', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif', color: '#0f1729' }}>
      {shot && <style>{'[data-shot] h1,[data-shot] h2,[data-shot] p,[data-shot] figcaption{display:none}[data-shot] section{margin:0!important}'}</style>}
      <h1 style={{ fontFamily: 'Coolvetica, sans-serif', fontSize: 28, margin: '0 0 4px' }}>Concepts lab</h1>
      <p style={{ margin: '0 0 24px', fontSize: 13 }}>
        Development only. {assets ? `Photos from ${assets}.` : 'No photo folder given: every concept is type-led.'}
      </p>
      {panel && (
        <BrowserRouter><AuthProvider>
          <div style={{ maxWidth: Number(params.get('width')) || 1040 }}>
            <BriefPanel brief={readBrief(panel)} onAnswer={() => {}} />
            <ConceptPanel brief={readBrief(panel)} />
          </div>
        </AuthProvider></BrowserRouter>
      )}
      {faces && <Faces />}
      {types && !panel && !faces && <Types />}
      {!types && !panel && !faces && BENCHMARK.filter((b) => (!only || b.key === only) && (!shot || shot.startsWith(b.key))).map((b) => {
        const brief = readBrief(b.request);
        const images = b.photos.map((p) => (assets && p ? `${assets}/${p}` : undefined));
        const concepts = conceptsFor(brief, { copy: b.copy, images });
        const problems = distinctnessProblems(concepts);
        return (
          <section key={b.key} data-brief={b.key} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 2px' }}>{b.request}</h2>
            <p data-distinct={problems.length === 0} style={{ margin: '0 0 12px', fontSize: 12, color: problems.length ? '#b42318' : '#556178' }}>
              {problems.length ? problems.join('; ') : 'Three distinct concepts'}
            </p>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {concepts.map((c) => {
                const doc = documentFor(c, brief, formatOverride);
                const page = doc.pages[0];
                const wide = page.width / page.height > 1.2;
                return (
                  <figure key={c.n} style={{ margin: 0, width: wide ? 760 : 420, ...hidden(`${b.key}-${c.n}`) }}>
                    <div data-concept={`${b.key}-${c.n}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}>
                      <DesignSurface page={page} accent={paletteOf(c.palette)?.colours.primary ?? '#2563eb'} />
                    </div>
                    <figcaption data-caption={`${b.key}-${c.n}`} style={{ fontSize: 12, marginTop: 8, lineHeight: 1.4 }}>
                      <b>{movementOf(c.movement)?.name}</b> · {archetypeOf(c.archetype).name} · {c.pairing} · {paletteOf(c.palette)?.name}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

const SAMPLE: Record<string, string> = { classical: 'ADEBAYO & DAUGHTERS', condensed: 'Opens Saturday', script: 'With love', handwritten: 'Fresh today', retro: 'Sweet days' };

function Faces() {
  const list = TYPEFACES.filter((f) => f.key !== 'coolvetica' && (faces === '1' || (f.tier ?? 'core') === faces));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14, maxWidth: 1420 }}>
      {list.map((f) => {
        const u = faceUse(f.key);
        const weight = f.weights[f.weights.length - 1];
        const tags = [u.smallest === 'small' ? 'small print' : u.smallest === 'text' ? 'text and up' : 'headlines only', u.capitals === 'only' ? 'capitals only' : u.capitals === 'never' ? 'never capitals' : null,
          u.paragraphs ? 'paragraphs' : null, u.distance ? 'road' : null, u.figures ? 'figures' : null, u.maxWords ? `${u.maxWords} words` : null].filter(Boolean);
        return (
          <div key={f.key} data-face={f.key} style={{ background: '#fff', borderRadius: 6, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}>
            <div style={{ fontSize: 11, color: '#566076', display: 'flex', justifyContent: 'space-between' }}><span><b style={{ color: '#0f1729' }}>{f.label}</b> · {f.key}</span><span>{f.tier === 'extended' ? 'when used' : 'always'}</span></div>
            <div style={{ fontFamily: f.stack, fontWeight: weight, fontSize: 38, lineHeight: 1.08, margin: '10px 0 6px', color: '#0f1729' }}>{SAMPLE[f.key] ?? 'Pull up a chair.'}</div>
            <div style={{ fontFamily: f.stack, fontWeight: f.weights[0], fontSize: 15, lineHeight: 1.35, color: '#0f1729' }}>A kitchen that cooks the way it would for family. 0123456789</div>
            <div style={{ fontFamily: f.stack, fontWeight: f.weights[0], fontSize: 15, lineHeight: 1.35, color: '#0f1729' }}>₦ ₵ · Ẹ ọ ṣ · Ɓ ɗ Ƙ ƙ Ƴ ƴ · Ɛ ɔ Ɖ Ʋ Ƒ</div>
            <div style={{ fontSize: 11, color: '#566076', marginTop: 8 }}>{tags.join(' · ')}</div>
          </div>
        );
      })}
    </div>
  );
}

const SIZES: Record<string, { w: number; h: number }> = { portrait: { w: 1080, h: 1350 }, square: { w: 1080, h: 1080 }, tall: { w: 1080, h: 1920 }, landscape: { w: 1754, h: 1240 }, wide: { w: 4500, h: 1500 } };

function Types() {
  /* A real format key (business-card, billboard) is composed to that format's own rules; a shape name is a bare canvas. */
  const format = formatOf(types ?? '') ?? SIZES[types ?? 'portrait'] ?? SIZES.portrait;
  const distance = /^(billboard|board-)/.test(types ?? '');
  const wide = format.w / format.h > 1.2;
  const b = BENCHMARK[4];
  const photos = ['pexels-17952748.jpeg', 'pexels-28635266.jpeg', 'pexels-18789516.jpeg', 'pexels-38127716.jpeg'];
  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {ARCHETYPES.filter((a) => IMPLEMENTED.includes(a.key) && (!typeKeys || typeKeys.includes(a.key))).map((a, k) => {
        const palette = PALETTES[(k * 5) % PALETTES.length];
        const copy = { brand: 'Your brand', headline: 'Now open.', ...b.copy[k % 3], details: ['Opening: Your opening date', 'Where: Your address', 'Book: Your booking line'] };
        const doc = compose(a.key, { copy, colours: palette.colours, fonts: { display: 'grotesk', text: 'humanist', accent: 'mono' }, image: assets ? `${assets}/${photos[k % photos.length]}` : 'missing' }, format, a.name, { distance });
        return (
          <figure key={a.key} style={{ margin: 0, width: wide ? 760 : 420, ...hidden(`type-${a.key}`) }}>
            <div data-concept={`type-${a.key}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}>
              <DesignSurface page={doc.pages[0]} accent={palette.colours.primary} />
            </div>
            <figcaption style={{ fontSize: 12, marginTop: 8 }}><b>{a.name}</b> · {palette.name}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/** Text boxes whose words do not fit: the check a structural test cannot make. */
function audit(): { concept: string; name: string; text: string; over: string }[] {
  const out: { concept: string; name: string; text: string; over: string }[] = [];
  document.querySelectorAll<HTMLElement>('[data-concept]').forEach((box) => {
    box.querySelectorAll<HTMLElement>('[data-object-id]').forEach((el) => {
      if (el.tagName === 'IMG' || !el.textContent) return;
      const v = el.scrollHeight - el.clientHeight;
      const h = el.scrollWidth - el.clientWidth;
      if (v > 1 || h > 1) out.push({ concept: box.dataset.concept ?? '', name: el.textContent.slice(0, 28), text: el.textContent, over: `${h > 1 ? `${h}px wide ` : ''}${v > 1 ? `${v}px tall` : ''}`.trim() });
    });
    box.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      if (img.complete && img.naturalWidth === 0) out.push({ concept: box.dataset.concept ?? '', name: 'image', text: img.src, over: 'failed to load' });
    });
  });
  return out;
}

(window as unknown as { __lab: unknown }).__lab = { audit };

createRoot(document.getElementById('root') as HTMLElement).render(<Lab />);
