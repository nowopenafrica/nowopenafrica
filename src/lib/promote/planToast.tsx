import toast from 'react-hot-toast';

import { SIGN_IN_TO_SAVE_PLAN, type PlanAddResult } from './campaigns';
import { signInLinkTo } from '../safeNext';

/** Where the visitor is now, so signing in brings them straight back. */
const here = () =>
  typeof window === 'undefined'
    ? '/adverts'
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * The toast after a plan write, in one place for every "Add to plan".
 *
 * addAdvertsToPlan skips placements already in the plan and counts them, so
 * "already there" is not an error and is said as such. A failure shows the
 * helper's own reason ("Media plans are not switched on yet." …) rather than
 * a generic one. Signed out, the reason alone is a dead end, so that toast
 * carries the way through: a sign-in link that returns to this page. It is a
 * plain link, not a router Link, because the toaster renders outside the
 * page's tree; the app reloads into the same URL either way.
 */
export function reportPlanAdd(out: PlanAddResult) {
  if (!out.ok) {
    if (out.error === SIGN_IN_TO_SAVE_PLAN) {
      toast.error(
        <span>
          {SIGN_IN_TO_SAVE_PLAN}{' '}
          <a href={signInLinkTo(here())} className="font-semibold underline underline-offset-2">Sign in</a>
        </span>,
        { id: 'plan-sign-in', duration: 8000 },
      );
      return;
    }
    toast.error(out.error);
    return;
  }
  if (out.added === 0) { toast(out.skipped > 0 ? 'Already in your plan.' : 'Nothing to add.'); return; }
  toast.success(`Added ${out.added} to your plan.${out.skipped > 0 ? ` · ${out.skipped} already there` : ''}`);
}
