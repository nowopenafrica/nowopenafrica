/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test runner config, kept separate from vite.config.ts so the production
// build is never affected by test settings.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // The shell smoke tests mount every admin section in one go: ~2s alone, but
    // several seconds under full-suite contention. Vitest's 5s default left no
    // headroom, so they passed or failed depending on machine load rather than
    // on the code. A hung test still fails here — just not a merely slow one.
    testTimeout: 20_000,
    // Edge functions are Deno and mostly unreachable from Node, but the LLM
    // provider layer is pure TypeScript with no remote imports, so its tests run
    // here rather than being untested until deploy.
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'supabase/functions/**/*.{test,spec}.ts',
    ],
    css: false,
  },
});
