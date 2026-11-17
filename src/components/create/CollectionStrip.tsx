import { useMemo } from 'react';

import TemplateCard, { TemplateCardSkeleton } from './TemplateCard';
import type { DesignTemplate } from '../../lib/designTemplates';
import { COLLECTIONS, resolveCollections } from '../../lib/create/collections';

/**
 * Featured collections (spec §10), from the committed, founder-edited list in
 * lib/create/collections.ts. No "trending" and no "best sellers": there is no
 * reliable usage count to rank by.
 *
 * A design no longer listed is dropped; a collection left empty is not
 * shown; with none left the strip renders nothing, unless the catalogue is
 * still loading, when it holds the space with a skeleton.
 */
export default function CollectionStrip({
  listed, onEdit, loading = false,
}: {
  listed: DesignTemplate[];
  onEdit: (tpl: DesignTemplate) => void;
  loading?: boolean;
}) {
  const collections = useMemo(() => resolveCollections(listed), [listed]);

  if (collections.length === 0 && !loading) return null;

  return (
    <section
      data-create-section="collections"
      data-testid="collections"
      aria-label="Featured collections"
      aria-busy={collections.length === 0}
      className="space-y-6"
    >
      {collections.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: Math.min(6, COLLECTIONS[0]?.templateKeys.length ?? 6) }, (_, i) => (
            <TemplateCardSkeleton key={i} />
          ))}
        </div>
      ) : collections.map(({ collection, templates }) => (
        <div key={collection.key} data-testid="collection" data-collection={collection.key}>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{collection.title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{collection.blurb}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {templates.map((t) => <TemplateCard key={t.key} template={t} onEdit={onEdit} />)}
          </div>
        </div>
      ))}
    </section>
  );
}
