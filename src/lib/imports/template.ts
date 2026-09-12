import { DATASET_FIELDS, type Dataset } from './mapping';

/**
 * The import template, generated from the field definitions rather than typed
 * out beside them.
 *
 * WHY GENERATED
 *
 * A hand-written template is a second copy of the field list, and the two
 * drift the moment a field is added — leaving an admin filling in a column the
 * importer no longer maps, or missing one it now needs. Generating it means
 * the template is always exactly what `autoMap` recognises.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS
 *
 * `column_mapping` exists on `import_batches` because the first guess at a
 * spreadsheet's headers is expected to be wrong. A template removes that guess
 * for anybody starting from scratch, which is the cheapest possible fix for
 * the single most expensive import failure: a shifted column that creates ten
 * thousand wrong businesses in a minute.
 */

/** One example row per dataset, using values that are obviously examples. */
const EXAMPLE: Record<string, string> = {
  business_name: 'Zanzibar Coffee',
  name: 'Zanzibar Coffee',
  legal_name: 'Zanzibar Coffee Limited',
  category: 'Café & Bakery',
  subcategory: 'Coffee Shop',
  description: 'Speciality coffee roaster and café.',
  country: 'Nigeria',
  state: 'Lagos',
  city: 'Lagos',
  district: 'Lekki',
  address: '12 Admiralty Way, Lekki Phase 1',
  landmark: 'Opposite the roundabout',
  phone: '08030000001',
  secondary_phone: '08030000002',
  whatsapp: '08030000001',
  email: 'hello@zanzibarcoffee.ng',
  website: 'https://zanzibarcoffee.ng',
  instagram: 'zanzibarcoffee',
  facebook: 'zanzibarcoffee',
  logo_url: 'https://zanzibarcoffee.ng/logo.png',
  cover_image_url: 'https://zanzibarcoffee.ng/shopfront.jpg',
  gallery_urls: 'https://cdn.example.com/1.jpg|https://cdn.example.com/2.jpg',
  image_url: 'https://cdn.example.com/placement.jpg',
  opening_hours: 'Mon-Fri 08:00-18:00; Sat 09:00-15:00',
  latitude: '6.4281',
  longitude: '3.4219',
  title: 'Digital Screen, The Palms',
  location: 'Lekki, Lagos',
  price_per_day: '25000',
  service_type: 'Photography',

  // The rest of the profile. Every value here is in the format the importer
  // reads, because the example row is the only documentation most people read.
  twitter: 'zanzibarcoffee',
  tiktok: 'zanzibarcoffee',
  linkedin: 'zanzibar-coffee',
  youtube: 'zanzibarcoffee',
  tagline: 'Speciality coffee, roasted in Lekki',
  about: 'We have been roasting single-origin beans since 2015, and the cafe opened in 2018.',
  story: 'Started as a market stall on Admiralty Way.',
  mission: 'Make good coffee normal in Lagos.',
  vision: 'A roastery in every Nigerian city.',
  why_us: 'Roasted on site|Free wifi|Open on Sundays',
  core_values: 'Freshness|Fairness|Warmth',
  services: 'Espresso:1500|Flat white:2000|Bag of beans:8500:250g, whole bean',
  faqs: 'Do you have wifi?::Yes, free for customers.|Do you take card?::Yes.',
  founded_year: '2015',
  employees: '12',
  business_type: 'Limited company',
  service_area: 'Lekki, Victoria Island, Ikoyi',
  languages: 'English|Yoruba',
  payment_methods: 'Cash|Card|Transfer',
  secondary_categories: 'Restaurant|Bakery',
  timezone: 'Africa/Lagos',
};

/** Notes an admin needs that a header cannot carry. */
const NOTE: Record<string, string> = {
  gallery_urls:
    'Several images in one cell. Separate with a pipe (|), a semicolon or a newline. https only — an http link is upgraded and flagged, and a link to a page rather than an image file is refused.',
  logo_url: 'https only. Must point at an image file, not at a page.',
  cover_image_url: 'https only. Must point at an image file, not at a page.',
  phone: 'Any Nigerian format. Normalised to +234… on import, so 0803…, 234803… and +234803… all work.',
  opening_hours: 'Free text is accepted. Anything unparseable is kept but flagged for review rather than guessed at.',
  latitude: 'Decimal degrees. Out-of-range values are left blank and flagged.',
  longitude: 'Decimal degrees. Out-of-range values are left blank and flagged.',
  category: 'Matched against NowOpen categories. An unrecognised value still imports, but goes to review.',
  city: 'Matched against known towns. An unrecognised value still imports, but goes to review.',
  website: 'Used for duplicate detection — a shared domain is how a second upload of the same business is recognised.',
  email: 'Used for duplicate detection.',

  // Formats an admin cannot guess. Each is parsed by profileFields.ts.
  services:
    'One cell, several services. Separate with a pipe (|); Name:Price, or Name:Price:Description. Price stays as written, so "2500", "N2,500" and "from 2500" are all kept. These become the price list on the profile.',
  faqs:
    'Question::Answer pairs separated by a pipe (|). Two colons, because answers contain colons. A pair missing either half is dropped.',
  why_us: 'Several values in one cell, separated by a pipe (|), semicolon or comma.',
  core_values: 'Several values in one cell, separated by a pipe (|), semicolon or comma.',
  languages: 'Several values in one cell, separated by a pipe (|), semicolon or comma.',
  payment_methods: 'Several values in one cell, separated by a pipe (|), semicolon or comma.',
  secondary_categories: 'Extra categories, separated by a pipe (|). The main one goes in category.',
  instagram: 'A handle (zanzibarcoffee or @zanzibarcoffee) or a full link. Saved as a link.',
  facebook: 'A handle or a full link. Saved as a link.',
  twitter: 'A handle or a full link. Saved as a link to x.com.',
  tiktok: 'A handle or a full link. Saved as a link.',
  linkedin: 'A company handle or a full link. A bare handle becomes /company/<handle>.',
  youtube: 'A handle or a full link. A bare handle becomes /@<handle>.',
  founded_year:
    'Four digits, between 1800 and this year. "Est. 1998" is understood. Shown on the profile as years in business, so a wrong year is a false claim.',
  tagline: 'One line, shown under the business name.',
  about: 'The long description. The short one used on cards and in search results is `description`.',
  employees: 'Free text - "12", "5-10", "just me".',
  service_area: 'Where they will travel to, if that differs from their address.',
  timezone: 'An IANA name such as Africa/Lagos. Only needed outside Nigeria.',
};

/**
 * Fields the importer deliberately does NOT carry, and why.
 *
 * Said out loud in the template, because an admin who cannot find a column for
 * their team list will otherwise put it somewhere it does not belong.
 */
const NOT_IMPORTABLE: [string, string][] = [
  ['team', 'Each member has a name, role, photo and bio. Four fields per person does not fit one cell - the owner adds these in their own profile editor.'],
  ['credentials', 'Licences and awards each carry an issuer and a year, and publishing an unverified credential is a claim NowOpen cannot stand behind.'],
  ['policies', 'Refunds, cancellations and terms are the business speaking for itself, and must not arrive from a third-party file.'],
  ['verified / trust', 'Verification is earned through the verification flow. No file can set it.'],
];

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * A ready-to-fill CSV: header row, one example row, then the data dictionary
 * as trailing comment rows.
 *
 * The dictionary rides in the same file on purpose. A separate document is a
 * document nobody opens, and `#` rows are skipped by the parser — verified by
 * the test, because a dictionary that imported itself as businesses would be a
 * spectacular own goal.
 */
export function importTemplateCsv(dataset: Dataset): string {
  const fields = DATASET_FIELDS[dataset];
  const required = new Set(
    fields.filter((f) => (f as { required?: boolean }).required).map((f) => f.field),
  );

  const header = fields.map((f) => f.field);
  const example = fields.map((f) => EXAMPLE[f.field] ?? '');

  const lines = [
    header.map(csvCell).join(','),
    example.map(csvCell).join(','),
    '',
    '# ---------------------------------------------------------------------',
    `# NowOpen Africa import template — ${dataset}`,
    '#',
    '# Delete this example row and these # lines before uploading, or leave',
    '# them: rows beginning with # are skipped by the importer.',
    '#',
    '# A business already on NowOpen is NOT created again. It is matched on',
    '# phone, then website domain, then name + city, and offered as an update',
    '# showing exactly which fields would change. An empty cell never deletes',
    '# what is already there — it means "this file does not say".',
    '# ---------------------------------------------------------------------',
    '#',
    '# FIELD                     REQUIRED  NOTES',
  ];

  for (const f of fields) {
    const req = required.has(f.field) ? 'yes' : '';
    const note = NOTE[f.field] ?? '';
    lines.push(`# ${f.field.padEnd(26)}${req.padEnd(10)}${note}`);
  }

  if (dataset === 'businesses') {
    lines.push('#');
    lines.push('# NOT IMPORTABLE, on purpose:');
    for (const [field, why] of NOT_IMPORTABLE) lines.push(`# ${field.padEnd(26)}${why}`);
  }

  return lines.join('\n') + '\n';
}

/** Filename an admin will recognise a week later. */
export function importTemplateFilename(dataset: Dataset): string {
  return `nowopen-import-template-${dataset}.csv`;
}
