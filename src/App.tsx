import { Suspense } from 'react';
import { lazyRoute } from './lib/lazyRoute';
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
const Businesses = lazyRoute(() => import('./pages/Businesses'));
const Discover = lazyRoute(() => import('./pages/Discover'));
const Keeps = lazyRoute(() => import('./pages/Keeps'));
const Nearby = lazyRoute(() => import('./pages/Nearby'));
const OpenNow = lazyRoute(() => import('./pages/OpenNow'));
const Offers = lazyRoute(() => import('./pages/Offers'));
const Founding = lazyRoute(() => import('./pages/Founding'));
const Campaign = lazyRoute(() => import('./pages/Campaign'));
const BusinessDetail = lazyRoute(() => import('./pages/BusinessDetail'));
const Adverts = lazyRoute(() => import('./pages/Adverts'));
const AdvertDetail = lazyRoute(() => import('./pages/AdvertDetail'));
const Media = lazyRoute(() => import('./pages/Media'));
const MediaDetail = lazyRoute(() => import('./pages/MediaDetail'));
const OrderStatus = lazyRoute(() => import('./pages/OrderStatus'));
const SendBusiness = lazyRoute(() => import('./pages/SendBusiness'));
const Nominate = lazyRoute(() => import('./pages/Nominate'));
const IndustryExamplePage = lazyRoute(() => import('./pages/IndustryExamplePage'));
const Login = lazyRoute(() => import('./pages/Login'));
const Register = lazyRoute(() => import('./pages/Register'));
const Profile = lazyRoute(() => import('./pages/Profile'));
const Security = lazyRoute(() => import('./pages/Security'));
const Studio = lazyRoute(() => import('./pages/Studio'));
const DiscoveryPage = lazyRoute(() => import('./pages/DiscoveryPage'));
const Dashboard = lazyRoute(() => import('./pages/Dashboard'));
const AdminDashboard = lazyRoute(() => import('./pages/AdminDashboard'));
const AdminCreator = lazyRoute(() => import('./pages/AdminCreator'));
const DigitalForms = lazyRoute(() => import('./pages/DigitalForms'));
const Pricing = lazyRoute(() => import('./pages/Pricing'));
const Waitlist = lazyRoute(() => import('./pages/Waitlist'));
const Founder = lazyRoute(() => import('./pages/Founder'));
const Platform = lazyRoute(() => import('./pages/Platform'));
const NowOpenOs = lazyRoute(() => import('./pages/NowOpenOs'));
const Forms = lazyRoute(() => import('./pages/Forms'));
const ForgotPassword = lazyRoute(() => import('./pages/ForgotPassword'));
const ResetPassword = lazyRoute(() => import('./pages/ResetPassword'));
const Terms = lazyRoute(() => import('./pages/Terms'));
const Privacy = lazyRoute(() => import('./pages/Privacy'));
const About = lazyRoute(() => import('./pages/About'));
const Contact = lazyRoute(() => import('./pages/Contact'));
const NotFound = lazyRoute(() => import('./pages/NotFound'));

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
      {/*
        * The STICKY lives here, not on the <nav> inside.
        *
        * A sticky element can only travel within its containing block, and
        * this <header> is exactly as tall as the nav — so a `sticky top-0`
        * on the nav had a range of zero pixels and scrolled away with the
        * page. It was measured doing exactly that on production: at scroll
        * 900, the nav's top was -900.
        *
        * The <header> was added later, for the banner landmark, and silently
        * capped the sticky it was wrapping. Moving the positioning out here
        * gives it the full height of the page to stick against; the nav keeps
        * its own background and border.
        */}
      <header className="sticky top-0 z-50">
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
              <Route path="/offers" element={<Offers />} />
              <Route path="/founding" element={<Founding />} />
              {/* Canonical campaign URL, plus the two short aliases meant for
                  posters, QR codes and creator videos. All three render the same
                  page; applySeo points the canonical tag at the first, so the
                  aliases never compete with it in search. */}
              <Route path="/campaign/founding-1000" element={<Campaign />} />
              <Route path="/founding-1000" element={<Campaign />} />
              <Route path="/join" element={<Campaign />} />
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
              {/* Tracking a Create order. Placed without an account, so the
                  reference in the URL is the only way back to it. Static
                  segment, so it ranks above the /:username catch-all. */}
              <Route path="/order" element={<OrderStatus />} />
              <Route path="/order/:reference" element={<OrderStatus />} />
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
              {/* NOWOPEN YOUR BUSINESS. /send-business is the canonical
                  campaign URL — it is what goes on the flyer, the QR code and
                  the WhatsApp status. The other two are aliases people will
                  type or half-remember; applySeo points the canonical tag at
                  the first, so they never compete with it in search. */}
              <Route path="/send-business" element={<SendBusiness />} />
              <Route path="/send-your-business" element={<SendBusiness />} />
              <Route path="/yourbusiness" element={<SendBusiness />} />
              <Route path="/nominate" element={<Nominate />} />
              {/* Industry page examples. NOT under /business/ — that namespace
                  belongs to real businesses, and an example living there would
                  put an invented company one URL away from looking real. */}
              <Route path="/example" element={<IndustryExamplePage />} />
              <Route path="/example/:slug" element={<IndustryExamplePage />} />
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
