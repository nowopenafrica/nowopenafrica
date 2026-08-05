// NowOpen Studio — Digital Catalogue.
//
// A clean, scannable menu/catalogue of what the business sells — products,
// services or menu items — with prices. Readable on any phone, shareable as a
// single WhatsApp message, and exportable as a text menu for printing or
// framing on the profile. Stored on-device per business like the other Studio
// modules.

import { Business } from '../types';

export type CatalogueCategory = 'products' | 'services' | 'menu';

export interface CatalogueItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: CatalogueCategory;
  emoji: string;
  featured: boolean;
}

export interface Catalogue {
  title: string;
  subtitle: string;
  updatedAt: string; // ISO datetime
  items: CatalogueItem[];
}

export const CATALOGUE_CATEGORIES: { key: CatalogueCategory; label: string; emoji: string }[] = [
  { key: 'products', label: 'Products', emoji: '🛍️' },
  { key: 'services', label: 'Services', emoji: '🧰' },
  { key: 'menu', label: 'Menu items', emoji: '🍽️' },
];

export function catalogueCategoryLabel(category: CatalogueCategory): string {
  return CATALOGUE_CATEGORIES.find((c) => c.key === category)?.label || category;
}

export function catalogueCategoryEmoji(category: CatalogueCategory): string {
  return CATALOGUE_CATEGORIES.find((c) => c.key === category)?.emoji || '📦';
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// --- Building -----------------------------------------------------------------

export interface CatalogueItemDraft {
  name: string;
  description: string;
  price: number;
  category: CatalogueCategory;
  emoji: string;
  featured: boolean;
}

export function createCatalogueItem(draft: CatalogueItemDraft): CatalogueItem {
  return { id: uid(), ...draft };
}

// Starter items based on the business category.
export function suggestCatalogueItems(business: Pick<Business, 'name' | 'category'>): CatalogueItem[] {
  const name = business.name;
  const cat = business.category || '';
  const lower = cat.toLowerCase();
  if (lower.includes('restaurant') || lower.includes('food') || lower.includes('cafe') || lower.includes('grill') || lower.includes('kitchen')) {
    return [
      { id: uid(), name: `${name} Signature Dish`, description: 'House special — ask for today\'s price', price: 0, category: 'menu', emoji: '🍽️', featured: true },
      { id: uid(), name: `${name} Combo Meal`, description: 'Full meal with sides + drink', price: 0, category: 'menu', emoji: '🍱', featured: false },
      { id: uid(), name: `${name} Dessert & Drinks`, description: 'Sweet endings and fresh drinks', price: 0, category: 'menu', emoji: '🥤', featured: false },
    ];
  }
  if (lower.includes('beauty') || lower.includes('spa') || lower.includes('salon') || lower.includes('barber') || lower.includes('nails')) {
    return [
      { id: uid(), name: `${name} Signature Service`, description: 'Our most requested service', price: 0, category: 'services', emoji: '✨', featured: true },
      { id: uid(), name: `${name} Express Session`, description: 'Quick turnaround, great results', price: 0, category: 'services', emoji: '⏱️', featured: false },
      { id: uid(), name: `${name} Full Experience`, description: 'The complete package — book ahead', price: 0, category: 'services', emoji: '💆', featured: false },
    ];
  }
  if (lower.includes('shop') || lower.includes('store') || lower.includes('fashion') || lower.includes('cloth') || lower.includes('boutique') || lower.includes('pharmacy')) {
    return [
      { id: uid(), name: `${name} Bestseller`, description: 'Customers love this one', price: 0, category: 'products', emoji: '🛍️', featured: true },
      { id: uid(), name: `${name} New Arrival`, description: 'Fresh in — just dropped', price: 0, category: 'products', emoji: '✨', featured: false },
      { id: uid(), name: `${name} Essential`, description: 'A must-have from the range', price: 0, category: 'products', emoji: '🧺', featured: false },
    ];
  }
  return [
    { id: uid(), name: `${name} Standard`, description: 'Our core offering', price: 0, category: 'services', emoji: '✅', featured: true },
    { id: uid(), name: `${name} Premium`, description: 'Everything in Standard, plus more', price: 0, category: 'services', emoji: '⭐', featured: false },
    { id: uid(), name: `${name} Consultation`, description: 'Let\'s talk about your needs', price: 0, category: 'services', emoji: '💬', featured: false },
  ];
}

export function createCatalogue(
  business: Pick<Business, 'name' | 'category'>,
  items: CatalogueItem[] = suggestCatalogueItems(business),
): Catalogue {
  return {
    title: `${business.name} — Catalogue`,
    subtitle: business.category ? `${business.category} · prices as of today` : 'Prices as of today',
    updatedAt: new Date().toISOString(),
    items,
  };
}

// --- Rendering ----------------------------------------------------------------

export function formatCataloguePrice(value: number): string {
  if (value <= 0) return 'Ask';
  return `₦${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The full catalogue, grouped by category — send-ready.
export function catalogueFullText(
  catalogue: Catalogue,
  business: Pick<Business, 'name' | 'location' | 'phone'>,
): string {
  const grouped = CATALOGUE_CATEGORIES.map((c) => ({
    cat: c,
    items: catalogue.items.filter((it) => it.category === c.key),
  })).filter((g) => g.items.length > 0);

  const rows: string[] = [
    catalogue.title,
    catalogue.subtitle,
    '',
  ];
  for (const g of grouped) {
    rows.push(`${g.cat.emoji} ${g.cat.label.toUpperCase()}`);
    for (const it of g.items) {
      const price = formatCataloguePrice(it.price);
      rows.push(`  ${it.emoji} ${it.name}${it.featured ? ' ★' : ''} — ${price}`);
      if (it.description) rows.push(`     ${it.description}`);
    }
    rows.push('');
  }
  rows.push(
    `${business.name}${business.location ? ` · ${business.location}` : ''}`,
    business.phone ? `Order/Book: ${business.phone}` : '',
  );
  return rows.filter((line) => line !== '').join('\n');
}

// ---- Persistence -------------------------------------------------------------

export function catalogueKey(businessId: string): string {
  return `nowopen_catalogue_${businessId}`;
}

export function loadCatalogue(businessId: string): Catalogue | null {
  try {
    const raw = localStorage.getItem(catalogueKey(businessId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Catalogue;
    return parsed && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCatalogue(businessId: string, catalogue: Catalogue): void {
  try { localStorage.setItem(catalogueKey(businessId), JSON.stringify(catalogue)); } catch { /* ignore */ }
}
