/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (required — src/lib/supabase.ts throws without it). */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon/publishable key (required). */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Paystack public key. When unset, checkout captures pre-launch reservations as leads. */
  readonly VITE_PAYSTACK_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
