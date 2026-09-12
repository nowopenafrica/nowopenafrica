import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toaster } from 'react-hot-toast';

// jsdom has no matchMedia — react-hot-toast's <Toaster /> needs it.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock('../lib/supabase', () => {
  const tableData: Record<string, unknown[]> = {
    radar_sources: [{
      key: 'wikidata', name: 'Wikidata', active: true,
      automated_access: 'permitted', bulk_extraction: 'permitted',
      redistribution: 'permitted', competing_dataset: null,
      licence: 'CC0 1.0', authorised_by: 'Duro',
    }],
    businesses: [],
    radar_candidates: [{
      id: 'rc1', source_key: 'business_registration', source_record_id: 'rC1',
      name: 'Suya Spot', category: 'Grill', city: 'Ibadan', address: 'Ibadan',
      phone: '08000000000', whatsapp: '08000000001', website: null, email: null,
      description: 'The best suya in town',
      confidence: 90, status: 'review', created_at: new Date().toISOString(),
      profile: {
        services_json: JSON.stringify([
          { name: 'Suya', price: '3000' }, { name: 'Chicken', price: '4000' },
        ]),
        pricing: 'From N3,000',
        duration: '2 hours',
        dimensions: '15x20',
        instagram: 'suya.spot',
        logo_url: 'https://example.com/suya-logo.png',
        image_url: 'https://example.com/suya-cover.jpg',
        about: 'Family-run suya stand since 2018',
        mission: 'To make the best suya in Ibadan',
        vision: 'Best suya in Nigeria',
        tagline: 'Suya perfected',
        opening_hours: 'Mon–Fri: 17:00–23:00, Sat: 18:00–23:00',
        founded_year: '2018',
        employees: '5-10',
        languages: 'English|Yoruba',
        payment_methods: 'Cash|Transfer',
        service_area: 'Ibadan metropolitan',
        faqs_json: JSON.stringify([
          { q: 'Do you deliver?', a: 'Yes, within 5km' },
          { q: 'What are your hours?', a: '5pm to 11pm weekdays' },
        ]),
      },
    }],
    business_registrations: [{
      id: 'r1', business_name: 'Taste Lagos', category: 'Restaurant',
      location: 'Lagos', phone: '08012345678', email: 'hi@tastelagos.ng',
      website: 'https://tastelagos.ng', description: 'A test restaurant',
      services: 'Jollof:5000|Suya:3000',
      products: 'Chin chin:2500',
      pricing: 'From N5,000',
      duration: '2 hours',
      dimensions: '20x30',
      social_media: { instagram: 'tastelagos', facebook: 'tastelagosfb' },
      logo_url: 'https://example.com/logo.png',
      image_url: 'https://example.com/cover.jpg',
      year_established: 2020,
      employee_count: '10-20',
      payment_methods: ['Cash', 'Transfer'],
      languages: ['English', 'Yoruba'],
      service_area: 'Lagos Island',
      business_hours: {
        mon: { open: '09:00', close: '21:00' },
        tue: { open: '09:00', close: '21:00' },
        wed: { open: '09:00', close: '21:00' },
        thu: { open: '09:00', close: '21:00' },
        fri: { open: '09:00', close: '21:00' },
        sat: { open: '10:00', close: '18:00' },
        sun: { closed: true },
      },
      created_at: new Date().toISOString(),
    }],
    waitlist: [{
      id: 'w1', name: 'Ada Obi', email: 'ada@x.com',
      business_type: 'Catering', country: 'Nigeria',
      created_at: new Date().toISOString(),
    }],
  };
  const q = (table: string) => {
    const data = tableData[table] ?? [];
    const result = { data, error: null };
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({
        data: Array.isArray(data) ? data[0] ?? null : data ?? null,
        error: null,
      })),
      insert: vi.fn(async () => ({ error: null })),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: { from: vi.fn((table: string) => q(table)) },
  };
});

import DiscoveryPanel from '../components/admin/DiscoveryPanel';
import ReviewQueue from '../components/admin/ReviewQueue';

describe('DiscoveryPanel sources', () => {
  it('offers every discovery source, including the honest Google placeholder', () => {
    render(<DiscoveryPanel />);
    expect(screen.getByLabelText(/Source/)).toBeInTheDocument();
    expect(screen.getByText('Wikidata (CC0)')).toBeInTheDocument();
    expect(screen.getByText('BusinessList.com.ng')).toBeInTheDocument();
    expect(screen.getByText('Waitlist signups')).toBeInTheDocument();
    expect(screen.getByText('Google Business Profile')).toBeInTheDocument();
  });

  it('shows the first-party note for internal sources and hides Wikidata-only filters', async () => {
    render(<DiscoveryPanel />);
    const select = screen.getByLabelText(/Source/);
    fireEvent.change(select, { target: { value: 'business_registration' } });
    expect(await screen.findByText(/First-party data — businesses that registered themselves/)).toBeInTheDocument();
    expect(screen.queryByText(/Only ones with a phone number/)).not.toBeInTheDocument();
  });

  it('states honestly when Google Business Profile cannot run yet', async () => {
    render(<DiscoveryPanel />);
    const select = screen.getByLabelText(/Source/);
    fireEvent.change(select, { target: { value: 'google' } });
    expect(await screen.findByText(/GOOGLE_PLACES_API_KEY/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Only ones with a phone number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Where/)).toBeInTheDocument();
  });

  it('surfaces the server answer when Google Places has no key configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Google Places API key is not configured.', hint: 'Set it as a server-side secret.' }),
    }));
    render(
      <>
        <Toaster />
        <DiscoveryPanel />
      </>
    );
    fireEvent.change(screen.getByLabelText(/Source/), { target: { value: 'google' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText('Google Places API key is not configured.')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('lists Digital Forms registrations as reviewable results', async () => {
    render(<DiscoveryPanel />);
    const select = screen.getByLabelText(/Source/);
    fireEvent.change(select, { target: { value: 'business_registration' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText('Taste Lagos')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.getByText('08012345678')).toBeInTheDocument();
  });

  it('carries the registration services, products and pricing into the results', async () => {
    render(<DiscoveryPanel />);
    const select = screen.getByLabelText(/Source/);
    fireEvent.change(select, { target: { value: 'business_registration' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    // Services (Jollof + Suya) merged with products (Chin chin) = three items;
    // pricing stays as written. The staging bag is what the review queue shows.
    expect(await screen.findByText('Taste Lagos')).toBeInTheDocument();
    expect(screen.getByText('3 services · From N5,000')).toBeInTheDocument();
  });

  it('shows the thumbnail, description and hours in the Digital Forms results', async () => {
    render(<DiscoveryPanel />);
    const select = screen.getByLabelText(/Source/);
    fireEvent.change(select, { target: { value: 'business_registration' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText('Taste Lagos')).toBeInTheDocument();
    // Thumbnail image is rendered (logo or cover).
    expect(screen.getByRole('img', { name: /thumbnail/ })).toHaveAttribute('src', 'https://example.com/logo.png');
    // Description is shown as a truncated subtitle.
    expect(screen.getByText('A test restaurant')).toBeInTheDocument();
  });

  it('shows the staged profile details beside core contacts in the review queue', async () => {
    render(<ReviewQueue />);
    expect(await screen.findByText('Suya Spot')).toBeInTheDocument();
    expect(screen.getByText(/Suya · 3000/)).toBeInTheDocument();
    expect(screen.getByText(/Chicken · 4000/)).toBeInTheDocument();
    expect(screen.getByText('From N3,000')).toBeInTheDocument();
    expect(screen.getByText('2 hours')).toBeInTheDocument();
    expect(screen.getByText(/suya\.spot/)).toBeInTheDocument();
  });

  it('shows logo, description, narrative fields, hours and FAQs in the review queue', async () => {
    render(<ReviewQueue />);
    expect(await screen.findByText('Suya Spot')).toBeInTheDocument();
    // Thumbnail logo
    expect(screen.getByRole('img', { name: /logo/ })).toHaveAttribute('src', 'https://example.com/suya-logo.png');
    // Description
    expect(screen.getByText('The best suya in town')).toBeInTheDocument();
    // Tagline
    expect(screen.getByText('Suya perfected')).toBeInTheDocument();
    // Narrative fields
    expect(screen.getByText(/Family-run suya stand since 2018/)).toBeInTheDocument();
    expect(screen.getByText(/To make the best suya in Ibadan/)).toBeInTheDocument();
    expect(screen.getByText(/Best suya in Nigeria/)).toBeInTheDocument();
    // Hours and founded
    expect(screen.getByText('Mon–Fri: 17:00–23:00, Sat: 18:00–23:00')).toBeInTheDocument();
    expect(screen.getByText('2018')).toBeInTheDocument();
    // List fields
    expect(screen.getByText('5-10')).toBeInTheDocument();
    expect(screen.getByText(/English\|Yoruba/)).toBeInTheDocument();
    expect(screen.getByText(/Cash\|Transfer/)).toBeInTheDocument();
    expect(screen.getByText('Ibadan metropolitan')).toBeInTheDocument();
    // FAQs — two shown
    expect(screen.getByText('Do you deliver?')).toBeInTheDocument();
    expect(screen.getByText(/Yes, within 5km/)).toBeInTheDocument();
    expect(screen.getByText('What are your hours?')).toBeInTheDocument();
    expect(screen.getByText(/5pm to 11pm weekdays/)).toBeInTheDocument();
  });

  it('renders the review queue fetch select with whatsapp', async () => {
    render(<ReviewQueue />);
    expect(await screen.findByText('Suya Spot')).toBeInTheDocument();
    expect(screen.getByText('08000000001')).toBeInTheDocument();
  });
});