export interface Advertisement {
  id: string;
  title: string;
  description: string;
  type?: string;
  category?: string;
  location?: string;
  price_per_day?: number;
  pricing?: number;
  budget?: number;
  duration?: number;
  dimensions?: string;
  traffic_density?: string;
  available_until?: string;
  awards?: string | null;
  status?: string;
  image_url?: string;
  media_urls?: string[];
  user_id?: string;
  business_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Alias kept for older imports (e.g. Dashboard)
export type Advert = Advertisement;

export interface Business {
  id: string;
  username?: string;
  verified?: boolean;
  name: string;
  description: string;
  category: string;
  location: string;
  phone?: string;
  website?: string;
  email?: string;
  image_url?: string;
  logo_url?: string;
  rating?: number;
  status?: string;
  hours?: string;
  // Owner-selected booking module keys (from categoryFeatures). null/undefined
  // = show all of the category's modules (legacy default).
  enabled_modules?: string[] | null;
  // Up to 3 extra categories the business also serves (from categories.ts), so
  // multi-service businesses appear in more directory filters and searches.
  // null/undefined = no secondary categories (legacy default).
  secondary_categories?: string[] | null;
  // Trust & verification (admin-set; see lib/trust.ts)
  verification_tier?: string | null;
  trust_score?: number | null;
  email_verified?: boolean;
  phone_verified?: boolean;
  id_verified?: boolean;
  registration_verified?: boolean;
  address_verified?: boolean;
  documents_reviewed?: boolean;
  onsite_verified?: boolean;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MediaService {
  id: string;
  title: string;
  description: string;
  service_type: string;
  pricing?: number;
  pricing_model?: string;
  delivery_time?: string;
  clients_served?: number;
  rating?: number;
  review_count?: number;
  equipment?: string;
  portfolio_images?: string[];
  portfolio_url?: string;
  additional_info?: string;
  image_url?: string;
  thumbnail_url?: string;
  category?: string;
  reach?: number;
  revisions?: number | string;
  status?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: string;
  email?: string;
  role?: string;
  name?: string;
  bio?: string;
  location?: string;
  website?: string;
  phone?: string;
  profile_image_url?: string;
  cover_image_url?: string;
  skills?: string;
  experience?: string;
  education?: string;
  awards?: string;
  services?: string;
  created_at?: string;
  updated_at?: string;
}
