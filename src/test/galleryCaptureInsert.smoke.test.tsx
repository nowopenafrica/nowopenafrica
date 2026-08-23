import { describe, it, expect, vi, beforeEach } from 'vitest';

// A capture must land in business_gallery, not just in Storage.
//
// The bug this guards: OpenReelCapture uploaded the file and handed back its
// public URL, and the content manager only put that URL into the form's URL
// field. So an owner recorded a reel, was told it had been added, and found an
// empty gallery — the row was never inserted. Both the Add button and the camera
// now go through the same insert.

interface Insert { table: string; rows: Record<string, unknown>[] }

const inserts: Insert[] = [];
let insertError: { message: string } | null = null;

vi.mock('../lib/supabase', () => {
  const chain = (table: string) => ({
    select: () => chain(table),
    eq: () => chain(table),
    order: () => chain(table),
    limit: () => chain(table),
    maybeSingle: async () => ({ data: null, error: null }),
    insert: async (rows: Record<string, unknown>[]) => {
      inserts.push({ table, rows });
      return { data: null, error: insertError };
    },
    then: (onF?: any) => Promise.resolve({ data: [], error: null }).then(onF),
  });
  return {
    supabase: {
      from: (table: string) => chain(table),
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-1' }, session: null, loading: false, signOut: vi.fn() }),
}));

// The camera itself needs a real device; the contract under test is what the
// content manager does with the URL the camera hands back.
let capturedCallback: ((url: string, type: 'photo' | 'video') => void) | null = null;
vi.mock('../components/dashboard/OpenReelCapture', () => ({
  default: (props: { onCaptured: (url: string, type: 'photo' | 'video') => void }) => {
    capturedCallback = props.onCaptured;
    return null;
  },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BusinessContentManager from '../components/dashboard/BusinessContentManager';

const REEL = 'https://x.supabase.co/storage/v1/object/public/business-images/u-1/reel-1.mp4';

beforeEach(() => {
  inserts.length = 0;
  insertError = null;
  capturedCallback = null;
});

const mountAndOpenCamera = async () => {
  render(
    <BusinessContentManager
      businessId="b-1"
      businessName="Mama Put Kitchen"
      category="Restaurant"
      onClose={vi.fn()}
    />,
  );
  // Reach the gallery tab, where the camera lives.
  const galleryTab = await screen.findByRole('button', { name: /Gallery|OpenReel/i });
  fireEvent.click(galleryTab);
  const cameraButton = await screen.findByRole('button', { name: /OpenReel Camera/i });
  fireEvent.click(cameraButton);
  await waitFor(() => expect(capturedCallback).toBeTruthy());
};

describe('an OpenReel capture is stored in the gallery', () => {
  it('inserts a business_gallery row when the camera returns a URL', async () => {
    await mountAndOpenCamera();
    capturedCallback!(REEL, 'video');

    await waitFor(() => {
      const gallery = inserts.filter((i) => i.table === 'business_gallery');
      expect(gallery).toHaveLength(1);
      expect(gallery[0].rows[0]).toMatchObject({ business_id: 'b-1', image_url: REEL });
    });
  });

  it('keeps the URL in the form when the insert fails, so the upload is not lost', async () => {
    insertError = { message: 'row level security' };
    await mountAndOpenCamera();
    capturedCallback!(REEL, 'video');

    await waitFor(() => {
      expect(inserts.filter((i) => i.table === 'business_gallery')).toHaveLength(1);
    });
    // The pasted-URL field still holds it, so Add can be retried.
    await waitFor(() => {
      const field = screen.getByPlaceholderText(/paste a link/i) as HTMLInputElement;
      expect(field.value).toBe(REEL);
    });
  });
});
