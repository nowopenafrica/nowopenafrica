import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/layout/Navigation';
import Footer from './components/layout/Footer';
import ScrollToTop from './components/ScrollToTop';
import ErrorBoundary from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import ChatBot from './components/ChatBot';
import VoiceAssistant from './components/VoiceAssistant';
import TrialPromoModal from './components/TrialPromoModal';
import CookieConsent from './components/CookieConsent';
import RouteAnnouncer from './components/RouteAnnouncer';
import { useI18n } from './contexts/I18nContext';
import { contentLocale } from './lib/i18n';
import Home from './pages/Home';
import './index.css';

// Route-level code splitting: only Home ships in the main bundle so the
// landing page paints fast on slow connections; everything else loads on demand.
const Businesses = lazy(() => import('./pages/Businesses'));
const Discover = lazy(() => import('./pages/Discover'));
const Keeps = lazy(() => import('./pages/Keeps'));
const Nearby = lazy(() => import('./pages/Nearby'));
const OpenNow = lazy(() => import('./pages/OpenNow'));
const BusinessDetail = lazy(() => import('./pages/BusinessDetail'));
const Adverts = lazy(() => import('./pages/Adverts'));
const AdvertDetail = lazy(() => import('./pages/AdvertDetail'));
const Media = lazy(() => import('./pages/Media'));
const MediaDetail = lazy(() => import('./pages/MediaDetail'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Profile = lazy(() => import('./pages/Profile'));
const Security = lazy(() => import('./pages/Security'));
const Studio = lazy(() => import('./pages/Studio'));
const DiscoveryPage = lazy(() => import('./pages/DiscoveryPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminCreator = lazy(() => import('./pages/AdminCreator'));
const DigitalForms = lazy(() => import('./pages/DigitalForms'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Waitlist = lazy(() => import('./pages/Waitlist'));
const Founder = lazy(() => import('./pages/Founder'));
const Platform = lazy(() => import('./pages/Platform'));
const NowOpenOs = lazy(() => import('./pages/NowOpenOs'));
const Forms = lazy(() => import('./pages/Forms'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const NotFound = lazy(() => import('./pages/NotFound'));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
    </div>
  );
}

function App() {
  const { pathname } = useLocation();
  const { locale, t } = useI18n();

  // overflow-x-clip, not overflow-x-hidden. The marquee sliders clip their own
  // tracks correctly, but their fractional widths still left the document 7px
  // wider than the viewport — enough for a horizontal scrollbar across the whole
  // site. `hidden` would also fix it, but a hidden axis makes the other axis
  // compute to auto, turning this div into a scroll container and breaking every
  // position:sticky inside it (the Studio preview panes). `clip` removes the
  // overflow without creating a scroll container.
  return (
    <div className="min-h-screen flex flex-col overflow-x-clip bg-gray-50 dark:bg-gray-900">
      <ScrollToTop />
      {/* Skip link. The nav carries ~20 focusable items on every page, so a
          keyboard or screen-reader user otherwise traverses all of them before
          reaching content, on every navigation. Visually hidden until focused
          rather than display:none, which would remove it from the tab order and
          defeat the point. */}
      <a
        href="#main-content"
        className="absolute left-3 -top-20 z-[100] inline-flex items-center min-h-[44px] px-4 rounded-lg bg-gray-900 text-white text-sm font-semibold shadow-lg transition-[top] duration-150 focus:top-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        {t('a11y.skipToContent')}
      </a>
      {/* <header> wraps the nav so assistive tech has a banner landmark to jump
          to. Navbar renders a <nav>, which is a navigation landmark but not a
          banner, so the region was simply absent. */}
      {/* Announces each route change and moves focus into <main>. A SPA does
          neither on its own, so navigation was silent and focus was stranded
          on the previous page. */}
      <RouteAnnouncer />
      <header>
        <Navbar />
      </header>
      {/* tabIndex={-1} so the skip target can actually receive focus; without it
          the browser scrolls but focus stays in the nav. */}
      {/* lang on <main>, not just <html>: the chrome is translated and the page
          bodies are not yet, so this declares what language the content is
          actually in. Without it a French screen reader reads English prose
          with French pronunciation. */}
      <main
        id="main-content"
        tabIndex={-1}
        lang={contentLocale(pathname, locale)}
        className="flex-grow focus:outline-none"
      >
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/businesses" element={<Businesses />} />
              {/* The people side. Declared before /:username for readability;
                  the router ranks static segments above the dynamic one anyway,
                  and middleware.ts reserves these slugs so a crawler asking for
                  /keeps is not handed the business-profile renderer. */}
              <Route path="/discover" element={<Discover />} />
              <Route path="/keeps" element={<Keeps />} />
              <Route path="/nearby" element={<Nearby />} />
              <Route path="/open-now" element={<OpenNow />} />
              {/* Discovery pages before /businesses/:id — otherwise "in"
                  is parsed as a business id and the page 404s. */}
              <Route path="/businesses/in/:place" element={<DiscoveryPage />} />
              <Route path="/businesses/:category/in/:place" element={<DiscoveryPage />} />
              <Route path="/businesses/:id" element={<BusinessDetail />} />
              {/* Friendly profile URLs at the root, e.g. /kalahari-films.
                  Static routes above always win over this dynamic segment.
                  /business/:username is kept for backwards compatibility. */}
              <Route path="/business/:username" element={<BusinessDetail />} />
              <Route path="/:username" element={<BusinessDetail />} />
              <Route path="/adverts" element={<Adverts />} />
              <Route path="/adverts/:id" element={<AdvertDetail />} />
              <Route path="/media" element={<Media />} />
              <Route path="/media/:id" element={<MediaDetail />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/digital-forms" element={<DigitalForms />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/waitlist" element={<Waitlist />} />
              {/* Founder hub. Static path — ranks above the /:username catch-all. */}
              <Route path="/founder" element={<Founder />} />
              <Route path="/platform" element={<Platform />} />
              <Route path="/os" element={<NowOpenOs />} />
              {/* Universal Forms Hub — one public URL for every relationship
                  journey. Static route, ranked above the /:username catch-all. */}
              <Route path="/forms" element={<Forms />} />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />
              <Route path="/security" element={
                <ProtectedRoute>
                  <Security />
                </ProtectedRoute>
              } />
              <Route path="/studio" element={
                <ProtectedRoute>
                  <Studio />
                </ProtectedRoute>
              } />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              {/* Route-level gate: requires a signed-in admin (or the dev-only
                  ?preview mode). The pages still re-check the role and RLS
                  backs every read — this is defence in depth. */}
              <Route path="/admin" element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              } />
              {/* Internal growth operating system — same role gating + preview. */}
              <Route path="/admin-creator" element={
                <AdminRoute>
                  <AdminCreator />
                </AdminRoute>
              } />
              {/* Multi-segment unknown URLs land here. Single-segment unknowns
                  match /:username above → BusinessDetail renders NotFound when
                  no business is found. */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <ChatBot />
      {/* Hides itself on browsers without SpeechRecognition (notably most of
          Safari), so it never offers a control that cannot work. */}
      <VoiceAssistant />
      <TrialPromoModal />
      <CookieConsent />
      <Toaster position="top-right" />
    </div>
  );
}

export default App;
