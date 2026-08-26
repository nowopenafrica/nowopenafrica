import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { CurrencyProvider } from './contexts/CurrencyContext';
import { I18nProvider } from './contexts/I18nContext';
import './index.css';
import { initTelemetry } from './lib/telemetry';

// Warm up the connection to the Supabase origin as early as possible — its
// project ref isn't known at build time (it's a VITE_ env var), so we inject
// the preconnect here rather than statically in index.html. Shaves the TLS/DNS
// round-trip off the very first data + image request.
(() => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  if (!url) return;
  try {
    const origin = new URL(url).origin;
    for (const rel of ['preconnect', 'dns-prefetch']) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = origin;
      if (rel === 'preconnect') link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  } catch {
    /* malformed URL — skip the hint */
  }
})();

// Registered before render so an error thrown during the first paint is
// still reported. Two bugs last month were found by a human clicking
// rather than by anything reporting them.
initTelemetry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>
);
