import { describe, it, expect, beforeEach } from 'vitest';
import { Business } from '../types';
import {
  LandingSection,
  serviceSuggestions, ctaFor, defaultSections, generateLanding,
  landingUrl, landingShareText, landingCss, LANDING_ACCENTS, renderLandingHtml,
  loadLanding, saveLanding,
} from './landing';
import { BRAND_ORIGIN } from './studio';

const biz = {
  id: 'b1',
  username: 'meatclub',
  name: 'Meat Club',
  description: 'Smoked meats and grilled platters.',
  category: 'Restaurant',
  location: 'Lagos, Nigeria',
  phone: '+234 800 123 4567',
  hours: 'Mon–Sat, 9am–9pm',
  website: 'https://meatclub.example.com',
} as unknown as Business;

beforeEach(() => localStorage.clear());

describe('landing — generated content', () => {
  it('builds a full section set with hero and contact visible', () => {
    const sections = defaultSections(biz);
    expect(sections.map((s) => s.type)).toEqual(['hero', 'services', 'gallery', 'promo', 'pricing', 'contact']);
    expect(sections.find((s) => s.type === 'hero')?.title).toBe('Meat Club');
    expect(sections.find((s) => s.type === 'hero')?.body).toContain('Lagos');
    expect(sections.find((s) => s.type === 'contact')?.body).toContain('9am–9pm');
    expect(sections.filter((s) => s.visible).map((s) => s.type)).toEqual(['hero', 'services', 'contact']);
  });

  it('suggests services and CTAs by category', () => {
    const sections = defaultSections(biz);
    const services = sections.find((s) => s.type === 'services')!;
    expect(services.items.join(' ')).toMatch(/meal|dining|takeaway|cater/i);
    expect(ctaFor('Restaurant')).toMatch(/Book|Order/);
    expect(ctaFor('Software & IT')).toMatch(/Book|Order/);
    expect(serviceSuggestions('Anything Else')).toHaveLength(4);
  });

  it('generates a publishable page with stable defaults', () => {
    const page = generateLanding(biz);
    expect(page.title).toBe('Meat Club');
    expect(page.theme).toBe('light');
    expect(page.accent).toBe(LANDING_ACCENTS[0]);
    expect(page.sections).toHaveLength(6);
    expect(page.updatedAt).toBe(page.createdAt);
  });
});

describe('landing — publish & share', () => {
  it('publishes to the business profile URL', () => {
    expect(landingUrl(biz)).toBe(`${BRAND_ORIGIN}/meatclub`);
    expect(landingUrl({ id: 'x', username: undefined } as unknown as Business)).toBe(`${BRAND_ORIGIN}/businesses/x`);
  });

  it('writes share copy that includes the profile link', () => {
    const page = generateLanding(biz);
    page.sections = [{ ...page.sections[3], visible: true } as LandingSection];
    const text = landingShareText(biz, page);
    expect(text).toContain('Meat Club is live!');
    expect(text).toContain('Limited offer');
    expect(text).toContain(`${BRAND_ORIGIN}/meatclub`);
  });

  it('omits hidden promos from share copy', () => {
    const text = landingShareText(biz, generateLanding(biz));
    expect(text).not.toContain('Limited offer');
  });

  it('emits theme CSS for light and dark pages', () => {
    const light = generateLanding(biz);
    expect(landingCss(light)).toContain('#7c3aed');
    const dark = { ...light, theme: 'dark' as const };
    expect(landingCss(dark)).toContain('#0f172a');
  });

  it('renders a standalone HTML page with visible sections only', () => {
    const page = generateLanding(biz);
    const html = renderLandingHtml(biz, page);
    expect(html).toContain('<h1>Meat Club</h1>');
    expect(html).toContain('Smoked meats and grilled platters');
    expect(html).toContain('wa.me/2348001234567');
    expect(html).not.toContain('Limited offer');
  });

  it('renders an uploaded image and video inside their sections', () => {
    const page = generateLanding(biz);
    page.sections = [
      { ...page.sections[0], media: { url: 'data:image/png;base64,AAAA', type: 'image' } },
      { ...page.sections[1], media: { url: 'data:video/mp4;base64,BBBB', type: 'video' } },
    ];
    const html = renderLandingHtml(biz, page);
    expect(html).toContain('<img class="media" src="data:image/png;base64,AAAA"');
    expect(html).toContain('<video class="media" src="data:video/mp4;base64,BBBB"');
  });
});

describe('landing — persistence', () => {
  it('saves and reloads a page per business', () => {
    const page = generateLanding(biz);
    saveLanding('b1', page);
    expect(loadLanding('b1')?.title).toBe('Meat Club');
    expect(loadLanding('b2')).toBeNull();
  });
});
