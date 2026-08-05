// Phone helpers for call/WhatsApp CTAs.
// Owners enter numbers in all sorts of formats ("0708 154 7726",
// "+234 800 100 1000") — normalise as best we can.

/** Digits suitable for a tel: href */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d+]/g, '');
  return `tel:${digits}`;
}

// Country keywords → dialling code, for internationalising local numbers
// (e.g. "0708..." + a Lagos address → 234708...). Keyword list covers the
// platform's launch markets; unknown locations just skip WhatsApp.
const COUNTRY_CODES: [RegExp, string][] = [
  [/nigeria|lagos|abuja|ibadan|kano|port harcourt|enugu|ikeja|lekki|ikotun|yaba|ikorodu|surulere/i, '234'],
  [/kenya|nairobi|mombasa|kisumu|westlands/i, '254'],
  [/ghana|accra|kumasi|tema|takoradi/i, '233'],
  [/south africa|johannesburg|cape town|durban|pretoria|sandton/i, '27'],
  [/egypt|cairo|giza|alexandria/i, '20'],
  [/tanzania|dar es salaam|dodoma|arusha/i, '255'],
  [/uganda|kampala|entebbe/i, '256'],
  [/rwanda|kigali/i, '250'],
  [/ethiopia|addis/i, '251'],
  [/senegal|dakar/i, '221'],
  [/ivoire|abidjan/i, '225'],
  [/morocco|casablanca|rabat|marrakech/i, '212'],
];

/**
 * International digits for a wa.me link, or null when the number can't be
 * internationalised confidently (WhatsApp requires country-code format).
 */
export function whatsappNumber(phone: string, location?: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);

  // Local format (leading 0): infer the country from the business location
  if (digits.startsWith('0')) {
    if (!location) return null;
    const match = COUNTRY_CODES.find(([re]) => re.test(location));
    return match ? match[1] + digits.slice(1) : null;
  }

  // No leading 0 or + — assume it's already international (e.g. "234800...")
  return digits;
}

export function whatsappHref(phone: string, location: string | undefined, greeting: string): string | null {
  const number = whatsappNumber(phone, location);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(greeting)}`;
}
