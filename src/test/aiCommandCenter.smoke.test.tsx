import { afterEach, describe, it, vi, expect } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';

// jsdom lacks element scrolling — the thread auto-scrolls on every message.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.scrollTo !== 'function') {
  Element.prototype.scrollTo = () => {};
}

vi.mock('../lib/supabase', () => {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: { id: 'u1', role: 'admin' }, error: null })),
    then: (onF?: any, onR?: any) => Promise.resolve({ data: { id: 'u1', role: 'admin' }, error: null }).then(onF, onR),
    catch: (onR?: any) => Promise.resolve({ data: { id: 'u1', role: 'admin' }, error: null }).catch(onR),
    finally: (onF?: any) => Promise.resolve({ data: { id: 'u1', role: 'admin' }, error: null }).finally(onF),
  };
  return {
    supabase: {
      from: vi.fn(() => chain),
      functions: { invoke: vi.fn() },
    },
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'admin@nowopen.africa' },
    session: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../lib/aiCommand/client', () => {
  const list = vi.fn().mockResolvedValue({ autonomy_level: 2, sessions: [] });
  const create = vi.fn().mockResolvedValue({ session: { id: 's1', title: 'test session', autonomy_level: 2 } });
  const get = vi.fn().mockResolvedValue({ session: { id: 's1', title: 'test session', agent_ids: [], autonomy_level: 2, status: 'active', updated_at: new Date().toISOString(), created_at: new Date().toISOString(), summary: {} }, autonomy_level: 2, messages: [], tool_calls: [], approvals: [] });
  const run = vi.fn().mockImplementation(async ({ toolName }: { toolName: string }) => ({
    ok: true, tool: toolName, risk: 'READ', readOnly: true, status: 'executed', result: { ok: true, count: 3 }, error: null, durationMs: 5,
  }));
  const llm = vi.fn().mockResolvedValue({ ok: true, text: 'Platform is healthy today.', provider: 'test', model: 'test-model', reason: null, durationMs: 4 });
  const append = vi.fn().mockResolvedValue({ message: { id: 'm1', role: 'user', created_at: new Date().toISOString() } });
  const archive = vi.fn().mockResolvedValue({ ok: true });
  return {
    aiSessionsList: list,
    aiSessionCreate: create,
    aiSessionGet: get,
    aiSessionArchive: archive,
    aiSessionAppend: append,
    aiRunTool: run,
    aiLlm: llm,
  };
});

import AiCommandCenter from '../components/admin/AiCommandCenter';

afterEach(() => cleanup());

describe('AiCommandCenter smoke', () => {
  it('renders the workspace with the Level 2 autonomy state visible', () => {
    const { container } = render(<AiCommandCenter onOpenSection={() => {}} />);
    const view = within(container);
    expect(view.getByText('OpenAI Code Center')).toBeInTheDocument();
    expect(view.getByText('Level 2 · Prepare')).toBeInTheDocument();
    expect(view.getByText('read-only tools')).toBeInTheDocument();
    expect(view.getByText('Ask the platform anything.')).toBeInTheDocument();
  });

  it('runs a full plan: session, read-only tool cards, then a synthesized reply', async () => {
    const { container } = render(<AiCommandCenter onOpenSection={() => {}} />);
    const view = within(container);

    fireEvent.change(view.getByPlaceholderText(/Ask about businesses, claims, growth, quality, security/), {
      target: { value: 'how is the platform health' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Run' }));

    expect(await view.findByText(/Audit & Insight — running: platform_health/)).toBeInTheDocument();
    expect(await view.findByText('Platform is healthy today.')).toBeInTheDocument();

    const { aiSessionCreate, aiSessionAppend, aiRunTool } = await import('../lib/aiCommand/client');
    expect(aiSessionCreate).toHaveBeenCalledTimes(1);
    expect(aiSessionAppend).toHaveBeenCalled();
    expect(aiRunTool).toHaveBeenCalledWith(expect.objectContaining({ toolName: 'platform_health' }));
    expect(screen.getAllByText('read-only').length).toBeGreaterThan(0);
  });
});