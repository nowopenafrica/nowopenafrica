import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, Loader2, X, Clock } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { claimState, evidenceIsUsable, type BusinessClaim } from '../../lib/claims';
import { claimMessage, waChatLink } from '../../lib/waLink';
import { socialEntries } from '../../lib/businessProfile';
import AuthModal from '../auth/AuthModal';
import type { Business } from '../../types';

/**
 * "Is this your business?"
 *
 * Shown only on pages nobody owns — which is 30 of the 32 businesses currently
 * listed. Those pages already exist and already rank, so the owner arrives
 * through their own search result rather than through any advertising. This is
 * the button that turns that visit into a business account.
 *
 * Claiming does NOT grant anything. It files a request an admin reviews, and
 * only that approval moves ownership. An auto-approving claim would be an
 * account takeover with a friendly label, and the obvious target would be the
 * best-ranked business on the platform.
 */
/*
 * The number owners can write to. Unset means no WhatsApp option is offered:
 * a dead "Message us" reads as a broken channel, which is worse than an
 * absent one.
 */
const PLATFORM_WHATSAPP: string = import.meta.env.VITE_NOWOPEN_WHATSAPP_NUMBER ?? '';

export default function ClaimBusiness({ business }: { business: Business }) {
  const { user } = useAuth();
  const [claim, setClaim] = useState<BusinessClaim | null>(null);
  const [open, setOpen] = useState(false);
  /*
   * Signing in used to mean LEAVING this page for /login?next=. An owner who
   * has just recognised their own business is the most motivated visitor this
   * platform gets, and the old flow sent them to a generic form and asked
   * them to find their way back. The options now open over the listing.
   */
  const [signingIn, setSigningIn] = useState(false);
  /* Set when sign-in was started FROM here, so the claim form opens by itself
   * once an account exists — otherwise they arrive back and must click the
   * same button a second time. */
  const [claimAfterAuth, setClaimAfterAuth] = useState(false);

  /*
   * The Instagram handle already on this listing, if any.
   *
   * There is no "sign in with Instagram" to build: Supabase supports 19
   * social providers and Instagram is not one of them (the authorize endpoint
   * answers "Provider instagram could not be found"). What an Instagram owner
   * CAN do is point at the account this listing was built from, which is a
   * fact a reviewer can check in seconds — 217 of the 223 uncategorised
   * listings came from Instagram, so for most owners it is the strongest
   * evidence they have.
   */
  const instagramHandle = (() => {
    /*
     * `social_links` is a real column that the shared Business type does not
     * carry — BusinessStory reads it through its own ProfileStory type. Read
     * narrowly here rather than widening a type the whole app depends on.
     */
    const links = (business as unknown as { social_links?: unknown }).social_links;
    const entry = socialEntries(links).find((x) => /instagram\.com/i.test(x.url));
    const m = entry ? /instagram\.com\/([A-Za-z0-9._]+)/.exec(entry.url) : null;
    return m ? m[1] : null;
  })();
  const [evidence, setEvidence] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);

  const businessId = String(business.id);

  const load = useCallback(async () => {
    if (!user) { setClaim(null); return; }
    const { data } = await supabase
      .from('business_claims')
      .select('*')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setClaim((data as BusinessClaim) ?? null);
  }, [user, businessId]);

  useEffect(() => { void load(); }, [load]);

  /*
   * They asked to claim, then signed in. Carry them into the form rather than
   * returning them to the button they already pressed.
   */
  useEffect(() => {
    if (user && claimAfterAuth) {
      setClaimAfterAuth(false);
      setSigningIn(false);
      setOpen(true);
    }
  }, [user, claimAfterAuth]);

  const state = claimState(business, claim);
  // Nothing to offer on a business that already has an owner.
  if (state === 'owned') return null;

  const submit = async () => {
    if (!user) return;
    if (!evidenceIsUsable(evidence, contact)) {
      toast.error('Add a phone number or an email we can check.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('business_claims').insert({
      business_id: businessId,
      user_id: user.id,
      evidence: evidence.trim() || null,
      contact: contact.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(/duplicate key|unique/i.test(error.message)
        ? 'You already have a claim waiting on this business.'
        : /does not exist|schema cache/i.test(error.message)
          ? 'Claiming needs the business_claims migration applied first.'
          : error.message);
      return;
    }
    toast.success('Claim sent — we will review it shortly');
    setOpen(false);
    void load();
  };

  if (state === 'pending') {
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-2.5">
        <Clock size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Your claim on this business is waiting for review. We will email you when it is decided.
        </p>
      </div>
    );
  }

  const field = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

  return (
    <>
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <BadgeCheck size={17} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Is this your business?</p>
            <p className="text-[11px] text-gray-600 dark:text-gray-300">
              {state === 'rejected'
                ? 'Your last claim was not approved. You can try again with more detail.'
                : 'Claim it to manage your page, reply to customers and post offers.'}
            </p>
          </div>
        </div>
        {user ? (
          <button
            onClick={() => setOpen(true)}
            className="px-4 min-h-[40px] rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shrink-0"
          >
            Claim this business
          </button>
        ) : (
          /*
           * A claim still has to belong to an account — that has not changed,
           * and it is what makes approval meaningful. What changed is where
           * the account is created: here, over the listing they are looking
           * at, with whichever methods the project actually has enabled.
           *
           * MEASURED 2026-10-12 against this project's auth settings:
           * google, github, email and phone are enabled; facebook, apple,
           * linkedin and twitter are not. AuthModal reads that itself rather
           * than being told, so this does not go stale.
           */
          <button
            onClick={() => { setClaimAfterAuth(true); setSigningIn(true); }}
            className="px-4 min-h-[40px] inline-flex items-center rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shrink-0"
          >
            Claim this business
          </button>
        )}
      </div>

      {signingIn && !user && (
        <AuthModal onClose={() => { setSigningIn(false); setClaimAfterAuth(false); }} />
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Claim this business">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Claim {business.name}</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  A person reviews every claim before a page changes hands.
                </p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X size={19} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="claim-contact" className="block text-sm font-semibold text-gray-900 dark:text-white">
                  Phone or email we can reach you on
                </label>
                <input id="claim-contact" value={contact} onChange={(e) => setContact(e.target.value)}
                  placeholder="08012345678" className={`${field} mt-1`} />
              </div>
              <div>
                <label htmlFor="claim-evidence" className="block text-sm font-semibold text-gray-900 dark:text-white">
                  How can we tell it is yours?
                </label>
                <textarea id="claim-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3}
                  placeholder="I am the owner. Our number on the page is mine, and our CAC number is RC1234567."
                  className={`${field} mt-1`} />
                <p className="text-[10px] text-gray-400 mt-1">
                  A work email, the phone number already on the page, a CAC number, or your social account.
                </p>
              </div>
            </div>

            {/*
              * A second way in, for owners who will not fill a form.
              *
              * Outbound WhatsApp templates are gated behind billing — every
              * one this platform sent failed with Meta code 131042. A message
              * the OWNER sends costs nothing and needs no approval, and it
              * carries a reference so whoever reads the inbox knows which
              * listing is meant without asking.
              *
              * It does not replace the claim: the message opens a
              * conversation, and an admin still approves ownership.
              */}
            {waChatLink({
              phone: PLATFORM_WHATSAPP,
              text: claimMessage({ businessName: business.name, businessId: business.id }),
            }) && (
              <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Would rather talk? Message us on WhatsApp and we will take it from there.
                </p>
                <a
                  href={waChatLink({
                    phone: PLATFORM_WHATSAPP,
                    text: claimMessage({ businessName: business.name, businessId: business.id }),
                  }) as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-[#25d366] px-4 min-h-[44px] text-sm font-bold text-white"
                >
                  Message us on WhatsApp
                </a>
              </div>
            )}

            {instagramHandle && (
              <button
                type="button"
                onClick={() => {
                  setEvidence((prev) => prev.trim()
                    ? prev
                    : `I run the Instagram account @${instagramHandle} that this listing was built from.`);
                  setContact((prev) => prev.trim() ? prev : `@${instagramHandle}`);
                }}
                className="mt-3 w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 text-left min-h-[44px]"
              >
                <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                  I run @{instagramHandle} on Instagram
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                  Fills this in for you. A reviewer checks the account against the listing.
                </span>
              </button>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setOpen(false)} className="px-4 min-h-[44px] text-sm font-semibold text-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={submit} disabled={saving}
                className="inline-flex items-center gap-2 px-5 min-h-[44px] rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />} Send claim
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
