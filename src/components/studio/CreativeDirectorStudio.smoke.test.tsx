import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Business } from '../../types';

vi.mock('./supabase', () => {
  const q = () => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      then: (onF?: any, onR?: any) => Promise.resolve({ data: [], error: null }).then(onF, onR),
      catch: (onR?: any) => Promise.resolve({ data: [], error: null }).catch(onR),
      finally: (onF?: any) => Promise.resolve({ data: [], error: null }).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn(() => q()),
    },
  };
});

import CreativeDirectorStudio from './CreativeDirectorStudio';

const biz: Business = {
  id: 'biz-1',
  name: 'Meat Club',
  description: 'Smoked meats and grills.',
  category: 'Restaurant',
  location: 'Lagos',
  phone: '+234 800 123 4567',
  logo_url: 'https://img/logo.png',
  rating: 4.6,
};

describe('CreativeDirectorStudio smoke', () => {
  it('generates a video from a brief without crashing', async () => {
    render(<CreativeDirectorStudio business={biz} />);
    const input = screen.getByPlaceholderText(/I want more customers this weekend/i);
    fireEvent.change(input, { target: { value: 'Weekend grill special on instagram' } });
    fireEvent.click(screen.getAllByText(/generate video/i)[0]);
    await act(async () => { await new Promise((r) => setTimeout(r, 1800)); });
    // Phone-preview modal opens after generate — must not crash.
    expect(screen.getByText(/Real render|Scene 1/i)).toBeInTheDocument();
    // Auto-picked the best free model closest to Seedance (Wan 2.2).
    expect(screen.getAllByText(/Wan 2\.2/).length).toBeGreaterThan(0);
    // Close the modal, open the Generate tab, and check the latest render has scenes.
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }));
    expect(screen.getByText(/latest render/i)).toBeInTheDocument();
    expect(screen.getByText(/Reel 30 · [1-9]\d*s/)).toBeInTheDocument();
    const renderPanel = screen.getByText(/latest render/i).closest('div') as HTMLElement;
    expect(renderPanel.textContent).toContain('Rendered with Wan 2.2 (Alibaba Cloud)');
    expect(renderPanel.textContent).toContain('closest to Seedance 2.5');
  });
});
