import type { Dictionary } from '../lib/i18n';

// The reference dictionary. Every other locale is measured against it, and
// every key any locale uses must exist here — English is what shows through
// when a translation is missing, so a key absent from this file has no floor
// to fall back to.

const en: Dictionary = {
  // ---- Navigation -------------------------------------------------------
  'nav.home': 'Home',
  'nav.discover': 'Discover',
  'nav.promote': 'Promote',
  'nav.create': 'Create',
  'nav.africaNowOpen': 'Africa is NowOpen',
  'nav.platform': 'The NowOpen Platform',
  'nav.platform.desc': 'Industry operating systems',
  'nav.os': 'The NowOpen OS',
  'nav.os.desc': 'How we run ourselves',
  'nav.join': 'Join NowOpen',
  'nav.join.desc': 'One form, every relationship',
  'nav.vision.desc': 'The vision & waitlist',
  'nav.pricing': 'Pricing',
  'nav.pricing.desc': 'Plans for every African business',
  'nav.joinMobile': 'Join NowOpen — apply here',
  'nav.waitlistMobile': 'Africa is NowOpen — Join the waitlist',
  'nav.dashboard': 'Dashboard',
  'nav.adminCreator': 'Admin Creator',
  'nav.signIn': 'Sign In',
  'nav.signOut': 'Sign Out',
  'nav.openMenu': 'Open menu',
  'nav.closeMenu': 'Close menu',

  // ---- Language selector ------------------------------------------------
  'lang.label': 'Language',
  'lang.change': 'Change language',

  // ---- Footer -----------------------------------------------------------
  'footer.blurb':
    'The Operating System for Business Growth in Africa — helping businesses get discovered, advertise effectively, and access creative services from one ecosystem.',
  'footer.location': 'Lagos, Nigeria · Serving 20+ African markets',
  'footer.explore': 'Explore',
  'footer.company': 'Company',
  'footer.getStarted': 'Get Started',
  'footer.discoverBusinesses': 'Discover Businesses',
  'footer.industrySystems': 'Industry Systems',
  'footer.adPlacements': 'Ad Placements',
  'footer.creativeServices': 'Creative Services',
  'footer.about': 'About Us',
  'footer.founder': 'Meet the Founder',
  'footer.contact': 'Contact',
  'footer.createAccount': 'Create an Account',
  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'footer.rights': '© {year} NowOpen Africa (AEY Inc.). All rights reserved.',

  // ---- Route announcements (accessibility) ------------------------------
  'a11y.pageLoadedSuffix': '— page loaded',
  'a11y.page': 'Page',
  'a11y.skipToContent': 'Skip to main content',
};

export default en;
