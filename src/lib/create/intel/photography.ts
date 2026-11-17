// Photography and imagery direction: what a picture is for in each mode,
// and what makes it unusable.
//
// CI-0 found that 28 of 35 scored designs had no photograph and 6 of the 7
// that did showed the wrong subject. The first rule is therefore relevance:
// a picture of the wrong thing is worse than no picture.

import type { ImageryMode, PhotographyDirection } from './types';

/** Rules that hold for every picture, in every mode. */
export const IMAGERY_RULES: string[] = [
  'Subject first: the picture shows what the business sells, makes or is. If no such picture exists, choose an archetype that needs none.',
  'Never invent: no picture may show a product, place, person or result the business cannot deliver.',
  'One light direction and one grade across a set.',
  'People are shown with consent and with dignity; skin tones are exposed and graded truthfully.',
  'Every asset has a recorded licence (C1). AI-made images are labelled as AI and never depict real people or brands.',
  'Source pixels must cover the placed size at export scale: no upscaling (quality check, image quality).',
  'The focal point is set so a crop for another format keeps the subject.',
];

export const PHOTOGRAPHY: PhotographyDirection[] = [
  { mode: 'none', name: 'No picture', brief: 'Type, colour and shape carry the piece.',
    rules: ['Choose it on purpose, with an archetype built for it', 'The headline must be specific enough to stand alone'],
    never: ['An empty frame or placeholder shape where a picture was meant to be'] },
  { mode: 'full-bleed', name: 'Full-bleed photograph', brief: 'One photograph to the edges; words in its quiet area.',
    rules: ['Needs a calm area of at least 30% for type', 'Text contrast is checked against the actual pixels behind it', 'Subject kept clear of the safe-area edge'],
    never: ['Text across faces or busy detail', 'A colour wash so heavy the subject is lost'] },
  { mode: 'framed', name: 'Framed photograph', brief: 'The picture sits in a window on the grid.',
    rules: ['The frame aligns to the grid on at least two edges', 'Crop to the subject, not to the centre of the file'],
    never: ['A frame larger than the picture deserves', 'Abutting opaque shapes that leave seams'] },
  { mode: 'cut-out', name: 'Cut-out object or person', brief: 'The subject removed from its background and placed on colour.',
    rules: ['Clean edge with no halo', 'A grounding shadow in the scene\'s light direction', 'Scale chosen for drama'],
    never: ['Cutting out hair or glass badly', 'Floating objects with no shadow'] },
  { mode: 'duotone', name: 'Duotone', brief: 'A photograph mapped to two palette colours.',
    rules: ['Use for texture and mood, on places and objects', 'Keep enough tonal range to read the subject'],
    never: ['On faces where skin tone carries identity', 'To disguise an irrelevant stock photo'] },
  { mode: 'collage', name: 'Collage', brief: 'Several cut pictures combined into one idea.',
    rules: ['One anchor figure', 'A shared paper palette', 'Licences that allow modification and combination'],
    never: ['Combining people so as to imply endorsement', 'More than five pictures'] },
  { mode: 'render', name: '3D render', brief: 'A lit object or scene made in software.',
    rules: ['Believable material and one key light', 'Type in the same light', 'Labelled when it is not a photograph of the real product'],
    never: ['Showing a product the customer will not receive', 'Property renders presented as photographs'] },
  { mode: 'illustration', name: 'Illustration', brief: 'Drawn imagery: line, flat shape or engraving.',
    rules: ['One hand across a set', 'Line weight matched to the type weight'],
    never: ['Mixed illustration styles', 'Clip-art standing in for an idea'] },
  { mode: 'pattern', name: 'Pattern', brief: 'A repeat that carries the surface.',
    rules: ['Named source and permission where a pattern has cultural ownership', 'A calm panel for the words', 'Scale chosen so the repeat reads at the format\'s viewing distance'],
    never: ['Pattern directly behind small text', 'Sacred or restricted motifs as decoration'] },
];

export const photographyOf = (mode: ImageryMode): PhotographyDirection =>
  PHOTOGRAPHY.find((p) => p.mode === mode) as PhotographyDirection;
