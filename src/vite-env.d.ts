/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (required — src/lib/supabase.ts throws without it). */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase anon/publishable key (required). */
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Paystack public key. When unset, checkout captures pre-launch reservations as leads. */
  readonly VITE_PAYSTACK_PUBLIC_KEY?: string;
  /**
   * OpenAI Code Center engine: 'builtin' (default) or 'opencode'. When
   * 'opencode', sessions are powered by the hosted OpenCode server through the
   * ai-command edge function's opencode.* actions. Leave unset in production
   * until the OpenCode engine is deployed and its secrets are set.
   */
  readonly VITE_AI_ENGINE?: 'builtin' | 'opencode';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
