import { describe, it, expect } from 'vitest';
import {
  SUBMISSION_TYPES, stepsFor, stepError, consentError, requiredConsents,
  applyPrivacy, toPayload, readCampaign, isSafeCampaignValue,
  resultHeadline, resultDetail, completeness, nextBestAction, submissionTypeSpec,
  EMPTY_CONSENTS,
  type SubmissionDraft, type Consents,
} from './addBusiness';

function draft(over: Partial<SubmissionDraft> = {}): SubmissionDraft {
  return { submission_type: 'owner', name: 'Duchess Clinic', category: 'Health', ...over };
}

const allConsents: Consents = {
  accuracy_confirmed: true, review_understood: true, ownership_not_implied: true,
  terms_accepted: true, media_rights_confirmed: true,
};

describe('submission types', () => {
  it('offers exactly the three the database accepts', () => {
    expect(SUBMISSION_TYPES.map((t) => t.key)).toEqual(['owner', 'representative', 'recommendation']);
  });

  it('tells a recommender up front that no profile is created in their name', () => {
    // The most important sentence on the page: somebody adding their favourite
    // restaurant must not believe they now own its listing.
    const spec = submissionTypeSpec('recommendation');
    expect(spec.outcome).toMatch(/does not create a profile in your name/i);
    expect(spec.outcome).toMatch(/unclaimed/i);
  });

  it('does not promise a verified badge to an owner who has not verified', () => {
    expect(submissionTypeSpec('owner').outcome).toMatch(/after verification/i);
  });
});

describe('stepsFor', () => {
  it('asks an owner the full form', () => {
    expect(stepsFor('owner').map((s) => s.key)).toEqual(
      ['type', 'identity', 'about', 'contact', 'hours', 'media', 'review']);
  });

  it('asks a recommender only what they could possibly know', () => {
    // Somebody recommending a shop has no logo, no founding year and no hours.
    const keys = stepsFor('recommendation').map((s) => s.key);
    expect(keys).toEqual(['type', 'identity', 'contact', 'review']);
    expect(keys).not.toContain('media');
    expect(keys).not.toContain('hours');
  });
});

describe('stepError', () => {
  it('requires a usable name', () => {
    expect(stepError('identity', draft({ name: '' }))).toMatch(/what is the business called/i);
    expect(stepError('identity', draft({ name: 'X' }))).toBeTruthy();
    expect(stepError('identity', draft({ name: 'A'.repeat(200) }))).toMatch(/too long/i);
  });

  it('requires a category from an owner but not from a recommender', () => {
    expect(stepError('identity', draft({ category: '' }))).toMatch(/category/i);
    expect(stepError('identity', draft({ submission_type: 'recommendation', category: '' }))).toBeNull();
  });

  it('asks a representative how they are connected', () => {
    expect(stepError('identity', draft({ submission_type: 'representative' })))
      .toMatch(/how are you connected/i);
    expect(stepError('identity', draft({ submission_type: 'representative', relationship: 'Employee' })))
      .toBeNull();
  });

  it('requires at least one way to reach the business', () => {
    expect(stepError('contact', draft())).toMatch(/at least one way to reach/i);
    expect(stepError('contact', draft({ phone: '+234 801' }))).toBeNull();
    expect(stepError('contact', draft({ address: '1 Broad St' }))).toBeNull();
  });

  it('rejects an email or website that cannot be one', () => {
    expect(stepError('contact', draft({ phone: '1', email: 'not-an-email' }))).toMatch(/email/i);
    expect(stepError('contact', draft({ phone: '1', website: 'no dots here' }))).toMatch(/website/i);
    expect(stepError('contact', draft({ phone: '1', website: 'example.com' }))).toBeNull();
  });
});

describe('consents', () => {
  it('always requires accuracy and terms', () => {
    expect(requiredConsents('owner', draft())).toContain('accuracy_confirmed');
    expect(requiredConsents('owner', draft())).toContain('terms_accepted');
  });

  it('requires a recommender to disclaim ownership', () => {
    expect(requiredConsents('recommendation', draft())).toContain('ownership_not_implied');
    expect(requiredConsents('owner', draft())).not.toContain('ownership_not_implied');
  });

  it('requires media rights only when media was attached', () => {
    expect(requiredConsents('owner', draft())).not.toContain('media_rights_confirmed');
    expect(requiredConsents('owner', draft({ image_url: 'https://x/y.jpg' })))
      .toContain('media_rights_confirmed');
  });

  it('blocks submission until every required consent is given', () => {
    expect(consentError('owner', draft(), EMPTY_CONSENTS)).toBeTruthy();
    expect(consentError('owner', draft(), allConsents)).toBeNull();
    expect(consentError('recommendation', draft(),
      { ...allConsents, ownership_not_implied: false })).toMatch(/not claiming to own/i);
  });
});

describe('applyPrivacy', () => {
  it('removes every contact detail that was not positively chosen', () => {
    // For a sole trader the business phone IS the personal phone. Publishing one
    // because a checkbox was left alone is the failure this prevents.
    const d = draft({
      phone: '+234 801', whatsapp: '+234 802', email: 'me@example.com', address: '1 Broad St',
    });
    const out = applyPrivacy(d);
    expect(out.phone).toBeUndefined();
    expect(out.whatsapp).toBeUndefined();
    expect(out.email).toBeUndefined();
    expect(out.address).toBeUndefined();
  });

  it('keeps exactly what was ticked, and nothing else', () => {
    const out = applyPrivacy(draft({
      phone: '+234 801', email: 'me@example.com', show_phone: true,
    }));
    expect(out.phone).toBe('+234 801');
    expect(out.email).toBeUndefined();
  });
});

describe('toPayload', () => {
  it('never sends the privacy flags themselves', () => {
    const p = toPayload(draft({ phone: '+234 801', show_phone: true }));
    expect(p).not.toHaveProperty('show_phone');
    expect(p).not.toHaveProperty('show_email');
  });

  it('omits a contact the submitter kept private, rather than sending it hidden', () => {
    // A value never sent cannot be published by a later bug.
    const p = toPayload(draft({ phone: '+234 801', show_phone: false }));
    expect(p.phone).toBeUndefined();
  });

  it('builds one location string from the parts', () => {
    const p = toPayload(draft({ city: 'Lagos', region: 'Lagos State', country: 'Nigeria' }));
    expect(p.location).toBe('Lagos, Lagos State, Nigeria');
  });

  it('sends no empty strings, so blank fields do not overwrite anything', () => {
    const p = toPayload(draft({ tagline: '', about: '' }));
    expect(p.tagline).toBeUndefined();
    expect(p.about).toBeUndefined();
  });
});

describe('campaign attribution', () => {
  it('reads and slugifies a campaign', () => {
    expect(readCampaign('?campaign=Lagos-Fashion')).toBe('lagos-fashion');
    expect(readCampaign('?campaign=')).toBeNull();
    expect(readCampaign('')).toBeNull();
  });

  it('refuses a campaign value that carries personal data', () => {
    // ?campaign= is written by whoever makes the link. A colleague pasting a
    // customer's email into it must not put that address in the database.
    expect(isSafeCampaignValue('lagos-fashion')).toBe(true);
    expect(isSafeCampaignValue('someone@example.com')).toBe(false);
    expect(isSafeCampaignValue('08012345678')).toBe(false);
    expect(isSafeCampaignValue('3fa85f64-5717-4562-b3fc')).toBe(false);
  });
});

describe('result copy', () => {
  it('never tells a recommender a profile was created for them', () => {
    const r = { candidate_id: 'c1', business_id: null };
    expect(resultHeadline(r)).toMatch(/recommendation/i);
    expect(resultDetail(r)).toMatch(/nothing has been created in your name/i);
  });

  it('says "submitted", not "live", when the profile is awaiting review', () => {
    const r = { business_id: 'b1', profile_state: 'ready_for_review' };
    expect(resultHeadline(r)).toMatch(/submitted/i);
    expect(resultHeadline(r)).not.toMatch(/live|verified/i);
    expect(resultDetail(r)).toMatch(/waiting for review/i);
  });

  it('never claims the business is verified, even when published', () => {
    const r = { business_id: 'b1', profile_state: 'published' };
    expect(resultDetail(r)).toMatch(/awaiting ownership verification/i);
  });

  it('tells a repeat submitter it is the same business, not a new one', () => {
    expect(resultHeadline({ duplicate_of_submission: true, business_id: 'b1' }))
      .toMatch(/already submitted/i);
  });
});

describe('completeness', () => {
  it('uses the same weights as the database listing_score', () => {
    // 25 contact + 20 hours + 15 address + 15 about + 15 image + 5 website + 5 owner
    const full = draft({
      phone: '+234 801', opening_hours: 'Mon-Fri 9-5', address: '1 Broad St',
      about: 'We do things', image_url: 'https://x/y.jpg', website: 'example.com',
    });
    expect(completeness(full)).toBe(100);
  });

  it('gives a bare submission the 5 points a signed-in owner is worth', () => {
    expect(completeness(draft())).toBe(5);
  });

  it('counts hours as present when the business is open 24 hours', () => {
    expect(completeness(draft({ is_24_hours: true }))).toBe(25);
  });
});

describe('nextBestAction', () => {
  it('asks for the highest-scoring missing thing first', () => {
    expect(nextBestAction(draft())).toMatch(/phone number/i);
    expect(nextBestAction(draft({ phone: '+234 801' }))).toMatch(/opening hours/i);
    expect(nextBestAction(draft({ phone: '1', opening_hours: 'Mon-Fri' }))).toMatch(/logo|photo/i);
  });

  it('has nothing to suggest once the profile is complete', () => {
    expect(nextBestAction(draft({
      phone: '1', opening_hours: 'Mon-Fri', logo_url: 'https://x/l.png', about: 'We do things',
    }))).toBeNull();
  });
});
