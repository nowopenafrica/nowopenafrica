/*
 * The pilot photographs (nowopen-creative-intel-assets/pilot-assets), by name
 * only. The files themselves never enter the repo: until the founder's photo
 * intake (D1) clears them, they are served from a local folder in development
 * and a gallery shows the designs that use them as previews, never as
 * something a customer can save. Regenerate from pilot-intake.csv; textures
 * (no subject) are left out, as they are not for photo-led layouts.
 */
export interface PilotPhoto {
  file: string;
  title: string;
  /** food, beauty, work, craft, retail, celebration, people */
  subjects: string[];
  /** Industry groups (INDUSTRIES[].group) the photo suits. */
  groups: string[];
  people: boolean;
  credit: string;
}

export const PILOT_PHOTOS: PilotPhoto[] = [
  { file: "pexels-1181271.jpeg", title: "Laptop showing code", subjects: ["work"], groups: ["Technology & Media"], people: false, credit: "Photo by Christina Morillo on Pexels" },
  { file: "pexels-3182765.jpeg", title: "Colleagues talking in a modern office", subjects: ["work"], groups: ["Professional Services", "Technology & Media"], people: true, credit: "Photo by fauxels on Pexels" },
  { file: "pexels-3807386.jpeg", title: "Mechanic checking a tyre", subjects: ["work"], groups: ["Trades & Industry"], people: true, credit: "Photo by Andrea Piacquadio on Pexels" },
  { file: "pexels-4239146.jpeg", title: "Gloved hand cleaning a mirror", subjects: ["work"], groups: ["Home & Personal Services"], people: false, credit: "Photo by Karola G (Kaboompics) on Pexels" },
  { file: "pexels-4386370.jpeg", title: "Cash in a black envelope", subjects: ["work"], groups: ["Professional Services"], people: false, credit: "Photo by Karola G (Kaboompics) on Pexels" },
  { file: "pexels-4792733.jpeg", title: "Two monitors with code on a wooden desk", subjects: ["work"], groups: ["Technology & Media"], people: false, credit: "Photo by Anete Lusina on Pexels" },
  { file: "pexels-5668473.jpeg", title: "Wooden gavel close-up", subjects: ["work"], groups: ["Professional Services"], people: false, credit: "Photo by Sora Shimazaki on Pexels" },
  { file: "pexels-5921788.jpeg", title: "Woman writing at a desk", subjects: ["work"], groups: ["Professional Services"], people: true, credit: "Photo by RDNE Stock project on Pexels" },
  { file: "pexels-18789516.jpeg", title: "Woman in kente dress, studio portrait", subjects: ["beauty"], groups: ["Fashion & Beauty"], people: true, credit: "Photo by Prince Enos on Pexels" },
  { file: "pexels-28635266.jpeg", title: "Woman with braids, portrait", subjects: ["beauty"], groups: ["Fashion & Beauty"], people: true, credit: "Photo by Creative KG on Pexels" },
  { file: "pexels-28959523.jpeg", title: "Model in printed outfit outdoors", subjects: ["beauty"], groups: ["Fashion & Beauty"], people: true, credit: "Photo by Darkshade Photos on Pexels" },
  { file: "pexels-33968170.jpeg", title: "Woman in traditional dress and jewellery", subjects: ["beauty"], groups: ["Fashion & Beauty", "Arts & Entertainment"], people: true, credit: "Photo by real gayu on Pexels" },
  { file: "pexels-38127716.jpeg", title: "Chef's hands plating dishes", subjects: ["food"], groups: ["Food & Hospitality"], people: false, credit: "Photo by Noah Barblan on Pexels" },
  { file: "pexels-17952748.jpeg", title: "Jollof-style rice with fried plantain", subjects: ["food"], groups: ["Food & Hospitality"], people: false, credit: "Photo by Studio Saiz on Pexels" },
  { file: "pexels-16148034.jpeg", title: "Burger and wedges on dark slate", subjects: ["food"], groups: ["Food & Hospitality"], people: false, credit: "Photo by Radwan Menzer on Pexels" },
  { file: "pexels-33203798.jpeg", title: "Artisan at a stall with handmade goods", subjects: ["craft", "retail"], groups: ["Retail & Commerce", "Arts & Entertainment"], people: true, credit: "Photo by iv image.ng on Pexels" },
  { file: "pexels-13212603.jpeg", title: "Stylist braiding hair in a salon", subjects: ["beauty"], groups: ["Fashion & Beauty"], people: true, credit: "Photo by Rene Terp on Pexels" },
  { file: "pexels-30678211.jpeg", title: "Man working on a laptop, Lagos", subjects: ["work"], groups: ["Professional Services", "Technology & Media"], people: true, credit: "Photo by Ninthgrid on Pexels" },
  { file: "pexels-30688596.jpeg", title: "Team meeting around a table, Lagos", subjects: ["work"], groups: ["Professional Services"], people: true, credit: "Photo by Ninthgrid on Pexels" },
  { file: "pexels-5792871.jpeg", title: "Man at a laptop at home", subjects: ["work"], groups: ["Professional Services", "Technology & Media"], people: true, credit: "Photo by Laker on Pexels" },
  { file: "pexels-32005355.jpeg", title: "Wedding couple dancing", subjects: ["celebration"], groups: ["Arts & Entertainment"], people: true, credit: "Photo by Khaliifah Hussein on Pexels" },
  { file: "pexels-37118690.jpeg", title: "Traditional dance celebration outdoors", subjects: ["celebration"], groups: ["Arts & Entertainment"], people: true, credit: "Photo by Momento visuals on Pexels" },
  { file: "pexels-2402239.jpeg", title: "People in traditional attire dancing", subjects: ["celebration"], groups: ["Arts & Entertainment"], people: true, credit: "Photo by Roger Sekoua on Pexels" },
  { file: "pexels-16152597.jpeg", title: "Smiling woman, studio portrait", subjects: ["beauty"], groups: ["Fashion & Beauty"], people: true, credit: "Photo by Korede Adenola on Pexels" },
  { file: "pexels-1199957.jpeg", title: "Burger and wedges on a black plate", subjects: ["food"], groups: ["Food & Hospitality"], people: false, credit: "Photo by Valeria Boltneva on Pexels" },
  { file: "pexels-33569488.jpeg", title: "Close-up portrait of a man in a flat cap", subjects: ["people"], groups: ["Local & Everyday Business"], people: true, credit: "Photo by Charles Lichinga on Pexels" },
];

/** Where the photos are served in development (VITE_CREATE_PHOTOS), or '' when there are none. */
export const PHOTO_BASE: string = (import.meta.env.VITE_CREATE_PHOTOS as string | undefined) ?? '';
