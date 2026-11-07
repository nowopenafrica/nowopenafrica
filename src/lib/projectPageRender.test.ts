import { describe, it, expect } from 'vitest';

import {
  renderProjectPage, projectJsonLd, projectBreadcrumbJsonLd, projectPath,
  embedJson, type ProjectPage, type ProjectPageProject,
} from './projectPageRender';

const project = (over: Partial<ProjectPageProject> = {}): ProjectPageProject => ({
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  business_id: 'bbbbbbbb-1111-2222-3333-444444444444',
  slug: 'kalahari-spring-campaign-444444',
  title: 'Kalahari Spring Campaign',
  summary: 'A three-week shoot across the Northern Cape for a new summer range.',
  client: 'Karoo & Co.',
  location: 'Northern Cape, South Africa',
  completed_on: '2026-03-14',
  cover_url: 'https://cdn.example/cover.jpg',
  cover_video_url: null,
  category: 'Fashion',
  images: [{ url: 'https://cdn.example/one.jpg', caption: 'First light', alt: 'Model on dunes', credit: 'A. Photographer' }],
  link_url: null,
  tags: ['fashion', 'editorial'],
  sections: [
    { id: 's1', type: 'text', heading: 'The brief', body: 'Two paragraphs.\n\nSecond one.' },
    { id: 's2', type: 'quote', quote: 'They found light nobody else could.' },
    { id: 's3', type: 'results', heading: 'Outcomes', items: [{ label: 'Reach', value: '2.1M' }] },
  ],
  details: { industry: 'Fashion', services: 'Art direction, photography' },
  results: [{ label: 'Campaign reach', value: '2.1 million' }],
  seo_title: null,
  seo_description: null,
  updated_at: '2026-04-01T00:00:00Z',
  ...over,
});

const page = (over: Partial<ProjectPage> = {}): ProjectPage => ({
  project: project(),
  business: {
    id: 'bbbbbbbb-1111-2222-3333-444444444444',
    username: 'karoo-studio',
    name: 'Karoo Studio',
    category: 'Photography',
    location: 'Cape Town',
    phone: '08031234567',
    email: 'hello@karoo.example',
    website: 'https://karoo.example',
    image_url: 'https://cdn.example/business.jpg',
    logo_url: null,
  },
  related: [
    project({ id: 'cccccccc-1111-2222-3333-444444444444', slug: 'the-dry-season-444444', title: 'The Dry Season' }),
  ],
  siteUrl: 'https://www.nowopenafrica.com',
  ...over,
});

describe('where the story lives', () => {
  it('uses the slug', () => {
    expect(projectPath(project())).toBe('/work/kalahari-spring-campaign-444444');
  });

  it('falls back to the id for a row that predates slugs', () => {
    expect(projectPath(project({ slug: null }))).toBe('/work/aaaaaaaa-1111-2222-3333-444444444444');
  });
});

describe('the head a crawler and a link preview receive', () => {
  const html = renderProjectPage(page());

  it('has a canonical URL, not just an og:url', () => {
    expect(html).toContain('<link rel="canonical" href="https://www.nowopenafrica.com/work/kalahari-spring-campaign-444444">');
  });

  it('is indexable — this is the URL a business shares to be found', () => {
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(html).not.toContain('noindex');
  });

  it('unfurls with the project, not the home page', () => {
    expect(html).toContain('<meta property="og:title" content="Kalahari Spring Campaign">');
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('<meta property="og:image" content="https://cdn.example/cover.jpg">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('Karoo Studio');
  });

  it('prefers the owner-authored meta description', () => {
    const own = renderProjectPage(page({
      project: project({ seo_description: 'A campaign shot in one long, dry spring.' }),
    }));
    expect(own).toContain('<meta name="description" content="A campaign shot in one long, dry spring.">');
  });

  it('contains the title in the <title>, so a search result makes sense', () => {
    expect(html).toContain('<title>Kalahari Spring Campaign — Karoo Studio | NowOpen Africa</title>');
  });
});

describe('structured data', () => {
  it('describes a CreativeWork by the business', () => {
    const data = projectJsonLd(page()) as Record<string, any>;
    expect(data['@type']).toBe('CreativeWork');
    expect(data.name).toBe('Kalahari Spring Campaign');
    expect(data.creator).toEqual({
      '@type': 'Organization',
      name: 'Karoo Studio',
      url: 'https://www.nowopenafrica.com/karoo-studio',
    });
    expect(data.genre).toBe('Fashion');
  });

  it('links the breadcrumb through the business profile', () => {
    const data = projectBreadcrumbJsonLd(page()) as Record<string, any>;
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement.map((item: any) => item.name))
      .toEqual(['NowOpen Africa', 'Karoo Studio', 'Kalahari Spring Campaign']);
  });

  it('escapes JSON that could close its own script element', () => {
    const embedded = embedJson({ name: '</script><script>alert(1)</script>' });
    expect(embedded).not.toContain('</script>');
    expect(embedded).toContain('\\u003c');
  });

  it('puts no raw script tag from a project title into the page', () => {
    const hostile = renderProjectPage(page({
      project: project({ title: '</script><script>alert(1)</script>' }),
    }));
    // The injected text is escaped everywhere it appears, so the only script
    // elements on the page are the two JSON-LD blocks this module writes.
    expect(hostile.match(/<script/g)?.length).toBe(2);
    expect(hostile).toContain('&lt;/script&gt;');
  });
});

describe('the body a person reads without JavaScript', () => {
  const html = renderProjectPage(page());

  it('shows the story sections in order', () => {
    const brief = html.indexOf('The brief');
    const quote = html.indexOf('They found light nobody else could.');
    expect(brief).toBeGreaterThan(-1);
    expect(quote).toBeGreaterThan(brief);
  });

  it('renders a paragraph break as two paragraphs, not one run-on', () => {
    expect(html).toContain('<p>Two paragraphs.</p><p>Second one.</p>');
  });

  it('labels results as reported by the business', () => {
    expect(html).toContain('Reported by the business. Not independently verified by NowOpen Africa.');
  });

  it('carries the project details that were supplied', () => {
    expect(html).toContain('Karoo &amp; Co.');
    expect(html).toContain('Northern Cape, South Africa');
    expect(html).toContain('2026');
  });

  it('links to more work from the same business', () => {
    expect(html).toContain('href="https://www.nowopenafrica.com/work/the-dry-season-444444"');
  });

  it('sends an enquiry to the business profile, which owns the real contact flow', () => {
    expect(html).toContain('href="https://www.nowopenafrica.com/karoo-studio"');
  });

  it('gives every image alt text', () => {
    // A caption or a title is a usable fallback, but never an empty alt on a
    // picture that carries information.
    expect(html).not.toContain('alt=""');
  });
});

describe('what it refuses to render', () => {
  it('drops a section type it does not recognise', () => {
    const html = renderProjectPage(page({
      project: project({ sections: [{ id: 'x', type: 'script', body: 'alert(1)' } as any] }),
    }));
    expect(html).not.toContain('alert(1)');
  });

  it('refuses a javascript: image URL', () => {
    const html = renderProjectPage(page({
      project: project({ cover_url: 'javascript:alert(1)', images: [] }),
    }));
    expect(html).not.toContain('javascript:');
  });

  it('refuses a javascript: outbound link', () => {
    const html = renderProjectPage(page({
      project: project({
        sections: [{ id: 'l', type: 'link', heading: null, body: '', url: 'javascript:alert(1)', label: 'Open' }],
      }),
    }));
    expect(html).not.toContain('javascript:');
  });

  it('omits fictional details rather than inventing them', () => {
    const bare = renderProjectPage(page({
      project: project({
        client: null, location: null, completed_on: null, details: {}, tags: [],
        sections: [], results: [],
      }),
      related: [],
    }));
    expect(bare).not.toContain('Client');
    expect(bare).not.toContain('Reported by the business');
  });

  it('labels a results block inside the story with the same disclosure', () => {
    const html = renderProjectPage(page());
    // Both the story block and the project-level list state the same thing.
    expect(html.match(/Reported by the business\. Not independently verified/g)?.length).toBe(2);
  });
});
