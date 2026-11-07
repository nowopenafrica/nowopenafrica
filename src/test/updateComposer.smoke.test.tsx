import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList;
}
// jsdom has no object URLs; the composer only uses them for previews.
URL.createObjectURL = vi.fn(() => 'blob:preview');
URL.revokeObjectURL = vi.fn();

const api = vi.hoisted(() => ({
  createDraftUpdate: vi.fn(),
  uploadUpdateMedia: vi.fn(),
  publishUpdate: vi.fn(),
  updateDraftText: vi.fn(),
  loadOwnOffers: vi.fn(),
}));
vi.mock('../lib/businessUpdatesApi', () => api);

import UpdateComposer from '../components/dashboard/UpdateComposer';
import type { KeepTopic } from '../lib/keeps';

const reach3 = { promotions: 3, products: 3, events: 3, locations: 0, openings: 0, announcements: 3 } as Record<KeepTopic, number>;

const renderComposer = (over: Partial<Parameters<typeof UpdateComposer>[0]> = {}) => {
  const onDone = vi.fn();
  render(
    <UpdateComposer businessId="b1" businessName="Mama Put" isOwner reach={reach3}
      onDone={onDone} onCancel={vi.fn()} {...over} />,
  );
  return { onDone };
};

beforeEach(() => {
  vi.clearAllMocks();
  api.createDraftUpdate.mockResolvedValue({ ok: true, value: 'u-1' });
  api.uploadUpdateMedia.mockResolvedValue({ uploaded: 0, failed: [] });
  api.publishUpdate.mockResolvedValue({ ok: true, value: undefined });
  api.updateDraftText.mockResolvedValue({ ok: true, value: undefined });
  api.loadOwnOffers.mockResolvedValue({ ok: true, value: [{ id: 'o1', title: 'Weekend Special', headline: '20% OFF' }] });
});

describe('UpdateComposer', () => {
  it('will not publish an empty update, and says why', () => {
    renderComposer();
    expect(screen.getByRole('button', { name: /^Publish/ })).toBeDisabled();
    expect(screen.getByText('Add some text, a photo or a video.')).toBeInTheDocument();
  });

  it('offers the offer picker to the owner and explains it to a team member', async () => {
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Offer' }));
    expect(await screen.findByLabelText('Which offer')).toBeInTheDocument();
    expect(await screen.findByText(/20% OFF/)).toBeInTheDocument();
  });

  it('tells a team member only the owner can attach an offer', () => {
    renderComposer({ isOwner: false });
    fireEvent.click(screen.getByRole('button', { name: 'Offer' }));
    expect(screen.getByText(/Only the owner can attach an offer/)).toBeInTheDocument();
    expect(api.loadOwnOffers).not.toHaveBeenCalled();
  });

  it('says how many real keepers will be told, and no number when it cannot know', () => {
    renderComposer();
    expect(screen.getByText(/Tell the 3 people who keep Mama Put/)).toBeInTheDocument();
  });

  it('shows no invented number when the keeper count is unknown', () => {
    renderComposer({ reach: null });
    const line = screen.getByText(/Tell the people who keep Mama Put/);
    expect(line.textContent).not.toMatch(/\d/);
  });

  it("shows the database's refusal and keeps the draft", async () => {
    api.publishUpdate.mockResolvedValue({ ok: false, message: 'That time has already passed.' });
    const { onDone } = renderComposer();
    fireEvent.change(screen.getByLabelText(/^Text/), { target: { value: 'Open late tonight' } });
    fireEvent.click(screen.getByRole('button', { name: /^Publish/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That time has already passed.');
    expect(onDone).not.toHaveBeenCalled();

    // Trying again publishes the same draft rather than creating a second one.
    api.publishUpdate.mockResolvedValue({ ok: true, value: undefined });
    fireEvent.click(screen.getByRole('button', { name: /^Publish/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.createDraftUpdate).toHaveBeenCalledTimes(1);
  });

  it('stops before publishing when a file fails, and names it', async () => {
    api.uploadUpdateMedia.mockResolvedValue({ uploaded: 0, failed: [{ name: 'shop.jpg', message: 'Payload too large' }] });
    renderComposer();
    const input = screen.getByLabelText(/Add photos or videos/);
    fireEvent.change(input, { target: { files: [new File(['x'], 'shop.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByAltText(/shop\.jpg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Publish/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/saved as a draft/i);
    expect(alert).toHaveTextContent('shop.jpg');
    expect(api.publishUpdate).not.toHaveBeenCalled();
  });

  it('refuses a file the bucket would refuse, before any upload', async () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText(/Add photos or videos/), {
      target: { files: [new File(['x'], 'photo.heic', { type: 'image/heic' })] },
    });
    expect(await screen.findByText(/photo\.heic: Choose a photo or a video\./)).toBeInTheDocument();
  });

  it('can publish an edited draft whose only content is its photos', () => {
    renderComposer({ initial: { draftId: 'u-2', type: 'announcement', existingMediaCount: 2, notifyKeepers: true } });
    expect(screen.getByRole('button', { name: /^Publish/ })).toBeEnabled();
  });

  it('shows a quiet draft as quiet', () => {
    renderComposer({ initial: { draftId: 'u-3', type: 'announcement', body: 'x', existingMediaCount: 0, notifyKeepers: false } });
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('says "person who keeps" for one keeper', () => {
    renderComposer({ reach: { ...reach3, announcements: 1 } });
    expect(screen.getByText(/Tell the 1 person who keeps Mama Put/)).toBeInTheDocument();
  });
});
