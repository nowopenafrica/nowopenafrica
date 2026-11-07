# Business Updates: dashboard wiring (not in the commit)

`src/pages/Dashboard.tsx` and `src/components/dashboard/BusinessList.tsx` are not committed with phase 2, for two reasons:
- **The git base is old.** `main` holds an early version of both files that predates Offers and most of the dashboard.
- **The working copies hold other sessions' work.** Both carry uncommitted edits from other work.

Committing either file would publish other people's unreviewed changes, so the Business Updates additions are recorded here instead. They are already in the working folder, and that folder is what `npx vercel --prod` deploys.

`src/test/dashboardUpdatesWiring.test.ts` pins every snippet below, so it fails if one goes missing.

## src/pages/Dashboard.tsx

After `import OffersManager from '../components/dashboard/OffersManager';`:

```tsx
import UpdatesManager from '../components/dashboard/UpdatesManager';
```

After `const [offersBusiness, setOffersBusiness] = useState<Business | null>(null);`:

```tsx
const [updatesBusiness, setUpdatesBusiness] = useState<Business | null>(null);
```

In the `openRequest` switch, after `case 'offers': ...`:

```tsx
case 'updates': setUpdatesBusiness(target); break;
```

On `<BusinessList … />`, after `onManageOffers=…`:

```tsx
onManageUpdates={(business) => setUpdatesBusiness(business)}
```

After the `{offersBusiness && (<OffersManager … />)}` block:

```tsx
{/* Business Updates: 24-hour posts. isOwner decides only whether the
    offer picker is offered; the database decides what may be written. */}
{updatesBusiness && (
  <UpdatesManager
    businessId={String(updatesBusiness.id)}
    businessName={updatesBusiness.name}
    isOwner={String(updatesBusiness.user_id ?? '') === String(user?.id ?? '-')}
    onClose={() => setUpdatesBusiness(null)}
  />
)}
```

## src/components/dashboard/BusinessList.tsx

**Imports.** Add `Megaphone` to the `lucide-react` import, and add:

```tsx
import { PUBLISHER_ROLES } from '../../lib/businessUpdates';
```

**Props.** Add to `BusinessListProps`, and destructure it in the component signature:

```tsx
/** Open the Business Updates manager (24-hour updates) for a business */
onManageUpdates?: (business: Business) => void;
```

**Owned business card.** Insert before the Offers button:

```tsx
{onManageUpdates && (
  <button
    onClick={() => onManageUpdates(business)}
    aria-label={`Post an update for ${business.name}`}
    title="Updates — public for 24 hours"
    className="inline-flex items-center justify-center w-[44px] h-[44px] text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition"
  >
    <Megaphone size={16} />
  </button>
)}
```

**"Shared with you" rows.** Wrap the existing "Manage content" button with an Updates button, shown only for publishing roles:

```tsx
<div className="flex items-center gap-2 shrink-0">
  {/* Only roles the database lets publish; the button is a hint, RLS is the rule. */}
  {onManageUpdates && (PUBLISHER_ROLES as readonly string[]).includes(role) && (
    <button
      onClick={() => onManageUpdates(business)}
      aria-label={`Post an update for ${business.name}`}
      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-medium border border-amber-500 text-amber-700 dark:text-amber-300 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30"
    >
      <Megaphone size={13} /> Updates
    </button>
  )}
  {/* existing "Manage content" button unchanged */}
</div>
```
