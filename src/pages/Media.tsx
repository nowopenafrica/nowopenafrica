import { useEffect } from 'react';
import CreateMarketplace from '../components/create/CreateMarketplace';
import { applySeo } from '../lib/seo';

/**
 * /media — NowOpen Create.
 *
 * The page asks one question — "What do you need?" (the h1, in
 * IntentComposer) — and answers with designs. See CreateMarketplace for the
 * order and why it is only four things long.
 *
 * Everything about having it made — Hire a creator, the discipline filter,
 * the services list, the priced catalogue, packs and credits — moved,
 * intact, to /media/services (pages/MediaServices.tsx). The slim band that
 * carried the proposition went with the facts strip: the request bar now
 * says it, in the place people read.
 */
export default function Media() {
  useEffect(() => {
    return applySeo({
      title: 'NowOpen Create — Design, Print & Promote for African Business',
      description:
        // Only what the page shows. It said "professional design by African
        // creators" and "printing delivered across Nigeria" — the creators moved
        // to /media/services (and none are listed yet), and no print partner
        // has quoted. The designs themselves are free to download.
        'Business cards, flyers, menus, social posts and signs — made from your brand, free to download.',
      path: '/media',
      image: '/og-image.png',
    });
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="site-container py-6 sm:py-10">
        <CreateMarketplace />
      </div>
    </div>
  );
}
