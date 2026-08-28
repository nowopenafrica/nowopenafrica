// Brand DNA + Brand Guidelines for NowOpen Studio.
//
// Every business gets an automatically-generated brand identity: a colour
// palette (extracted from their logo/cover when available, otherwise a
// sensible default), recommended typography, tone of voice and photography
// direction. The same DNA feeds every Studio module so a luxury hotel never
// receives a street-sale design, and vice-versa.

import { Business } from '../types';
import { slugForFile } from './studio';
import { BrandIdentity, voiceTraitLabel, writingStyleLabel } from './brandIdentity';

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
}

export interface BrandPersonality {
  key: string;
  label: string;
  palette: BrandPalette;
  headingFont: string;
  bodyFont: string;
  tone: string;
  photography: string;
}

// Default identities by personality — used until real brand colours are
// extracted from the business logo/cover image.
export const PERSONALITIES: BrandPersonality[] = [
  {
    key: 'friendly',
    label: 'Friendly & Approachable',
    palette: { primary: '#16a34a', secondary: '#facc15', accent: '#ea580c', neutral: '#0f172a' },
    headingFont: 'Arial Rounded', bodyFont: 'Arial',
    tone: 'Warm, welcoming and conversational. Speak to customers like friends.',
    photography: 'Bright natural light, real people, candid moments.',
  },
  {
    key: 'luxury',
    label: 'Luxury & Premium',
    palette: { primary: '#0f172a', secondary: '#b45309', accent: '#eab308', neutral: '#475569' },
    headingFont: 'Didot', bodyFont: 'Inter',
    tone: 'Refined, understated and elegant. Fewer words, more polish.',
    photography: 'Moody lighting, negative space, high-end finishes.',
  },
  {
    key: 'modern',
    label: 'Modern & Minimal',
    palette: { primary: '#18181b', secondary: '#3b82f6', accent: '#22d3ee', neutral: '#6b7280' },
    headingFont: 'Helvetica Neue', bodyFont: 'Inter',
    tone: 'Clean, confident and direct. Short, punchy sentences.',
    photography: 'Minimal scenes, strong geometry, lots of whitespace.',
  },
  {
    key: 'traditional',
    label: 'Traditional & Trusted',
    palette: { primary: '#1e3a5f', secondary: '#b45309', accent: '#9a3412', neutral: '#334155' },
    headingFont: 'Times New Roman', bodyFont: 'Georgia',
    tone: 'Warm, trustworthy and rooted. A heritage feel.',
    photography: 'Classic compositions, warm tones, family values.',
  },
  {
    key: 'corporate',
    label: 'Corporate & Professional',
    palette: { primary: '#0f172a', secondary: '#2563eb', accent: '#0891b2', neutral: '#64748b' },
    headingFont: 'Arial', bodyFont: 'Open Sans',
    tone: 'Professional, precise and credible. Clear and structured.',
    photography: 'Clean office scenes, sharp detail, blue-grey tones.',
  },
  {
    key: 'youthful',
    label: 'Youthful & Energetic',
    palette: { primary: '#7c3aed', secondary: '#ec4899', accent: '#facc15', neutral: '#111827' },
    headingFont: 'Poppins', bodyFont: 'Nunito',
    tone: 'Playful, energetic and bold. Emojis welcome, slang encouraged.',
    photography: 'Vibrant colours, movement, social-first framing.',
  },
];

export function personalityByKey(key: string): BrandPersonality {
  return PERSONALITIES.find((p) => p.key === key) ?? PERSONALITIES[0];
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

// Reduce a sampled pixel buffer to a four-colour brand palette. Simple and
// deterministic: buckets quantised colours, then picks the most frequent hues
// for primary/secondary, the most vivid for the accent and the most neutral
// (grey-ish) tone for the neutral colour.
export function paletteFromPixels(data: Uint8ClampedArray): BrandPalette | null {
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const existing = buckets.get(key);
    if (existing) { existing.count++; existing.r += r; existing.g += g; existing.b += b; }
    else buckets.set(key, { r, g, b, count: 1 });
  }
  if (buckets.size === 0) return null;

  const colours = Array.from(buckets.values()).map((c) => ({
    r: Math.round(c.r / c.count), g: Math.round(c.g / c.count), b: Math.round(c.b / c.count), count: c.count,
  }));
  colours.sort((a, b) => b.count - a.count);

  const vivid = [...colours].sort((a, b) => saturation(b.r, b.g, b.b) - saturation(a.r, a.g, a.b))[0];
  const neutralCandidates = colours.filter((c) => saturation(c.r, c.g, c.b) < 0.25 && luminance(c.r, c.g, c.b) > 40);
  const neutral = neutralCandidates[0] ?? colours[colours.length - 1];
  const primary = colours[0];
  const secondary = colours[1] ?? primary;

  const pick = (c: { r: number; g: number; b: number }) => rgbToHex(c.r, c.g, c.b);
  return { primary: pick(primary), secondary: pick(secondary), accent: pick(vivid), neutral: pick(neutral) };
}

// Extract a brand palette from a logo/cover image. Canvas may be unavailable
// (SSR/tests/old browsers) — callers must handle null.
export function paletteFromImage(url: string): Promise<BrandPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) { resolve(null); return; }
        const size = 48;
        canvas.width = size;
        canvas.height = size;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        resolve(paletteFromPixels(data));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export interface BrandDNA {
  personality: BrandPersonality;
  palette: BrandPalette;
  source: 'image' | 'default';
}

// Human-readable brand guidelines (used for both the text download and the
// PDF page content). The editable brand identity is woven in so the document
// describes how the *whole* brand works, not just the logo.
export function brandGuidelinesText(business: Pick<Business, 'name' | 'category' | 'description'>, dna: BrandDNA, identity?: BrandIdentity): string {
  const { palette, personality } = dna;
  return [
    'NOWOPEN STUDIO — BRAND GUIDELINES',
    `Business: ${business.name}`,
    `Category: ${business.category}`,
    `Personality: ${personality.label}`,
    identity?.tagline ? `Tagline: ${identity.tagline}` : '',
    identity?.brandPromise ? `Brand promise: ${identity.brandPromise}` : '',
    identity?.established ? `Established: ${identity.established}` : '',
    identity && identity.voice.length > 0 ? `Brand voice: ${identity.voice.map(voiceTraitLabel).join(', ')}` : '',
    identity && identity.writingStyle !== 'professional' ? `Writing style: ${writingStyleLabel(identity.writingStyle)}` : '',
    identity?.keywords ? `Brand keywords: ${identity.keywords}` : '',
    identity?.mission ? `Mission: ${identity.mission}` : '',
    identity?.vision ? `Vision: ${identity.vision}` : '',
    '',
    '1. LOGO USAGE',
    `• Always keep the ${business.name} logo clear of other elements.`,
    '• Maintain a clear-space margin equal to the height of the "o" in the logo.',
    '• Do not stretch, recolor or add effects to the logo.',
    '• On dark backgrounds, prefer the light logo; on light, the dark/colour logo.',
    '',
    '2. BRAND COLOURS',
    `• Primary: ${palette.primary}`,
    `• Secondary: ${palette.secondary}`,
    `• Accent: ${palette.accent}`,
    `• Neutral: ${palette.neutral}`,
    '• Use the primary colour for headlines and key actions, accent for highlights.',
    '',
    '3. TYPOGRAPHY',
    `• Headings: ${personality.headingFont}`,
    `• Body: ${personality.bodyFont}`,
    '• Headlines should be bold; body text should be easy to read at small sizes.',
    '',
    '4. SPACING & LAYOUT',
    '• Generous whitespace — never crowd elements.',
    '• Keep a consistent margin across all marketing materials.',
    '',
    '5. BRAND VOICE',
    personality.tone,
    '',
    '6. PHOTOGRAPHY STYLE',
    personality.photography,
    '',
    business.description ? `ABOUT: ${business.description}` : '',
    '',
    'Generated by NowOpen Studio — nowopenafrica.com',
  ].filter(Boolean).join('\n');
}

// A print-ready A4 Brand Guidelines PDF with colour swatches.
export async function downloadBrandGuidelinesPdf(business: Pick<Business, 'name' | 'category' | 'description'>, dna: BrandDNA, identity?: BrandIdentity) {
  const { palette, personality } = dna;
  // jsPDF is ~900 kB and only these two functions touch it, so it loads on the
  // first PDF rather than sitting in the bundle every visitor downloads.
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const M = 18;

  pdf.setFillColor(10, 15, 30);
  pdf.rect(0, 0, pageW, 60, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont('helvetica', 'bold');
  pdf.text('BRAND GUIDELINES', M, 30);
  pdf.setFontSize(13);
  pdf.setFont('helvetica', 'normal');
  pdf.text(business.name, M, 42);
  pdf.setFontSize(10);
  pdf.setTextColor(170, 180, 200);
  pdf.text(`${business.category}  ·  ${personality.label}`, M, 50);
  if (identity?.tagline) {
    pdf.setFontSize(9);
    pdf.text(identity.tagline, M, 56);
  }

  let y = identity?.tagline ? 76 : 72;
  pdf.setTextColor(20, 25, 40);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  pdf.text('1. LOGO USAGE', M, y); y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`• Keep the ${business.name} logo clear of other elements.`, M, y); y += 6;
  pdf.text('• Maintain clear-space equal to the height of the "o" in the logo.', M, y); y += 6;
  pdf.text('• Never stretch, recolour or add effects to the logo.', M, y); y += 6;
  pdf.text('• Dark backgrounds → light logo. Light backgrounds → colour logo.', M, y); y += 10;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('2. BRAND COLOURS', M, y); y += 8;
  const swatches: [string, string][] = [
    ['PRIMARY', palette.primary],
    ['SECONDARY', palette.secondary],
    ['ACCENT', palette.accent],
    ['NEUTRAL', palette.neutral],
  ];
  const swW = (pageW - M * 2 - 10) / 4;
  pdf.setFontSize(9);
  swatches.forEach(([label, hex], i) => {
    const x = M + i * (swW + 4);
    const { r, g, b } = hexToRgb(hex);
    pdf.setFillColor(r, g, b);
    pdf.roundedRect(x, y, swW, 18, 2, 2, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(20, 25, 40);
    pdf.text(hex, x + 1, y + 26);
    pdf.text(label, x + 1, y + 32);
  });
  y += 42;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('3. TYPOGRAPHY', M, y); y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`• Headings: ${personality.headingFont}`, M, y); y += 6;
  pdf.text(`• Body: ${personality.bodyFont}`, M, y); y += 10;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('4. BRAND VOICE', M, y); y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const voice = pdf.splitTextToSize(personality.tone, pageW - M * 2);
  pdf.text(voice, M, y); y += voice.length * 5 + 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('5. PHOTOGRAPHY STYLE', M, y); y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(pdf.splitTextToSize(personality.photography, pageW - M * 2), M, y);

  pdf.setFontSize(9);
  pdf.setTextColor(120, 130, 150);
  pdf.text('Generated by NowOpen Studio — nowopenafrica.com', M, 290);

  pdf.save(`${slugForFile(business.name)}-brand-guidelines.pdf`);
}

// A print-ready A4 letterhead — brand-colour header band, business name,
// tagline, contact block, a body placeholder and a footer line.
export async function downloadLetterheadPdf(business: Pick<Business, 'name' | 'category' | 'description' | 'phone' | 'website' | 'email' | 'location'>, identity: BrandIdentity | undefined, palette: BrandPalette) {
  // jsPDF is ~900 kB and only these two functions touch it, so it loads on the
  // first PDF rather than sitting in the bundle every visitor downloads.
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const M = 20;
  const pageW = 210;
  const pageH = 297;
  const { r, g, b } = hexToRgb(palette.primary);

  // Header band + white logo disc with the initial.
  pdf.setFillColor(r, g, b);
  pdf.rect(0, 0, pageW, 36, 'F');
  pdf.setFillColor(255, 255, 255);
  pdf.circle(M, 18, 9, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(r, g, b);
  pdf.text((business.name || 'N').charAt(0).toUpperCase(), M, 22, { align: 'center' });
  pdf.setFontSize(19);
  pdf.setTextColor(255, 255, 255);
  pdf.text(business.name, M + 13, 17);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(225, 232, 245);
  pdf.text(identity?.tagline || business.category, M + 13, 24);

  pdf.setFontSize(8);
  pdf.text([business.location || '', business.phone || '', business.email || business.website || ''].filter(Boolean).join('  ·  '), pageW - M, 18, { align: 'right' });
  pdf.text('nowopenafrica.com', pageW - M, 24, { align: 'right' });

  // Body
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(30, 35, 50);
  pdf.text('To whom it may concern,', M, 64);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const body = business.description || `Welcome to ${business.name} — ${identity?.brandPromise || business.category}.`;
  let yy = 74;
  pdf.text(pdf.splitTextToSize(body, pageW - M * 2), M, yy);
  yy += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Kind regards,', M, yy + 4);
  pdf.setFont('helvetica', 'bold');
  pdf.text(business.name, M, yy + 10);

  // Footer
  pdf.setDrawColor(205, 210, 220);
  pdf.line(M, pageH - 22, pageW - M, pageH - 22);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(130, 140, 155);
  pdf.text('Generated by NowOpen Studio · nowopenafrica.com', M, pageH - 15);

  pdf.save(`${slugForFile(business.name)}-letterhead.pdf`);
}
