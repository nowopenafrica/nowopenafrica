import { readFileSync } from 'node:fs';

import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * OnboardingMessagingPanel — the admin manual-send + ledger screen.
 *
 * The screen only exists behind an admin session, so the properties that
 * matter are exercised here:
 *
 *   IT SENDS ONLY WHAT WAS TYPED. The whole point is the admin override
 *   (business name + WhatsApp number and/or Instagram recipient). The payload
 *   must carry exactly those, plus mode 'manual' and the chosen channels.
 *
 *   IT REPORTS THE TRUTH FROM THE SERVER. The function is the only sender;
 *   this screen renders whatever status came back per channel. A
 *   needs_provider / needs_conversation result is shown as "Not sent" with
 *   the reason — never as success.
 *
 *   CHANNELS MATTER. WhatsApp needs a number; Instagram needs a recipient and
 *   refuses cold DMs (needs_conversation) — the screen must surface both
 *   without pretending an Instagram-only send is a WhatsApp send.
 *
 *   A FAILED READ IS A FAILED READ. RPC failures surface as a problem box,
 *   not as an empty ledger that would read like "nothing has been sent".
 */

const state: {
  pipeline: Record<string, unknown> | null;
  autoRows: unknown[];
  manualRows: unknown[];
  listError: { message: string } | null;
  invokeResult: {
    ok: boolean;
    status: string;
    results: Array<{ channel: string; ok: boolean; status: string; reason: string | null; error: string | null }>;
  } | null;
  invokeError: { message: string } | null;
  previewResult: Record<string, unknown> | null;
  previewError: { message: string } | null;
  requeueCalls: unknown[];
  requeueError: { message: string } | null;
} = {
  pipeline: { scheduled: true, schedule: '*/15 * * * *', active: true, last_run: null, last_status: null, configured: false, queued: 1, sent: 2, blocked: 0 },
  autoRows: [],
  manualRows: [],
  listError: null,
  invokeResult: null,
  invokeError: null,
  previewResult: {
    ok: true,
    mode: 'preview',
    whatsapp: {
      text: 'Hi Ada, welcome to NowOpen Africa! Your business is live. Open now, fill your profile, catch every lead, share your QR. Reply here for a hand.',
      params: ['Ada', "Ada's Kitchen", 'nowopenafrica.com/adas-kitchen'],
      template: null,
      templateLang: 'en',
      providerConfigured: false,
      templateConfigured: false,
    },
    instagram: {
      text: 'Hey Ada 👋 your business just went live on NowOpen Africa 🎉 Tap here to open it. DM us here anytime — a real person replies. 💬',
      providerConfigured: false,
    },
  },
  previewError: null,
  requeueCalls: [],
  requeueError: null,
};

vi.mock('../lib/supabase', () => {
  const result = (rows: unknown, error: { message: string } | null = null) => ({ data: error ? null : rows, error });
  return {
    supabase: {
      rpc: vi.fn((name: string, args?: Record<string, unknown>) => {
        if (name === 'onboarding_welcome_status') return Promise.resolve(result(state.pipeline, state.listError));
        if (name === 'onboarding_messages_list') return Promise.resolve(result(state.autoRows, state.listError));
        if (name === 'onboarding_manual_sends_list') return Promise.resolve(result(state.manualRows, state.listError));
        if (name === 'onboarding_messages_requeue') {
          state.requeueCalls.push(args);
          return Promise.resolve(result(null, state.requeueError));
        }
        return Promise.resolve(result(null, { message: 'unknown rpc' }));
      }),
    },
  };
});

// The panel talks to the edge function through the raw-fetch transport
// (invokeSendOnboarding), NOT supabase.functions.invoke — the SDK path trips
// the gateway when it attaches the `apikey` header.
vi.mock('../lib/onboarding', () => ({
  invokeSendOnboarding: vi.fn(async (body: { mode?: string }) => {
    if (body?.mode === 'preview') {
      return state.previewError
        ? { data: null, error: state.previewError.message }
        : { data: state.previewResult, error: null };
    }
    return state.invokeError
      ? { data: null, error: state.invokeError.message }
      : { data: state.invokeResult, error: null };
  }),
}));

import OnboardingMessagingPanel from '../components/admin/OnboardingMessagingPanel';

const autoRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  business_id: '4d34dc48-440f-47ed-80af-28123aa7f7c6',
  channel: 'whatsapp',
  phone: '+2348030000001',
  handle: null,
  status: 'queued',
  reason: null,
  error: null,
  attempts: 0,
  created_at: '2026-09-13T10:00:00Z',
  sent_at: null,
  ...over,
});

const manualRow = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  business_name: "Ada's Kitchen",
  channel: 'whatsapp',
  phone: '+2348030000001',
  handle: null,
  owner_name: null,
  status: 'sent',
  reason: null,
  error: null,
  created_at: '2026-09-13T11:00:00Z',
  sent_at: '2026-09-13T11:00:01Z',
  ...over,
});

beforeEach(() => {
  state.pipeline = { scheduled: true, schedule: '*/15 * * * *', active: true, last_run: null, last_status: null, configured: false, queued: 1, sent: 2, blocked: 0 };
  state.autoRows = [];
  state.manualRows = [];
  state.listError = null;
  state.invokeResult = null;
  state.invokeError = null;
  state.previewResult = {
    ok: true,
    mode: 'preview',
    whatsapp: {
      text: 'Hi Ada, welcome to NowOpen Africa! Your business is live. Open now, fill your profile, catch every lead, share your QR. Reply here for a hand.',
      params: ['Ada', "Ada's Kitchen", 'nowopenafrica.com/adas-kitchen'],
      template: null,
      templateLang: 'en',
      providerConfigured: false,
      templateConfigured: false,
    },
    instagram: {
      text: 'Hey Ada 👋 your business just went live on NowOpen Africa 🎉 Tap here to open it. DM us here anytime — a real person replies. 💬',
      providerConfigured: false,
    },
  };
  state.previewError = null;
  state.requeueCalls = [];
  state.requeueError = null;
});

describe('Onboarding messaging panel', () => {
  it('offers the manual send form, the setup checklist and shows both ledgers empty', async () => {
    render(<OnboardingMessagingPanel />);

    expect(screen.getByLabelText('Business name')).toBeInTheDocument();
    const number = screen.getByLabelText('WhatsApp number');
    expect(number).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send whatsapp welcome/i })).toBeInTheDocument();

    // The preview renders the exact server copy, plus the setup checklist.
    await waitFor(() =>
      expect(screen.getByText(/welcome to nowopen africa/i)).toBeInTheDocument());
    expect(screen.getByText(/switch real delivery on/i)).toBeInTheDocument();
    expect(screen.getByText(/whatsapp business api/i)).toBeInTheDocument();
    expect(screen.getByText(/approved welcome template/i)).toBeInTheDocument();
    expect(screen.getByText(/instagram messaging api/i)).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText(/no queue rows yet/i)).toBeInTheDocument());
    expect(screen.getByText(/no manual sends yet/i)).toBeInTheDocument();
  });

  it('flags the missing pieces on the setup checklist for both channels', async () => {
    render(<OnboardingMessagingPanel />);

    await waitFor(() =>
      expect(screen.getByText(/missing — run: supabase secrets set whatsapp_token/i)).toBeInTheDocument());
    expect(screen.getByText(/missing — approve a template in meta business manager/i)).toBeInTheDocument();
    expect(screen.getByText(/missing — starting from scratch: create a meta app/i)).toBeInTheDocument();
  });

  it('sends exactly what was typed for WhatsApp, and repeats the server verdict', async () => {
    const { invokeSendOnboarding } = await import('../lib/onboarding');
    state.invokeResult = {
      ok: false,
      status: 'needs_provider',
      results: [{
        channel: 'whatsapp',
        ok: false,
        status: 'needs_provider',
        reason: 'WhatsApp provider not configured (WHATSAPP_TOKEN/WHATSAPP_PHONE_ID).',
        error: null,
      }],
    };

    render(<OnboardingMessagingPanel />);
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: "Ada's Kitchen" } });
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '0803 000 0001' } });
    fireEvent.click(screen.getByRole('button', { name: /send whatsapp welcome/i }));

    await waitFor(() => {
      const calls = (
        invokeSendOnboarding as ReturnType<typeof vi.fn>
      ).mock.calls;
      // The mock keeps history across tests; the current test's manual call is
      // the LAST one in the list.
      const manualCall = [...calls].reverse().find((c) => c[0]?.mode === 'manual');
      expect(manualCall).toBeTruthy();
      if (!manualCall) throw new Error('No manual send was dispatched.');
      expect(manualCall[0]).toMatchObject({
        mode: 'manual',
        channels: ['whatsapp'],
        businessName: "Ada's Kitchen",
        phone: '0803 000 0001',
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/whatsapp: not sent — whatsapp provider not configured/i)).toBeInTheDocument());
  });

  it('renders a sent result as delivered', async () => {
    state.invokeResult = {
      ok: true,
      status: 'sent',
      results: [{ channel: 'whatsapp', ok: true, status: 'sent', reason: null, error: null }],
    };

    render(<OnboardingMessagingPanel />);
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: 'Zanzibar Coffee' } });
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '+255700000001' } });
    fireEvent.click(screen.getByRole('button', { name: /send whatsapp welcome/i }));

    await waitFor(() => expect(screen.getByText(/whatsapp: sent/i)).toBeInTheDocument());
  });

  it('switches to Instagram-only: shows the IG preview, sends IG payload, and refuses a cold @handle', async () => {
    const { invokeSendOnboarding } = await import('../lib/onboarding');
    state.invokeResult = {
      ok: false,
      status: 'needs_conversation',
      results: [{
        channel: 'instagram',
        ok: false,
        status: 'needs_conversation',
        reason: 'Instagram DMs are only allowed inside an open conversation. Send to a numeric IG user ID.',
        error: null,
      }],
    };

    render(<OnboardingMessagingPanel />);

    // Select the Instagram channel: the WhatsApp field disappears, the IG
    // preview appears instead of the WhatsApp one.
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(screen.queryByLabelText('WhatsApp number')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Instagram recipient')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/just went live on nowopen africa/i)).toBeInTheDocument());
    expect(screen.queryByText(/welcome to nowopen africa/i)).not.toBeInTheDocument();

    // A bare @handle is a cold outreach: the server's instagramGate refuses
    // it (needs_conversation — Meta only allows DMs inside an open
    // conversation) and the screen repeats that refusal verbatim.
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: "Ada's Kitchen" } });
    fireEvent.change(screen.getByLabelText('Instagram recipient'), { target: { value: '@ada.kitchen' } });

    fireEvent.click(screen.getByRole('button', { name: /send instagram welcome/i }));

    await waitFor(() => {
      const calls = (
        invokeSendOnboarding as ReturnType<typeof vi.fn>
      ).mock.calls;
      const manualCall = [...calls].reverse().find((c) => c[0]?.mode === 'manual');
      expect(manualCall).toBeTruthy();
      if (!manualCall) throw new Error('No manual send was dispatched.');
      expect(manualCall[0]).toMatchObject({
        mode: 'manual',
        channels: ['instagram'],
        businessName: "Ada's Kitchen",
        handle: '@ada.kitchen',
        phone: null,
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/instagram: not sent — instagram dms are only allowed/i)).toBeInTheDocument());
    expect(screen.getByText(/supply the recipient's instagram user id/i)).toBeInTheDocument();
  });

  it('sends both channels in one payload and reports each verdict honestly', async () => {
    const { invokeSendOnboarding } = await import('../lib/onboarding');
    state.invokeResult = {
      ok: false,
      status: 'whatsapp:needs_provider, instagram:needs_conversation',
      results: [
        { channel: 'whatsapp', ok: false, status: 'needs_provider', reason: 'WhatsApp provider not configured (WHATSAPP_TOKEN/WHATSAPP_PHONE_ID).', error: null },
        { channel: 'instagram', ok: false, status: 'needs_conversation', reason: 'Instagram DMs are only allowed inside an open conversation.', error: null },
      ],
    };

    render(<OnboardingMessagingPanel />);
    /*
     * Labelled "WA + IG" since email joined the toggle: with four options
     * "Both" no longer says both of WHAT.
     */
    fireEvent.click(screen.getByRole('button', { name: 'WA + IG' }));
    fireEvent.change(screen.getByLabelText('Business name'), { target: { value: "Ada's Kitchen" } });
    fireEvent.change(screen.getByLabelText('WhatsApp number'), { target: { value: '0803 000 0001' } });
    fireEvent.change(screen.getByLabelText('Instagram recipient'), { target: { value: '17841400000000000' } });
    fireEvent.click(screen.getByRole('button', { name: /send whatsapp \+ instagram welcome/i }));

    await waitFor(() => {
      const calls = (
        invokeSendOnboarding as ReturnType<typeof vi.fn>
      ).mock.calls;
      const manualCall = [...calls].reverse().find((c) => c[0]?.mode === 'manual');
      expect(manualCall).toBeTruthy();
      if (!manualCall) throw new Error('No manual send was dispatched.');
      expect(manualCall[0]).toMatchObject({
        mode: 'manual',
        channels: ['whatsapp', 'instagram'],
        phone: '0803 000 0001',
        handle: '17841400000000000',
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/whatsapp: not sent/i)).toBeInTheDocument());
    expect(screen.getByText(/instagram: not sent/i)).toBeInTheDocument();
  });

  it('surfaces a failed ledger read instead of rendering an empty one', async () => {
    state.listError = { message: 'permission denied for function onboarding_messages_list' };

    render(<OnboardingMessagingPanel />);
    await waitFor(() =>
      expect(screen.getByText(/could not read the onboarding ledger/i)).toBeInTheDocument());
  });

  it('shows recent rows in both ledgers, and requeues a terminal one', async () => {
    const { supabase } = await import('../lib/supabase');
    state.autoRows = [autoRow({ status: 'failed', reason: 'temporary provider error' })];
    state.manualRows = [manualRow()];

    render(<OnboardingMessagingPanel />);
    await waitFor(() => expect(screen.getByText("Ada's Kitchen")).toBeInTheDocument());

    // Terminal non-sent automatic rows get a requeue control.
    const requeue = screen.getByRole('button', { name: /requeue/i });
    fireEvent.click(requeue);

    await waitFor(() => {
      expect(
        (supabase.rpc as ReturnType<typeof vi.fn>).mock.calls.some(
          (c) => c[0] === 'onboarding_messages_requeue'),
      ).toBe(true);
    });
  });

  it('renders an Instagram manual-send row with its @contact in the ledger', async () => {
    state.manualRows = [manualRow({ channel: 'instagram', phone: null, handle: 'ada.kitchen', status: 'needs_conversation', reason: 'Instagram DMs are only allowed inside an open conversation.' })];

    render(<OnboardingMessagingPanel />);
    await waitFor(() => expect(screen.getByText(/needs_conversation/i)).toBeInTheDocument());
    expect(screen.getByText('@ada.kitchen')).toBeInTheDocument();
    expect(screen.getByText('IG')).toBeInTheDocument();
  });
});
describe('a pending template is not a configuration problem', () => {
  it('does not tell an operator to configure something Meta controls', () => {
    /*
     * The retry note read "it will go out automatically once the WhatsApp
     * provider template is configured". For the commonest needs_template row
     * that is false — the template IS submitted and Meta has not approved it.
     * The sentence invited the one action that breaks things: naming a
     * pending template, which sends nothing and converts honest refusals into
     * real send failures.
     */
    const src = readFileSync('src/components/admin/OnboardingMessagingPanel.tsx', 'utf8');
    expect(src).toMatch(/once Meta approves the template/);
    expect(src).not.toMatch(/provider\{r\.status === 'needs_template' \? ' template' : ''\} is configured/);
  });
});
