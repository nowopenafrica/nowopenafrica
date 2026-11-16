// Composition archetypes. Names and intent only; the generators are CI-3.
//
// An archetype is a way of organising a surface, independent of colour and
// typeface. Three concepts for one brief must use three different archetypes.

import type { Archetype, ArchetypeKey } from './types';

export const ARCHETYPES: Archetype[] = [
  { key: 'image-bleed', name: 'Image to the edges', idea: 'One photograph fills the surface and the words sit in its quiet area.', hierarchy: 'image-led', needsImage: true },
  { key: 'typographic-poster', name: 'Typographic poster', idea: 'The words are the picture: one statement set large on a field of colour.', hierarchy: 'headline-led', needsImage: false },
  { key: 'editorial-split', name: 'Editorial split', idea: 'An uneven two-part page, picture on one side and reading on the other.', hierarchy: 'image-led', needsImage: true },
  { key: 'modular-grid', name: 'Modular grid', idea: 'A visible column grid holds every element; alignment is the ornament.', hierarchy: 'information-led', needsImage: false },
  { key: 'passe-partout', name: 'Mounted frame', idea: 'A picture mounted inside a wide margin, like a print in a mount.', hierarchy: 'image-led', needsImage: true },
  { key: 'monumental-type', name: 'Monumental type', idea: 'Letters so large they crop at the edges and become architecture.', hierarchy: 'headline-led', needsImage: false },
  { key: 'product-hero', name: 'Product hero', idea: 'One object, cut out or staged, on a plain field with a short line.', hierarchy: 'image-led', needsImage: true },
  { key: 'collage-layered', name: 'Layered collage', idea: 'Cut pictures, paper and type overlapped with deliberate tension.', hierarchy: 'image-led', needsImage: true },
  { key: 'information-ledger', name: 'Information ledger', idea: 'Rows and columns of facts with rules between them: a timetable or price list made handsome.', hierarchy: 'information-led', needsImage: false },
  { key: 'centred-emblem', name: 'Centred emblem', idea: 'A symmetrical stack around a mark or name, with generous quiet space.', hierarchy: 'headline-led', needsImage: false },
  { key: 'band-and-field', name: 'Band and field', idea: 'A strong band carries identity; the field below carries the message.', hierarchy: 'information-led', needsImage: false },
  { key: 'diagonal-energy', name: 'Diagonal energy', idea: 'Type and shapes set on an angle so the surface moves.', hierarchy: 'headline-led', needsImage: false },
  { key: 'framed-portrait', name: 'Framed portrait', idea: 'A person in a shaped window, with name and role beside it.', hierarchy: 'image-led', needsImage: true },
  { key: 'pattern-field', name: 'Pattern field', idea: 'A repeat pattern carries the surface and a calm panel carries the words.', hierarchy: 'headline-led', needsImage: false },
  { key: 'render-stage', name: 'Rendered stage', idea: 'A lit three-dimensional object or scene with type in the same light.', hierarchy: 'image-led', needsImage: true },
  { key: 'serial-tiles', name: 'Serial tiles', idea: 'One system repeated across several tiles, each a variation.', hierarchy: 'information-led', needsImage: false },
];

export const archetypeOf = (key: ArchetypeKey): Archetype =>
  ARCHETYPES.find((a) => a.key === key) as Archetype;
