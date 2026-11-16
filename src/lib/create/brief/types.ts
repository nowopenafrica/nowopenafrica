// The creative brief: what Create must know before a concept is worth making.
//
// CI-0 traced five real requests and found that none carried an industry, an
// audience, an objective or a placement past the first screen. Each landed on
// a shelf of one to three generic designs, and two different requests got the
// same three. The brief is the object that carries those answers forward.
//
// Every field records where its value came from, because a guess presented as
// the customer's own word is how a brief goes wrong quietly.

/** `typed`: the customer's words. `inferred`: read from their words. `default`: from the industry profile. */
export type Source = 'typed' | 'inferred' | 'default';

export interface Field<T> {
  value: T;
  source: Source;
  /** The words that produced an inferred value, so the screen can show its working. */
  from?: string;
}

export type Objective =
  | 'launch' | 'opening' | 'sale' | 'event' | 'identity' | 'awareness' | 'inform' | 'recruit';

/** How much is being asked for. A series and a system are designed as sets, not as one piece repeated. */
export type Scope = 'single' | 'series' | 'system';

export type Tier = 'value' | 'mid' | 'premium' | 'luxury';

export interface BriefQuestion {
  /** The brief field the answer fills. */
  field: 'deliverable' | 'industry' | 'business' | 'message' | 'details';
  ask: string;
  /** Why it is being asked: what changes in the result. */
  why: string;
  /** Tappable answers, when the choices are known. */
  options?: { value: string; label: string }[];
}

export interface CreativeBrief {
  /** The request exactly as typed. */
  request: string;
  /** REQUEST_FAMILIES key. */
  family: Field<string> | null;
  /** SUBCATEGORIES key, when one piece or one kind of piece is wanted. */
  deliverable: Field<string> | null;
  /** FORMATS key. */
  format: Field<string> | null;
  scope: Field<Scope>;
  /** INDUSTRIES key. */
  industry: Field<string> | null;
  objective: Field<Objective> | null;
  tier: Field<Tier> | null;
  /** City or country named in the request. Never assumed. */
  place: Field<string> | null;
  audience: Field<string> | null;
  tone: Field<string> | null;
  /** Movement keys to consider, strongest first. Never fewer than three groups when an industry is known. */
  movements: Field<string[]>;
  /** Copy the customer put in quotes. Used verbatim. */
  headline: Field<string> | null;
  /** What a real piece for this trade cannot leave out. The customer supplies these; nothing is invented. */
  mustCarry: string[];
  /** Subjects the pictures should show. */
  imagery: string[];
  /** Claims and subjects to check before publishing. */
  cautions: string[];
  /** What Create cannot make today for this request, said plainly. */
  limits: string[];
  /** At most three, and only those whose answer changes the concepts. */
  questions: BriefQuestion[];
}

/** What the caller already knows about the signed-in business. All optional. */
export interface BriefContext {
  businessName?: string;
  /** A NowOpen category name ("Restaurant", "Real Estate"), from the listing. */
  category?: string;
  city?: string;
}
