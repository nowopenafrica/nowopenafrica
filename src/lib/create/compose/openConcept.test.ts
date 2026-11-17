import { describe, expect, it, vi } from 'vitest';

vi.mock('../../supabase', () => ({ supabase: {} }));

import { MANIFEST, assetUrl, assetWebUrl } from '../../design/assetManifest';
import { galleryFor } from './gallery';
import { withOriginals } from './openConcept';

describe('opening a gallery design for editing', () => {
  it('swaps every web-size photograph for its original, and leaves the gallery document alone', () => {
    const photo = MANIFEST.assets.find((a) => a.kind === 'photo' && a.web)!;
    const d = galleryFor('flyer', { count: 8 }).find((g) => g.photo)!;
    const img = () => d.doc.pages[0].objects.find((o) => o.type === 'image') as { assetId: string };
    expect(img().assetId).toContain('/design-assets/web/');

    const opened = withOriginals(d.doc);
    const out = opened.pages[0].objects.find((o) => o.type === 'image') as { assetId: string };
    expect(out.assetId).not.toContain('/design-assets/web/');
    expect(MANIFEST.assets.some((a) => assetUrl(a.id) === out.assetId)).toBe(true);
    /* The card keeps drawing the small copy. */
    expect(img().assetId).toContain('/design-assets/web/');
    expect(assetWebUrl(photo.id)).toContain('/design-assets/web/');
  });
});
