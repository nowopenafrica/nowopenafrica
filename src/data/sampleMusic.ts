// Demo data for the Music & Entertainment (DJs / live bands / MCs) operating
// system. Shown only for the curated entertainment spotlight. Reuses
// business_services (service_category = act type), so no migration is needed.

export interface SampleAct {
  id: string;
  name: string;
  description: string;
  price: string;
  service_category: string;   // act type
}

export interface ShowShot { src: string; label: string; }

const px = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;

export const SAMPLE_ACTS: SampleAct[] = [
  { id: 'act_1', name: 'DJ set (4 hours)', description: 'Open-format party set — Afrobeats, Amapiano, hip-hop and old-school. Own PA available.', price: 'From ₦250,000', service_category: 'DJ' },
  { id: 'act_2', name: 'Live band (full)', description: '7-piece band with vocalists, horns and rhythm section. 2×45-min sets.', price: 'From ₦850,000', service_category: 'Live Band' },
  { id: 'act_3', name: 'MC / Hype man', description: 'Bilingual compère to run the programme and keep the floor moving.', price: 'From ₦180,000', service_category: 'MC' },
  { id: 'act_4', name: 'Saxophonist (solo)', description: 'Live sax over DJ tracks — cocktail hour, first dance or entrance.', price: 'From ₦150,000', service_category: 'Instrumentalist' },
  { id: 'act_5', name: 'Gospel choir (8 voices)', description: 'Full choir with keys for weddings, dedications and church events.', price: 'From ₦400,000', service_category: 'Choir' },
  { id: 'act_6', name: 'Full event package', description: 'DJ + live band + MC + sound & lighting — one price, one point of contact.', price: 'From ₦1,600,000', service_category: 'Package' },
];

// Past performances — a small showreel gallery (sample-only, lightbox).
export const SHOW_GALLERY: ShowShot[] = [
  { src: px(1105666), label: 'Lagos wedding · live band' },
  { src: px(196652), label: 'Rooftop DJ party' },
  { src: px(1699161), label: 'Concert stage set' },
  { src: px(2263436), label: 'Corporate gala night' },
  { src: px(167636), label: 'Festival main stage' },
  { src: px(1190298), label: 'Nightclub headline set' },
];

// Genres / vibes (sample-only badges).
export const MUSIC_GENRES = ['Afrobeats', 'Amapiano', 'Gospel', 'Highlife', 'Jazz', 'Hip-hop'];

export const MUSIC_SPOTLIGHTS: Record<string, any> = {
  business_60: {
    id: 'business_60',
    username: 'afrobeat-live-entertainment',
    name: 'Afrobeat Live Entertainment',
    category: 'Music & Nightlife',
    description:
      'DJs, live bands, MCs and full event sound for weddings, concerts and corporate nights. Book an act or the full package with one call.',
    location: 'Surulere, Lagos',
    phone: '+234 806 774 2210',
    website: 'https://afrobeatlive.example.com',
    email: 'bookings@afrobeatlive.example.com',
    opening_hours: 'Bookings: Mon–Sun',
    image_url: px(1105666),
    rating: 4.8,
    status: 'open',
    verified: true,
    user_id: 'sample',
  },
};
