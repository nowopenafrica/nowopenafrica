import { describe, it, expect } from 'vitest';

import {
  defaultSizePt, documentFromPptx, importPptx, placeholderKey, pptxSummary, readRels, resolvePart,
  relsPart,
  type PptxImport,
} from './importPptx';

const parse = (text: string) => new DOMParser().parseFromString(text, 'application/xml');

/* ── a deck written out by hand ────────────────────────────────────────────
 *
 * Every part a real .pptx has, small enough to read. The point of writing it
 * out rather than checking in a binary fixture is that the inheritance chain
 * — slide, layout, master, theme — is visible, and it is the chain that this
 * importer exists to walk.
 */

const NS = 'xmlns:p="p" xmlns:a="a" xmlns:r="r"';
const EMU_W = 12192000; /* 13.333in */
const EMU_H = 6858000;  /* 7.5in */

const PRESENTATION = `<p:presentation ${NS}>
  <p:sldIdLst>
    <p:sldId id="258" r:id="rIdB"/>
    <p:sldId id="256" r:id="rIdA"/>
  </p:sldIdLst>
  <p:sldSz cx="${EMU_W}" cy="${EMU_H}"/>
</p:presentation>`;

const PRESENTATION_RELS = `<Relationships>
  <Relationship Id="rIdA" Target="slides/slide1.xml"/>
  <Relationship Id="rIdB" Target="slides/slide2.xml"/>
  <Relationship Id="rIdT" Target="theme/theme1.xml"/>
</Relationships>`;

/* The title carries NO xfrm — exactly as PowerPoint writes it. */
const SLIDE1 = `<p:sld ${NS}><p:cSld><p:spTree>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
    <p:spPr/>
    <p:txBody><a:p><a:pPr algn="ctr"/><a:r>
      <a:rPr sz="4000" b="1"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:rPr>
      <a:t>Opening Night</a:t>
    </a:r></a:p></p:txBody>
  </p:sp>
  <p:sp>
    <p:nvSpPr><p:nvPr/></p:nvSpPr>
    <p:spPr>
      <a:xfrm rot="2700000"><a:off x="914400" y="457200"/><a:ext cx="3048000" cy="1524000"/></a:xfrm>
      <a:prstGeom prst="roundRect"/>
      <a:solidFill><a:srgbClr val="0A7D4B"/></a:solidFill>
    </p:spPr>
    <p:txBody><a:p/></p:txBody>
  </p:sp>
  <p:pic>
    <p:nvPicPr><p:nvPr/></p:nvPicPr>
    <p:blipFill><a:blip r:embed="rId9"/></p:blipFill>
    <p:spPr><a:xfrm><a:off x="6096000" y="0"/><a:ext cx="6096000" cy="6858000"/></a:xfrm></p:spPr>
  </p:pic>
  <p:graphicFrame><a:graphic/></p:graphicFrame>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="ftr" idx="11"/></p:nvPr></p:nvSpPr>
    <p:spPr/>
    <p:txBody><a:p><a:r><a:t>Nothing anchors this</a:t></a:r></a:p></p:txBody>
  </p:sp>
</p:spTree></p:cSld></p:sld>`;

const SLIDE1_RELS = `<Relationships>
  <Relationship Id="rId1" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId9" Target="../media/image1.png"/>
  <Relationship Id="rIdX" Target="https://example.test/remote.png" TargetMode="External"/>
</Relationships>`;

const SLIDE2 = `<p:sld ${NS}><p:cSld>
  <p:bg><p:bgPr><a:solidFill><a:srgbClr val="101014"/></a:solidFill></p:bgPr></p:bg>
  <p:spTree>
    <p:sp>
      <p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:spPr/>
      <p:txBody>
        <a:p><a:r><a:t>Doors at seven</a:t></a:r></a:p>
        <a:p><a:r><a:t>Kitchen until ten</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree>
</p:cSld></p:sld>`;

const SLIDE2_RELS = `<Relationships>
  <Relationship Id="rId1" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

const LAYOUT = `<p:sldLayout ${NS}><p:cSld><p:spTree>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="1219200" y="685800"/><a:ext cx="9753600" cy="1371600"/></a:xfrm></p:spPr>
  </p:sp>
  <p:sp>
    <p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="1219200" y="2743200"/><a:ext cx="9753600" cy="2743200"/></a:xfrm></p:spPr>
  </p:sp>
</p:spTree></p:cSld></p:sldLayout>`;

const LAYOUT_RELS = `<Relationships>
  <Relationship Id="rId1" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`;

const MASTER = `<p:sldMaster ${NS}>
  <p:clrMap bg1="lt1" tx1="dk2" bg2="lt2" tx2="dk1" accent1="accent1"/>
  <p:cSld><p:spTree/></p:cSld>
</p:sldMaster>`;

const MASTER_RELS = `<Relationships>
  <Relationship Id="rId1" Target="../theme/theme1.xml"/>
</Relationships>`;

const THEME = `<a:theme ${NS}><a:themeElements><a:clrScheme name="Office">
  <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
  <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
  <a:dk2><a:srgbClr val="1F3864"/></a:dk2>
  <a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>
  <a:accent1><a:srgbClr val="4472C4"/></a:accent1>
</a:clrScheme></a:themeElements></a:theme>`;

const deck = (over: Record<string, string> = {}) => new Map(Object.entries({
  'ppt/presentation.xml': PRESENTATION,
  'ppt/_rels/presentation.xml.rels': PRESENTATION_RELS,
  'ppt/slides/slide1.xml': SLIDE1,
  'ppt/slides/_rels/slide1.xml.rels': SLIDE1_RELS,
  'ppt/slides/slide2.xml': SLIDE2,
  'ppt/slides/_rels/slide2.xml.rels': SLIDE2_RELS,
  'ppt/slideLayouts/slideLayout1.xml': LAYOUT,
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels': LAYOUT_RELS,
  'ppt/slideMasters/slideMaster1.xml': MASTER,
  'ppt/slideMasters/_rels/slideMaster1.xml.rels': MASTER_RELS,
  'ppt/theme/theme1.xml': THEME,
  ...over,
}));

const run = (over?: Record<string, string>) => importPptx(deck(over), parse) as PptxImport;
const textOn = (r: PptxImport, page: number, words: string) =>
  r.pages[page].objects.find((o) => o.type === 'text' && (o as { text: string }).text.includes(words));

describe('finding the parts', () => {
  it('resolves a relative target against the part that referenced it', () => {
    expect(resolvePart('ppt/slides/slide1.xml', '../slideLayouts/slideLayout1.xml'))
      .toBe('ppt/slideLayouts/slideLayout1.xml');
    expect(resolvePart('ppt/slides/slide1.xml', '../media/image1.png')).toBe('ppt/media/image1.png');
    expect(resolvePart('ppt/presentation.xml', 'slides/slide1.xml')).toBe('ppt/slides/slide1.xml');
  });

  it('knows where a part keeps its relationships', () => {
    expect(relsPart('ppt/slides/slide1.xml')).toBe('ppt/slides/_rels/slide1.xml.rels');
  });

  /*
   * An external relationship points at a URL. Resolving one as a path invents
   * a part name; following one would make an opened document fetch from
   * wherever the file says.
   */
  it('leaves external relationships out', () => {
    const rels = readRels(parse(SLIDE1_RELS), 'ppt/slides/slide1.xml');
    expect(rels.get('rId9')).toBe('ppt/media/image1.png');
    expect(rels.has('rIdX')).toBe(false);
  });
});

describe('the page', () => {
  it('is the slide size, in pixels', () => {
    /* 13.333in x 7.5in at 96dpi. */
    expect(run().pages[0]).toMatchObject({ width: 1280, height: 720 });
  });

  it('follows the order the presentation declares, not the file names', () => {
    /* sldIdLst puts slide2 first. A deck reordered in PowerPoint keeps its
     * original file names, so sorting by name shows the wrong order. */
    expect(textOn(run(), 0, 'Doors at seven')).toBeTruthy();
    expect(textOn(run(), 1, 'Opening Night')).toBeTruthy();
  });

  it('takes the background colour the slide declares', () => {
    expect(run().pages[0].background).toBe('#101014');
  });
});

describe('text', () => {
  it('comes across with its words', () => {
    const title = textOn(run(), 1, 'Opening Night') as { text: string };
    expect(title.text).toBe('Opening Night');
  });

  it('joins the paragraphs of one frame', () => {
    const body = textOn(run(), 0, 'Doors') as { text: string };
    expect(body.text).toBe('Doors at seven\nKitchen until ten');
  });

  it('keeps the point size, as a share of the page width', () => {
    /* 40pt of a 13.333in slide: 40/72 inches over 13.333 inches. */
    const title = textOn(run(), 1, 'Opening') as { size: number };
    expect(title.size).toBeCloseTo((40 / 72) / (12192000 / 914400), 5);
  });

  it('keeps weight and alignment', () => {
    expect(textOn(run(), 1, 'Opening')).toMatchObject({ weight: 700, align: 'center' });
  });

  /*
   * ── THE LOOKUP THAT IS NOT A COLOUR ──────────────────────────────────
   *
   * `<a:schemeClr val="tx1"/>` means "whatever tx1 maps to". This master
   * deliberately maps tx1 to dk2, not the usual dk1, so a reader that skips
   * the colour map returns black and looks right by accident.
   */
  it('resolves a scheme colour through the master map into the theme', () => {
    expect(textOn(run(), 1, 'Opening')).toMatchObject({ colour: '#1F3864' });
  });
});

describe('geometry', () => {
  /*
   * ── THE ONE THAT MATTERS ─────────────────────────────────────────────
   *
   * A title typed into the title box has no position of its own. An importer
   * that only reads the slide finds nothing and imports an empty page.
   */
  it('inherits a placeholder box from the slide layout', () => {
    const title = textOn(run(), 1, 'Opening') as { x: number; y: number; w: number };
    expect(title.x).toBeCloseTo(1219200 / EMU_W, 5);
    expect(title.y).toBeCloseTo(685800 / EMU_H, 5);
    expect(title.w).toBeCloseTo(9753600 / EMU_W, 5);
  });

  it('prefers the shape\'s own box when it has one', () => {
    const shape = run().pages[1].objects.find((o) => o.type === 'shape');
    expect(shape).toMatchObject({ x: 914400 / EMU_W, y: 457200 / EMU_H });
  });

  it('reads rotation out of sixty-thousandths of a degree', () => {
    expect(run().pages[1].objects.find((o) => o.type === 'shape')?.rotation).toBe(45);
  });

  it('counts a shape it cannot place rather than guessing a position', () => {
    /* The footer placeholder exists on no layout here. */
    const r = run();
    expect(r.unplaced).toBe(1);
    expect(textOn(r, 1, 'Nothing anchors this')).toBeUndefined();
  });
});

describe('shapes and pictures', () => {
  it('turns a preset rectangle into a shape with its fill', () => {
    expect(run().pages[1].objects.find((o) => o.type === 'shape'))
      .toMatchObject({ shape: 'rect', fill: '#0A7D4B' });
  });

  it('resolves a picture to the part holding its bytes', () => {
    const page = run().pages[1];
    expect(page.pictures).toHaveLength(1);
    expect(page.pictures[0].part).toBe('ppt/media/image1.png');
    expect(page.objects.some((o) => o.id === page.pictures[0].objectId)).toBe(true);
  });

  /*
   * There is no chart or table in this document model. Counting them is the
   * difference between an honest import and a slide that quietly lost its
   * numbers.
   */
  it('counts a chart or table instead of approximating one', () => {
    expect(run().unsupported).toBeGreaterThanOrEqual(1);
  });
});

describe('refusals', () => {
  it('refuses a file with no presentation part', () => {
    expect(importPptx(new Map([['ppt/slides/slide1.xml', SLIDE1]]), parse)).toHaveProperty('error');
  });

  it('refuses a presentation with no slides', () => {
    const only = new Map([['ppt/presentation.xml', `<p:presentation ${NS}><p:sldSz cx="${EMU_W}" cy="${EMU_H}"/></p:presentation>`]]);
    expect(importPptx(only, parse)).toHaveProperty('error');
  });

  it('refuses damaged XML rather than importing half a deck', () => {
    expect(importPptx(new Map([['ppt/presentation.xml', '<p:presentation']]), parse)).toHaveProperty('error');
  });
});

describe('what the user is told', () => {
  it('says how much came across and what did not', () => {
    const summary = pptxSummary(run());
    expect(summary).toMatch(/2 slides imported/);
    expect(summary).toMatch(/editable objects/);
    expect(summary).toMatch(/had no position to read/);
  });
});

describe('assembling the document', () => {
  const build = (assets: Map<string, string>) => documentFromPptx(run(), assets, 'Autumn menu');

  it('becomes one page per slide, in order, at the slide size', () => {
    const { doc } = build(new Map());
    expect(doc.pages.map((p) => p.name)).toEqual(['Slide 1', 'Slide 2']);
    expect(doc.pages[0]).toMatchObject({ width: 1280, height: 720 });
    expect(doc.title).toBe('Autumn menu');
  });

  it('attaches the uploaded asset to the picture it belongs to', () => {
    const r = run();
    const { objectId: id } = r.pages[1].pictures[0];
    const { doc } = documentFromPptx(r, new Map([[id, 'designs/u/1.png']]), 'x');
    expect(doc.pages[1].objects.find((o) => o.id === id)).toMatchObject({ assetId: 'designs/u/1.png' });
  });

  /*
   * PowerPoint still emits EMF and WMF, which no browser draws. An image
   * object pointing at nothing is a broken box the user cannot fix, so the
   * object goes and the count tells them why.
   */
  it('removes a picture whose bytes never arrived, and says how many', () => {
    const { doc, droppedPictures } = build(new Map());
    expect(droppedPictures).toBe(1);
    expect(doc.pages.flatMap((p) => p.objects).some((o) => o.type === 'image')).toBe(false);
  });

  it('carries the slide background onto the page', () => {
    expect(build(new Map()).doc.pages[0].background).toBe('#101014');
  });
});

describe('inherited sizes', () => {
  it('uses the role\'s own default rather than body size for a title', () => {
    expect(defaultSizePt('title:')).toBe(44);
    expect(defaultSizePt('body:1')).toBe(18);
    expect(defaultSizePt(null)).toBe(18);
  });

  it('keys a placeholder on its type and index together', () => {
    const ph = parse('<p:ph xmlns:p="p" type="body" idx="2"/>').documentElement;
    expect(placeholderKey(ph)).toBe('body:2');
  });
});
