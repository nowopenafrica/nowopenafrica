import { describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../lib/supabase', () => {
  const orgId = '00000000-0000-4000-8000-00000000a001';
  const docs = [
    { id: 'kb-1', org_id: orgId, category: 'Brand', title: 'Brand voice', summary: 'How NowOpen talks — friendly, concrete, never corporate.', body: ['One emoji max in social copy; none in product UI.'], tags: ['voice', 'copy', 'tone'], source: 'sop' },
    { id: 'kb-2', org_id: orgId, category: 'Finance', title: 'Monthly finance report — approved · #44abcd', summary: 'Sign-off recorded: the work item was approved and moved to done.', body: ['Monthly finance report was approved by a human.', 'The work item is now done on the Work Board.'], tags: ['decision', 'approved', 'finance'], source: 'decision', linked_work_item_id: 'wi-fin' },
    { id: 'kb-3', org_id: orgId, category: 'Support', title: 'Enquiry first response', summary: 'The SLA and tone for every platform enquiry.', body: ['Reply within 4 working hours.'], tags: ['support', 'enquiry', 'sla'], source: 'sop' },
  ];
  const q = (data: unknown) => {
    const result = { data, error: null };
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      then: (onF?: any, onR?: any) => Promise.resolve(result).then(onF, onR),
      catch: (onR?: any) => Promise.resolve(result).catch(onR),
      finally: (onF?: any) => Promise.resolve(result).finally(onF),
    };
    return chain;
  };
  return {
    supabase: {
      from: vi.fn((table: string) => q(table === 'os_knowledge' ? docs : [])),
    },
  };
});

import KnowledgeBase from '../components/admin/KnowledgeBase';
import { supabase } from '../lib/supabase';

describe('KnowledgeBase smoke', () => {
  it('renders the live docs from os_knowledge with the synced decision', async () => {
    render(<KnowledgeBase />);
    expect(await screen.findByText('Brand voice')).toBeInTheDocument();
    expect(screen.getByText(/3 docs across 8 areas/)).toBeInTheDocument();
    expect(screen.getByText('1 decision synced from approvals')).toBeInTheDocument();
    expect(screen.getByText('Monthly finance report — approved · #44abcd')).toBeInTheDocument();
    expect(screen.getAllByText('Decision').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Demo knowledge base/)).not.toBeInTheDocument();
  });

  it('searches and filters by category', async () => {
    render(<KnowledgeBase />);
    await screen.findByText('Brand voice');

    fireEvent.change(screen.getByPlaceholderText('Search the docs…'), { target: { value: 'enquiry' } });
    expect(screen.getByText('Enquiry first response')).toBeInTheDocument();
    expect(screen.queryByText('Brand voice')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search the docs…'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Brand' }));
    expect(screen.getByText('Brand voice')).toBeInTheDocument();
    expect(screen.queryByText('Enquiry first response')).not.toBeInTheDocument();
  });

  it('filters to decisions only', async () => {
    render(<KnowledgeBase />);
    await screen.findByText('Brand voice');
    fireEvent.click(screen.getByRole('button', { name: 'Decisions' }));
    expect(screen.getByText('Monthly finance report — approved · #44abcd')).toBeInTheDocument();
    expect(screen.queryByText('Brand voice')).not.toBeInTheDocument();
  });

  it('expands a doc to its playbook body', async () => {
    render(<KnowledgeBase />);
    fireEvent.click(await screen.findByText('Brand voice'));
    expect(screen.getByText('One emoji max in social copy; none in product UI.')).toBeInTheDocument();
    expect(screen.getByText('#voice')).toBeInTheDocument();
  });
});

describe('KnowledgeBase fallback', () => {
  it('labels the demo seed when os_knowledge is unavailable', async () => {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      insert: vi.fn(async () => ({ data: null, error: null })),
      then: (onF?: any, onR?: any) => Promise.resolve({ data: [], error: null }).then(onF, onR),
      catch: (onR?: any) => Promise.resolve({ data: [], error: null }).catch(onR),
      finally: (onF?: any) => Promise.resolve({ data: [], error: null }).finally(onF),
    };
    vi.mocked(supabase.from).mockImplementation(() => chain as never);
    render(<KnowledgeBase />);
    expect(await screen.findByText(/Demo knowledge base/)).toBeInTheDocument();
    expect(screen.getByText('Brand voice')).toBeInTheDocument();
  });
});
