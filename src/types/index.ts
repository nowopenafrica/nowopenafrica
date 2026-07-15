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
  rating?: number;
  status?: string;
  hours?: string;
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
