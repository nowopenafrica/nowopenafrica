import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../lib/geolocation', () => ({
  isGeolocationSupported: () => false,
  detectLocation: vi.fn(),
}));

import VoiceAssistant from '../components/VoiceAssistant';

/**
 * A browser with no SpeechRecognition at all — Firefox, many in-app browsers,
 * older iOS. The assistant used to render nothing here, so on those devices
 * NowOpen AI simply did not exist and nothing said why.
 */
const w = window as unknown as Record<string, unknown>;

beforeEach(() => {
  delete w.SpeechRecognition;
  delete w.webkitSpeechRecognition;
  navigateSpy.mockClear();
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

const mount = () => render(<MemoryRouter><VoiceAssistant /></MemoryRouter>);

describe('VoiceAssistant without speech recognition', () => {
  it('still offers the assistant instead of vanishing', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /Ask NowOpen AI/i })).toBeInTheDocument();
  });

  it('opens a panel that takes a typed question', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Ask NowOpen AI/i }));
    expect(await screen.findByLabelText('Ask NowOpen AI')).toBeInTheDocument();
  });

  it('explains what this browser cannot do, and names one that can', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Ask NowOpen AI/i }));
    expect(await screen.findByText(/cannot listen/i)).toBeInTheDocument();
    expect(screen.getByText(/Chrome or Edge/)).toBeInTheDocument();
  });

  it('does not offer hands-free listening it cannot deliver', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Ask NowOpen AI/i }));
    await screen.findByLabelText('Ask NowOpen AI');
    expect(screen.queryByText(/Wake phrase/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resume|Pause/ })).not.toBeInTheDocument();
  });

  it('answers a typed question with the same engine speech would have used', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Ask NowOpen AI/i }));
    const box = await screen.findByLabelText('Ask NowOpen AI');
    fireEvent.change(box, { target: { value: 'open my dashboard' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
    expect(String(navigateSpy.mock.calls[0][0])).toContain('/dashboard');
  });

  it('does not require the wake phrase for something that was typed', async () => {
    // Typing IS the activation; demanding "NowOpen AI" in the box as well
    // would be asking someone to say a magic word to a text field.
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Ask NowOpen AI/i }));
    const box = await screen.findByLabelText('Ask NowOpen AI');
    fireEvent.change(box, { target: { value: 'open my dashboard' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(navigateSpy).toHaveBeenCalled());
  });

  it('ignores an empty submission rather than answering nothing', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /Ask NowOpen AI/i }));
    const box = await screen.findByLabelText('Ask NowOpen AI');
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.submit(box.closest('form')!);
    await new Promise((r) => setTimeout(r, 50));
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});
