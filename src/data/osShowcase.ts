// Live-demo showcase for the /platform page. Each entry is a real curated
// spotlight business (the same records BusinessDetail renders), paired with a
// short line describing the standout feature of that industry's operating
// system. Pulling straight from the spotlight records means a card's image,
// name and link always match the live profile it points to.

import { SPOTLIGHT_BUSINESSES } from './sampleProperties';
import { MENU_SPOTLIGHTS } from './sampleMenu';
import { HOTEL_SPOTLIGHTS } from './sampleHotel';
import { CAR_SPOTLIGHTS } from './sampleCars';
import { PHARMACY_SPOTLIGHTS } from './samplePharmacy';
import { FITNESS_SPOTLIGHTS } from './sampleFitness';
import { BEAUTY_SPOTLIGHTS } from './sampleBeauty';
import { HEALTH_SPOTLIGHTS } from './sampleHealth';
import { FASHION_SPOTLIGHTS } from './sampleFashion';
import { EDUCATION_SPOTLIGHTS } from './sampleEducation';
import { PHOTO_SPOTLIGHTS } from './samplePhotography';
import { TRANSPORT_SPOTLIGHTS } from './sampleTransport';
import { EVENT_SPOTLIGHTS } from './sampleEvents';
import { RETAIL_SPOTLIGHTS } from './sampleRetail';
import { AGRICULTURE_SPOTLIGHTS } from './sampleAgriculture';
import { LEGAL_SPOTLIGHTS } from './sampleLegal';
import { SERVICE_PROVIDER_SPOTLIGHTS } from './sampleServiceProviders';
import { FINANCE_SPOTLIGHTS } from './sampleFinance';
import { MANUFACTURING_SPOTLIGHTS } from './sampleManufacturing';
import { CONSTRUCTION_SPOTLIGHTS } from './sampleConstruction';
import { TRAVEL_SPOTLIGHTS } from './sampleTravel';
import { AUTOMOTIVE_SPOTLIGHTS } from './sampleAutomotive';
import { CHILDCARE_SPOTLIGHTS } from './sampleChildcare';
import { MUSIC_SPOTLIGHTS } from './sampleMusic';
import { DESIGN_SPOTLIGHTS } from './sampleDesign';
import { INSURANCE_SPOTLIGHTS } from './sampleInsurance';
import { ACCOUNTING_SPOTLIGHTS } from './sampleAccounting';
import { MARKETING_SPOTLIGHTS } from './sampleMarketing';
import { MONEY_SPOTLIGHTS } from './sampleMoney';
import { SOFTWARE_SPOTLIGHTS } from './sampleSoftware';
import { REPAIR_SPOTLIGHTS } from './sampleRepair';
import { NEW_INDUSTRY_SPOTLIGHTS } from './sampleNewIndustries';
import { MORE_SPOTLIGHTS } from './sampleMore';

const ALL: Record<string, any> = {
  ...SPOTLIGHT_BUSINESSES, ...MENU_SPOTLIGHTS, ...HOTEL_SPOTLIGHTS, ...CAR_SPOTLIGHTS,
  ...PHARMACY_SPOTLIGHTS, ...FITNESS_SPOTLIGHTS, ...BEAUTY_SPOTLIGHTS, ...HEALTH_SPOTLIGHTS,
  ...FASHION_SPOTLIGHTS, ...EDUCATION_SPOTLIGHTS, ...PHOTO_SPOTLIGHTS, ...TRANSPORT_SPOTLIGHTS,
  ...EVENT_SPOTLIGHTS, ...RETAIL_SPOTLIGHTS, ...AGRICULTURE_SPOTLIGHTS, ...LEGAL_SPOTLIGHTS,
  ...SERVICE_PROVIDER_SPOTLIGHTS, ...FINANCE_SPOTLIGHTS, ...MANUFACTURING_SPOTLIGHTS,
  ...CONSTRUCTION_SPOTLIGHTS, ...TRAVEL_SPOTLIGHTS, ...AUTOMOTIVE_SPOTLIGHTS,
  ...CHILDCARE_SPOTLIGHTS, ...MUSIC_SPOTLIGHTS, ...DESIGN_SPOTLIGHTS, ...INSURANCE_SPOTLIGHTS,
  ...ACCOUNTING_SPOTLIGHTS, ...MARKETING_SPOTLIGHTS, ...MONEY_SPOTLIGHTS, ...SOFTWARE_SPOTLIGHTS,
  ...REPAIR_SPOTLIGHTS, ...NEW_INDUSTRY_SPOTLIGHTS, ...MORE_SPOTLIGHTS,
};

// Ordered curator list: spotlight id → the standout feature of that OS.
const CURATED: { id: string; blurb: string }[] = [
  { id: 'business_37', blurb: 'Property portal with listings, viewings & a mortgage calculator' },
  { id: 'business_38', blurb: 'Live menu, specials strip & table reservations' },
  { id: 'business_39', blurb: 'Room booking with dates, facilities & guest counts' },
  { id: 'business_40', blurb: 'Vehicle inventory with specs & a finance calculator' },
  { id: 'business_41', blurb: 'Medicine catalogue, Rx uploads & pharmacist chat' },
  { id: 'business_42', blurb: 'Membership plans & a bookable class schedule' },
  { id: 'business_43', blurb: 'Treatment menu, stylists & a recent-looks gallery' },
  { id: 'business_44', blurb: 'Departments, doctors & telemedicine booking' },
  { id: 'business_45', blurb: 'Catalogue with sizes, size guide & fittings' },
  { id: 'business_46', blurb: 'Programmes, admissions & apply-now flow' },
  { id: 'business_47', blurb: 'Genre portfolio, gear list & session packages' },
  { id: 'business_48', blurb: 'Routes, schedules & book-a-seat with seat counts' },
  { id: 'business_49', blurb: 'Vendor directory with a build-your-own bundle' },
  { id: 'business_50', blurb: 'Fresh-produce storefront with search & per-unit pricing' },
  { id: 'business_51', blurb: 'Farm market with wholesale, export & in-season flags' },
  { id: 'business_52', blurb: 'Practice areas, secure docs & consultation booking' },
  { id: 'business_53', blurb: 'On-demand services with emergency call & live ETA' },
  { id: 'business_54', blurb: 'Loan products with an inline repayment calculator' },
  { id: 'business_55', blurb: 'Product lines, MOQ units & a wholesale quote cart' },
  { id: 'business_56', blurb: 'Completed-projects gallery & request-a-quote' },
  { id: 'business_57', blurb: 'Holiday packages, visa help & flight booking' },
  { id: 'business_58', blurb: 'Workshop services, warranty badges & roadside help' },
  { id: 'business_59', blurb: 'Age-group programmes, safety badges & book-a-tour' },
  { id: 'business_60', blurb: 'Acts, past-performance reel & book-a-performance' },
  { id: 'business_61', blurb: 'Portfolio, tool badges & start-a-project' },
  { id: 'business_62', blurb: 'Policy classes, claims & speak-to-an-agent' },
  { id: 'business_63', blurb: 'Service lines, credentials & compliance calendar' },
  { id: 'business_65', blurb: 'Results-proof stats, channels & start-a-campaign' },
  { id: 'business_66', blurb: 'Cash-out, transfers, airtime & bill payments' },
  { id: 'business_67', blurb: 'Delivery stats, tech stack & start-a-project' },
  { id: 'business_68', blurb: 'Phone, laptop & camera repair with a warranty flow' },
  { id: 'business_64', blurb: 'Streetwear storefront with sizes, stock & shop-the-drop' },
  { id: 'business_69', blurb: 'Vet care with vaccinations, grooming, boarding & emergency' },
  { id: 'business_70', blurb: 'Treatments, therapist picker & wellness memberships' },
  { id: 'business_71', blurb: 'Live worship, service times, giving & volunteer signup' },
  { id: 'business_72', blurb: 'Fresh bakes, custom cakes & same-day delivery' },
  { id: 'business_73', blurb: 'Cocktails, table reservations & a live DJ schedule' },
  { id: 'business_74', blurb: 'Homestyle menu, table booking & delivery' },
  { id: 'business_75', blurb: 'Garden-view rooms, dates & weekend packages' },
  { id: 'business_76', blurb: 'Medicine catalogue, Rx uploads & same-day delivery' },
  { id: 'business_77', blurb: 'Membership tiers, class schedule & a coach picker' },
  { id: 'business_78', blurb: 'Term programmes, admissions & JAMB-prep track' },
  { id: 'business_79', blurb: 'Décor packages, vendor picks & build-your-own bundle' },
  { id: 'business_80', blurb: 'Completed-builds gallery & a request-a-quote flow' },
  { id: 'business_81', blurb: 'Listings, agent chat & a mortgage calculator' },
];

export interface ShowcaseCard {
  username: string;
  name: string;
  category: string;
  image: string;
  location?: string;
  blurb: string;
}

export const OS_SHOWCASE: ShowcaseCard[] = CURATED
  .map(({ id, blurb }) => {
    const b = ALL[id];
    if (!b) return null;
    return {
      username: b.username,
      name: b.name,
      category: b.category,
      image: b.image_url,
      location: b.location,
      blurb,
    };
  })
  .filter(Boolean) as ShowcaseCard[];
