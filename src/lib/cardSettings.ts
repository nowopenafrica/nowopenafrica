// Editable display settings for the Digital Business Card and Smart ID card.
//
// These override what the cards show and how they look (tagline, category
// label, accent colour, which contact rows appear and the Smart ID holder
// details) without touching the business row — exports use exactly the same
// settings the owner sees in Brand Card Studio. Persisted per business in
// localStorage.

export interface CardSettings {
  /** Optional short line shown under the business name on both cards. */
  tagline: string;
  /** Override for the category line; empty = use business.category. */
  categoryLabel: string;
  /** Hex accent used for the cover/gradient; empty = the default palette. */
  accentColor: string;
  showPhone: boolean;
  /** WhatsApp row (shares the phone number) — business card only. */
  showWhatsApp: boolean;
  showLocation: boolean;
  showWebsite: boolean;
  /** Opening-hours row — business card only. */
  showHours: boolean;
  /** Smart ID card holder — empty = falls back to the business name. */
  holderName: string;
  /** Smart ID card holder role — empty = falls back to the category. */
  holderRole: string;
  /** Smart ID card holder photograph as a (compressed) data URL. */
  holderPhoto: string;
  /** Smart ID number shown on the front; empty = auto-generated. */
  holderId: string;
}

export const DEFAULT_CARD_SETTINGS: CardSettings = {
  tagline: '',
  categoryLabel: '',
  accentColor: '',
  showPhone: true,
  showWhatsApp: true,
  showLocation: true,
  showWebsite: true,
  showHours: true,
  holderName: '',
  holderRole: '',
  holderPhoto: '',
  holderId: '',
};

export const CARD_ACCENTS: { name: string; value: string }[] = [
  { name: 'Royal Purple', value: '#7c3aed' },
  { name: 'Deep Indigo', value: '#4f46e5' },
  { name: 'Ocean Blue', value: '#2563eb' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Crimson', value: '#dc2626' },
  { name: 'Hot Pink', value: '#ec4899' },
];

const keyFor = (businessId: string) => `nowopen-card-settings-${businessId}`;

export function loadCardSettings(businessId: string): CardSettings {
  try {
    const raw = localStorage.getItem(keyFor(businessId));
    if (!raw) return { ...DEFAULT_CARD_SETTINGS };
    return { ...DEFAULT_CARD_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CARD_SETTINGS };
  }
}

export function saveCardSettings(businessId: string, settings: CardSettings) {
  try {
    localStorage.setItem(keyFor(businessId), JSON.stringify(settings));
  } catch {
    /* storage unavailable — the edit just won't persist */
  }
}

export function resetCardSettings(businessId: string) {
  try {
    localStorage.removeItem(keyFor(businessId));
  } catch {
    /* ignore */
  }
}

// Downscale + re-encode an uploaded photograph (data URL) so it stays small
// enough for localStorage while looking sharp on the card.
export function compressImageFile(file: File, maxDim = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('canvas unavailable')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          reject(new Error('could not compress image'));
        }
      };
      img.onerror = () => reject(new Error('unreadable image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('could not read file'));
    reader.readAsDataURL(file);
  });
}
