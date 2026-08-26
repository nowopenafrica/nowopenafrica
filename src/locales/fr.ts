import type { Dictionary } from '../lib/i18n';

// French — the second language of the platform, and the first one worth
// adding: the supported currency list already includes the West African CFA
// (Senegal, Côte d'Ivoire and six more) and the Moroccan dirham, so these are
// markets NowOpen bills in but could not talk to.
//
// Written, not generated. Two choices worth recording:
//
//   * "NowOpen" is never translated. It is the brand, and "Maintenant Ouvert"
//     would break every URL, logo and sentence built around the pun.
//   * "Meet the Founder" became "Qui est derrière NowOpen". French forces a
//     gender on "fondateur" that the English page deliberately never states —
//     the founder page names a person and a role, and no pronoun. The neutral
//     phrasing keeps that true instead of inventing it in translation.
//
// Any key omitted here renders the English from en.ts, wrapped in lang="en" so
// a screen reader does not read English words with French pronunciation.

const fr: Dictionary = {
  // ---- Navigation -------------------------------------------------------
  'nav.home': 'Accueil',
  'nav.discover': 'Découvrir',
  'nav.promote': 'Promouvoir',
  'nav.create': 'Créer',
  'nav.africaNowOpen': "L'Afrique est NowOpen",
  'nav.platform': 'La plateforme NowOpen',
  'nav.platform.desc': "Systèmes d'exploitation par secteur",
  'nav.os': "L'OS NowOpen",
  'nav.os.desc': 'Notre façon de fonctionner',
  'nav.join': 'Rejoindre NowOpen',
  'nav.join.desc': 'Un seul formulaire, toutes les relations',
  'nav.vision.desc': "La vision et la liste d'attente",
  'nav.pricing': 'Tarifs',
  'nav.pricing.desc': 'Des forfaits pour chaque entreprise africaine',
  'nav.joinMobile': 'Rejoindre NowOpen — postulez ici',
  'nav.waitlistMobile': "L'Afrique est NowOpen — inscrivez-vous à la liste d'attente",
  'nav.dashboard': 'Tableau de bord',
  'nav.adminCreator': 'Créateur admin',
  'nav.signIn': 'Se connecter',
  'nav.signOut': 'Se déconnecter',
  'nav.openMenu': 'Ouvrir le menu',
  'nav.closeMenu': 'Fermer le menu',

  // ---- Language selector ------------------------------------------------
  'lang.label': 'Langue',
  'lang.change': 'Changer de langue',

  // ---- Footer -----------------------------------------------------------
  'footer.blurb':
    "Le système d'exploitation de la croissance des entreprises en Afrique — pour se faire connaître, faire de la publicité efficacement et accéder à des services créatifs depuis un seul écosystème.",
  'footer.location': 'Lagos, Nigeria · Présent sur plus de 20 marchés africains',
  'footer.explore': 'Explorer',
  'footer.company': "L'entreprise",
  'footer.getStarted': 'Commencer',
  'footer.discoverBusinesses': 'Découvrir des entreprises',
  'footer.industrySystems': 'Systèmes sectoriels',
  'footer.adPlacements': 'Espaces publicitaires',
  'footer.creativeServices': 'Services créatifs',
  'footer.about': 'À propos',
  'footer.founder': 'Qui est derrière NowOpen',
  'footer.contact': 'Contact',
  'footer.createAccount': 'Créer un compte',
  'footer.terms': 'Conditions',
  'footer.privacy': 'Confidentialité',
  'footer.rights': '© {year} NowOpen Africa (AEY Inc.). Tous droits réservés.',

  // ---- Route announcements (accessibility) ------------------------------
  'a11y.pageLoadedSuffix': '— page chargée',
  'a11y.page': 'Page',
  'a11y.skipToContent': 'Aller au contenu principal',
};

export default fr;
