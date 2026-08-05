/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Free Pexels API key used to film reels with real stock footage. */
  readonly VITE_PEXELS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
