// Shared template + format presets for the NowOpen Studio design engines
// (Social Studio, Flyer Generator, Poster Generator, Banner Generator). The
// DesignStudio component renders any template×format combination, so a new
// studio module is just a new preset list here.

export interface StudioTemplate {
  key: string;
  label: string;
  badge: string;
  headline: string;
  subline: string;
  accent: string;
}

export interface StudioFormat {
  key: string;
  label: string;
  w: number;
  h: number;
}

export interface StudioLayout {
  key: string;
  label: string;
  desc: string;
}

// --- Modern design layouts (Social Studio, Flyer, Poster & Banner) ----------
// The same occasion/industry content can be laid out several ways. Each layout
// is a distinct visual treatment inside DesignStudio — pick one, edit the text,
// export. Layouts are shared by every design engine.
export const STUDIO_LAYOUTS: StudioLayout[] = [
  { key: 'classic', label: 'Classic', desc: 'Balanced, brand-first' },
  { key: 'bold-center', label: 'Bold Center', desc: 'Big centered statement' },
  { key: 'split', label: 'Modern Split', desc: 'Photo left, panel right' },
  { key: 'minimal', label: 'Minimal', desc: 'Clean & airy light theme' },
  { key: 'punch', label: 'Gradient Punch', desc: 'Vivid diagonal gradient' },
  { key: 'framed', label: 'Framed', desc: 'Bold border, corner badge' },
  { key: 'vintage', label: 'Vintage', desc: 'Warm retro, serif print' },
  { key: 'glass', label: 'Glass', desc: 'Frosted glass over media' },
  { key: 'editorial', label: 'Editorial', desc: 'Magazine masthead style' },
  { key: 'neon', label: 'Neon Nights', desc: 'Glowing nightclub vibe' },
  { key: 'card', label: 'Card', desc: 'Paper card on accent backdrop' },
  { key: 'diagonal', label: 'Diagonal', desc: 'Angled accent corner wedge' },
  { key: 'brutalist', label: 'Brutalist', desc: 'Bold black & white frame' },
  { key: 'spotlight', label: 'Spotlight', desc: 'Stage glow, centered message' },
  { key: 'ribbons', label: 'Ribbon Bands', desc: 'Slanted accent ribbons' },
  { key: 'synthwave', label: 'Synthwave', desc: 'Retro 80s sunset + grid' },
  { key: 'chalkboard', label: 'Chalkboard', desc: 'Handwritten chalk on slate' },
  { key: 'newspaper', label: 'Newspaper', desc: 'Serif masthead, print rules' },
  { key: 'blueprint', label: 'Blueprint', desc: 'Technical drawing grid' },
  { key: 'offset', label: 'Offset Print', desc: 'Mis-registered print layers' },
];

export function layoutByKey(key: string): StudioLayout {
  return STUDIO_LAYOUTS.find((l) => l.key === key) || STUDIO_LAYOUTS[0];
}

// Darkens a #rrggbb colour by the given factor (0-1) — returns #rrggbb so the
// result can be fed into hexA()/gradients too.
export function darken(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - factor));
  const g = Math.round(((n >> 8) & 255) * (1 - factor));
  const b = Math.round((n & 255) * (1 - factor));
  const to = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

// --- Occasions (Social Studio + Flyer Generator) ---------------------------
export const OCCASION_TEMPLATES: StudioTemplate[] = [
  { key: 'now-open', label: 'Now Open', badge: 'NOW OPEN', headline: "We're Open for Business", subline: 'Come visit us today', accent: '#16a34a' },
  { key: 'grand-opening', label: 'Grand Opening', badge: 'GRAND OPENING', headline: 'Grand Opening!', subline: 'Join us to celebrate', accent: '#7c3aed' },
  { key: 'new-product', label: 'New Product', badge: 'NEW', headline: 'Just Arrived', subline: 'Check out our latest', accent: '#2563eb' },
  { key: 'weekend-offer', label: 'Weekend Offer', badge: 'WEEKEND OFFER', headline: 'This Weekend Only', subline: 'Special prices for you', accent: '#ea580c' },
  { key: 'flash-sale', label: 'Flash Sale', badge: 'FLASH SALE', headline: 'Flash Sale', subline: "Limited time — don't miss out", accent: '#dc2626' },
  { key: 'discount', label: 'Discount', badge: 'DISCOUNT', headline: 'Save Big Today', subline: 'In-store & online', accent: '#059669' },
  { key: 'happy-hour', label: 'Happy Hour', badge: 'HAPPY HOUR', headline: 'Happy Hour', subline: 'Unbeatable deals after 5pm', accent: '#f59e0b' },
  { key: 'thank-you', label: 'Thank You', badge: 'THANK YOU', headline: 'Thank You!', subline: 'We appreciate your support', accent: '#db2777' },
  { key: 'customer-appreciation', label: 'Appreciation', badge: 'CUSTOMER APPRECIATION', headline: 'You Mean The World To Us', subline: 'A gift for our loyal customers', accent: '#0d9488' },
  { key: 'referral', label: 'Referral', badge: 'REFER A FRIEND', headline: 'Bring A Friend', subline: 'You both get rewarded', accent: '#6366f1' },
  { key: 'hiring', label: 'Hiring', badge: "WE'RE HIRING", headline: "We're Hiring", subline: 'Join our growing team', accent: '#0891b2' },
  { key: 'holiday-hours', label: 'Holiday Hours', badge: 'HOLIDAY HOURS', headline: 'Holiday Hours', subline: 'See our updated schedule', accent: '#9333ea' },
  { key: 'anniversary', label: 'Anniversary', badge: 'ANNIVERSARY', headline: 'Years In Business', subline: 'Thank you for growing with us', accent: '#b45309' },
  { key: 'event', label: 'Event', badge: "DON'T MISS IT", headline: 'You Are Invited', subline: 'Join us for this event', accent: '#e11d48' },
];

export const SOCIAL_FORMATS: StudioFormat[] = [
  { key: 'instagram-post', label: 'Instagram Post', w: 1080, h: 1080 },
  { key: 'story', label: 'Story / WhatsApp Status', w: 1080, h: 1920 },
  { key: 'facebook-post', label: 'Facebook Post', w: 1200, h: 630 },
  { key: 'linkedin-post', label: 'LinkedIn Post', w: 1200, h: 627 },
  { key: 'tiktok', label: 'TikTok', w: 1080, h: 1920 },
  { key: 'x-post', label: 'X / Twitter', w: 1600, h: 900 },
  { key: 'pinterest', label: 'Pinterest', w: 1000, h: 1500 },
  { key: 'youtube-thumbnail', label: 'YouTube Thumbnail', w: 1280, h: 720 },
  { key: 'reels-cover', label: 'Reels Cover', w: 1080, h: 1920 },
];

export const FLYER_FORMATS: StudioFormat[] = [
  { key: 'a4', label: 'A4 Flyer', w: 1240, h: 1754 },
  { key: 'letter', label: 'US Letter', w: 1275, h: 1650 },
  { key: 'half-a4', label: 'Half A4 / DL', w: 1240, h: 877 },
];

// --- Industry posters (Poster Generator) ------------------------------------
export const POSTER_TEMPLATES: StudioTemplate[] = [
  { key: 'restaurant', label: 'Restaurant', badge: 'FRESH & LOCAL', headline: 'Taste The Difference', subline: 'Daily specials & home delivery', accent: '#dc2626' },
  { key: 'fashion', label: 'Fashion', badge: 'NEW COLLECTION', headline: 'New Season, New You', subline: 'Shop the latest styles', accent: '#db2777' },
  { key: 'property', label: 'Property', badge: 'FOR SALE', headline: 'Your Dream Home Awaits', subline: 'Viewings available this week', accent: '#2563eb' },
  { key: 'church', label: 'Church / Ministry', badge: 'YOU ARE WELCOME', headline: 'Join Us This Sunday', subline: 'Everyone is welcome', accent: '#7c3aed' },
  { key: 'medical', label: 'Medical', badge: 'YOUR HEALTH MATTERS', headline: 'Book Your Checkup', subline: 'Quality care, close to home', accent: '#0d9488' },
  { key: 'hotel', label: 'Hotel', badge: 'BOOK DIRECT', headline: 'Stay With Us', subline: 'Best rates when you book direct', accent: '#b45309' },
  { key: 'school', label: 'School', badge: 'ENROL NOW', headline: 'Shape Their Future', subline: 'Admissions open for this term', accent: '#16a34a' },
  { key: 'concert', label: 'Concert', badge: 'TICKETS ON SALE', headline: 'Live In Your City', subline: 'Get your tickets today', accent: '#e11d48' },
  { key: 'conference', label: 'Conference', badge: 'REGISTER TODAY', headline: 'Connect. Learn. Grow.', subline: 'Join industry leaders', accent: '#0891b2' },
  { key: 'campaign', label: 'Campaign', badge: 'JOIN THE MOVEMENT', headline: 'Make It Happen', subline: 'Be part of the change', accent: '#f97316' },
];

export const POSTER_FORMATS: StudioFormat[] = [
  { key: 'a3', label: 'A3 Poster', w: 1414, h: 2000 },
  { key: 'a4', label: 'A4 Poster', w: 1240, h: 1754 },
  { key: 'square', label: 'Square Poster', w: 1200, h: 1200 },
];

// --- Banners (Banner Generator) ---------------------------------------------
export const BANNER_TEMPLATES: StudioTemplate[] = [
  { key: 'website', label: 'Website', badge: 'WELCOME', headline: 'Welcome To Our World', subline: 'Visit us today', accent: '#4f46e5' },
  { key: 'billboard', label: 'Billboard', badge: 'NOW OPEN', headline: 'Big. Bold. Unmissable.', subline: 'Come see what the buzz is about', accent: '#dc2626' },
  { key: 'led', label: 'LED Screen', badge: 'LIVE', headline: 'Brighten Your Day', subline: 'Now showing', accent: '#0891b2' },
  { key: 'rollup', label: 'Roll-up', badge: 'EXHIBITORS WELCOME', headline: 'Come Say Hello', subline: 'Visit our stand today', accent: '#059669' },
  { key: 'backdrop', label: 'Backdrop', badge: 'PROUDLY PRESENTS', headline: 'Made With Pride', subline: 'A celebration of our craft', accent: '#b45309' },
  { key: 'street', label: 'Street Banner', badge: 'THIS WAY', headline: 'Right Here, Right Now', subline: 'You cannot miss us', accent: '#ea580c' },
  { key: 'facebook-cover', label: 'Facebook Cover', badge: 'FOLLOW US', headline: 'Part Of The Community', subline: 'Stay up to date', accent: '#2563eb' },
  { key: 'linkedin-cover', label: 'LinkedIn Cover', badge: 'OPEN TO WORK', headline: 'We Are Hiring', subline: 'Grow your career with us', accent: '#0a66c2' },
  { key: 'youtube-banner', label: 'YouTube Banner', badge: 'SUBSCRIBE', headline: 'Watch. Learn. Enjoy.', subline: 'New videos every week', accent: '#dc2626' },
  { key: 'email-header', label: 'Email Header', badge: 'GREAT NEWS', headline: 'Something Special For You', subline: 'Open to see more', accent: '#7c3aed' },
];

export const BANNER_FORMATS: StudioFormat[] = [
  { key: 'website-banner', label: 'Website Hero', w: 1920, h: 600 },
  { key: 'billboard', label: 'Billboard', w: 4500, h: 1500 },
  { key: 'led', label: 'LED Screen', w: 1600, h: 600 },
  { key: 'rollup', label: 'Roll-up', w: 1200, h: 2400 },
  { key: 'backdrop', label: 'Backdrop', w: 2400, h: 1200 },
  { key: 'street', label: 'Street Banner', w: 1200, h: 400 },
  { key: 'facebook-cover', label: 'Facebook Cover', w: 1640, h: 859 },
  { key: 'linkedin-cover', label: 'LinkedIn Cover', w: 1584, h: 396 },
  { key: 'youtube-banner', label: 'YouTube Banner', w: 2560, h: 1440 },
  { key: 'email-header', label: 'Email Header', w: 600, h: 200 },
];

// --- Promotions (Promotion Builder) -----------------------------------------
export const PROMO_TEMPLATES: StudioTemplate[] = [
  { key: 'percent-off', label: 'Percent Off', badge: 'SPECIAL OFFER', headline: '20% OFF Everything', subline: 'This weekend only — in-store & online', accent: '#dc2626' },
  { key: 'bogo', label: 'Buy One Get One', badge: "2 FOR 1", headline: 'Buy One, Get One Free', subline: 'Stock up while it lasts', accent: '#16a34a' },
  { key: 'loyalty', label: 'Loyalty Reward', badge: 'LOYALTY CLUB', headline: 'Buy 5, Get 1 Free', subline: 'Your loyalty card just got sweeter', accent: '#7c3aed' },
  { key: 'referral', label: 'Referral', badge: 'REFER A FRIEND', headline: 'Bring A Friend, Both Save', subline: 'Share the love — get rewarded', accent: '#6366f1' },
  { key: 'voucher', label: 'Gift Voucher', badge: 'GIFT CARD', headline: 'Give The Perfect Gift', subline: 'Vouchers available in-store', accent: '#db2777' },
  { key: 'free-delivery', label: 'Free Delivery', badge: 'FREE DELIVERY', headline: 'Free Delivery Over A Minimum', subline: 'Order today, doorstep tomorrow', accent: '#0d9488' },
  { key: 'bundle', label: 'Bundle Deal', badge: 'BUNDLE & SAVE', headline: 'Bundle & Save', subline: 'Pair your favourites at a better price', accent: '#ea580c' },
  { key: 'clearance', label: 'Clearance', badge: 'CLEARANCE', headline: 'Clearance Sale', subline: 'Limited stock — grab it while you can', accent: '#0891b2' },
];

export const PROMO_FORMATS: StudioFormat[] = [
  { key: 'square', label: 'Social Post', w: 1080, h: 1080 },
  { key: 'story', label: 'Story / WhatsApp Status', w: 1080, h: 1920 },
  { key: 'facebook-post', label: 'Facebook Post', w: 1200, h: 630 },
  { key: 'a4', label: 'A4 Flyer', w: 1240, h: 1754 },
  { key: 'poster', label: 'A3 Poster', w: 1414, h: 2000 },
];

// --- Design Studio (unified) -------------------------------------------------
// The Design Studio combines every size the design engines can produce into one
// format list, so a single template can become a story, flyer, poster or banner
// without switching tools.
export const DESIGN_FORMATS: StudioFormat[] = [
  { key: 'story', label: 'Story / WhatsApp Status', w: 1080, h: 1920 },
  { key: 'instagram-post', label: 'Instagram Post', w: 1080, h: 1080 },
  { key: 'facebook-post', label: 'Facebook Post', w: 1200, h: 630 },
  { key: 'linkedin-post', label: 'LinkedIn Post', w: 1200, h: 627 },
  { key: 'x-post', label: 'X / Twitter', w: 1600, h: 900 },
  { key: 'pinterest', label: 'Pinterest', w: 1000, h: 1500 },
  { key: 'youtube-thumbnail', label: 'YouTube Thumbnail', w: 1280, h: 720 },
  { key: 'a4', label: 'A4 Flyer / Poster', w: 1240, h: 1754 },
  { key: 'a3', label: 'A3 Poster', w: 1414, h: 2000 },
  { key: 'letter', label: 'US Letter', w: 1275, h: 1650 },
  { key: 'half-a4', label: 'Half A4 / DL', w: 1240, h: 877 },
  { key: 'square', label: 'Square Poster', w: 1200, h: 1200 },
  { key: 'website-banner', label: 'Website Hero', w: 1920, h: 600 },
  { key: 'billboard', label: 'Billboard', w: 4500, h: 1500 },
  { key: 'led', label: 'LED Screen', w: 1600, h: 600 },
  { key: 'rollup', label: 'Roll-up', w: 1200, h: 2400 },
  { key: 'backdrop', label: 'Backdrop', w: 2400, h: 1200 },
  { key: 'street', label: 'Street Banner', w: 1200, h: 400 },
  { key: 'facebook-cover', label: 'Facebook Cover', w: 1640, h: 859 },
  { key: 'linkedin-cover', label: 'LinkedIn Cover', w: 1584, h: 396 },
  { key: 'youtube-banner', label: 'YouTube Banner', w: 2560, h: 1440 },
  { key: 'email-header', label: 'Email Header', w: 600, h: 200 },
];
