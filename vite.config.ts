import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Discovery is a serverless function that sets the User-Agent a browser
 * cannot (the source's stated condition for automated access). In dev the
 * admin panel fetches the same relative URL; this plugin runs the LOCAL
 * api/acquire/* handler — via Vite's SSR loader — so dev exercises the exact
 * endpoint code (including its exclude list, licence checks, key guard and
 * User-Agent), not a stale production deployment. Registered through
 * configureServer so it runs before Vite's own file server, which otherwise
 * wins because api/ lives under the project root.
 */
function acquireDevProxy(): Plugin {
  const routes = ['wikidata', 'google'];
  return {
    name: 'acquire-dev-proxy',
    configureServer(server) {
      for (const route of routes) {
        server.middlewares.use(`/api/acquire/${route}`, (req, res) => {
          void (async () => {
            try {
              const mod = await server.ssrLoadModule(`/api/acquire/${route}.ts`);
              const handler = (mod as { default?: unknown }).default;
              if (typeof handler !== 'function') throw new Error('handler is not a function');
              const full = (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/';
              const url = new URL(full, `http://${(req as { headers?: { host?: string } }).headers?.host ?? 'localhost'}`);
              const query: Record<string, string> = {};
              url.searchParams.forEach((v, k) => { query[k] = v; });
              const fakeReq = { method: req.method ?? 'GET', query };
              const fakeRes = {
                status(code: number) { res.statusCode = code; return fakeRes; },
                setHeader: (name: string, value: string) => { res.setHeader(name, value); },
                json: (body: unknown) => {
                  if (!res.headersSent) res.setHeader('content-type', 'application/json');
                  res.end(JSON.stringify(body));
                },
              } as never;
              await (handler as (r: typeof fakeReq, s: typeof fakeRes) => void | Promise<void>)(fakeReq, fakeRes);
            } catch {
              if (!res.headersSent) {
                res.writeHead(502, { 'content-type': 'application/json' });
              }
              res.end(JSON.stringify({ error: 'Could not reach the discovery endpoint.' }));
            }
          })();
        });
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), acquireDevProxy()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * Split the framework out of the app bundle.
         *
         * Measured before this: the homepage's initial JavaScript was a single
         * 194 KB gzip chunk holding React, React DOM, React Router and the
         * Supabase client alongside every piece of app code. Everything else
         * was already lazily loaded and correctly split — this was the one
         * remaining lump.
         *
         * The problem is not its size so much as its churn. Because framework
         * and app code shared one content-hashed file, ANY change to ANY app
         * file invalidated all 194 KB. This project deploys several times a
         * day, and its audience pays for data by the megabyte on connections
         * that make a re-download expensive — so a returning visitor was
         * re-fetching React itself because a caption changed.
         *
         * Separated, the vendor chunk's hash changes only when a dependency
         * does, which is rare, so it survives in the browser cache across
         * deploys and a repeat visit downloads just the app delta.
         *
         * Two groups on purpose. Finer splitting trades fewer bytes for more
         * round trips, and on high-latency mobile links the round trips
         * usually cost more than the bytes saved.
         */
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
    /*
     * Raised from Vite's 500 KB default, with a reason rather than to silence
     * it. Studio, ContentFactory, AdminCreator and jspdf are all legitimately
     * over it and all already lazily loaded, so none sits on the path of a
     * visitor who just wants to find a business. Warning on them every build
     * trains everyone to ignore build output, which is worse than no warning.
     * 700 KB still catches something genuinely new and large.
     */
    chunkSizeWarningLimit: 700,
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
    /*
     * Same-origin proxy for the AI Command Center. The browser talks to
     * /sb-fn/ai-command and Vite forwards it to the platform's function
     * endpoint, so dev hits zero CORS just like prod (which uses the matching
     * Vercel rewrite in vercel.json). The project ref below mirrors .env.
     */
    proxy: {
      '/sb-fn': {
        target: 'https://wvayqqfqqocwjripugnb.supabase.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sb-fn/, '/functions/v1'),
      },
    },
  },
});
