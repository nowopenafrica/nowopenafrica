// Client for the social publishing edge functions.
//
// The browser never handles provider OAuth tokens — it triggers the authorize
// popup, listens for the self-closing callback page, and (for publishing)
// hands the whole job to `social-publish`, which posts for real when a
// connection exists or reports a *simulated* success when nothing is wired up
// yet. Calls use the signed-in user's access token so the functions can
// verify ownership server-side.

import { supabase } from './supabase';

const fnUrl = (name: string) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` };
}

export interface Capabilities {
  configured: Record<string, boolean>;
  supported: string[];
  origin: string;
}

/**
 * What a channel can genuinely do right now.
 *
 *   live    — a provider exists AND this project has its developer app, so the
 *             account is signed in through the platform and posts go out
 *   setup   — a provider exists but no credentials, so it cannot post at all
 *   manual  — no provider; we can keep it on the plan, we cannot post to it
 *   unknown — the service has not answered yet
 *
 * Pure, and exported, because the panel used to derive this inline and got it
 * wrong in both directions: every channel offered the same "Connect" button
 * (so an owner could believe WhatsApp Status posts were going out), and when
 * the capabilities call failed the fallback quietly marked Instagram
 * unpostable too.
 */
export type ChannelMode = 'live' | 'setup' | 'manual' | 'unknown';

export function channelModeFor(key: string, caps: Capabilities | null): ChannelMode {
  if (!caps) return 'unknown';
  if (!caps.supported.includes(key)) return 'manual';
  return caps.configured[key] === true ? 'live' : 'setup';
}

/** Which channels have developer credentials wired up in this project. */
export async function fetchCapabilities(): Promise<Capabilities> {
  const res = await fetch(`${fnUrl('social-auth')}?action=capabilities`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Could not reach the social publishing service.');
  return res.json();
}

/** Ask the server to start an OAuth flow; returns the platform consent URL. */
export async function authorizeUrl(provider: string, businessId: string): Promise<string> {
  const res = await fetch(
    `${fnUrl('social-auth')}?action=authorize&provider=${encodeURIComponent(provider)}&business_id=${encodeURIComponent(businessId)}`,
    { headers: await authHeaders() }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(body.error ?? 'Could not start the connection.');
  return body.url as string;
}

export interface ConnectOutcome {
  status: 'connected' | 'error' | 'closed';
  provider?: string;
  error?: string;
}

/** Open the consent popup and resolve once the callback page reports back. */
export function openConnectPopup(url: string): Promise<ConnectOutcome> {
  return new Promise((resolve) => {
    const win = window.open(url, '_blank', 'width=560,height=720');
    let done = false;
    const finish = (outcome: ConnectOutcome) => {
      if (!done) { done = true; resolve(outcome); }
    };
    if (!win) {
      finish({ status: 'closed', error: 'Pop-ups are blocked — allow pop-ups for this site and try again.' });
      return;
    }
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; status?: string; provider?: string; error?: string };
      if (!data || data.type !== 'nowopen-social-connected') return;
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      finish(data.status === 'connected'
        ? { status: 'connected', provider: data.provider }
        : { status: 'error', provider: data.provider, error: data.error });
    };
    const timer = window.setInterval(() => {
      if (win.closed) {
        window.clearInterval(timer);
        window.removeEventListener('message', onMessage);
        finish({ status: 'closed', error: 'The connection window closed before it finished.' });
      }
    }, 500);
    window.addEventListener('message', onMessage);
  });
}

export interface ServerConnection {
  business_id: string;
  provider: string;
  account_id: string;
  account_name: string | null;
  connected_at: string;
}

/** The owner's real OAuth connections (metadata only — never tokens). */
export async function getServerConnections(): Promise<ServerConnection[]> {
  const { data, error } = await supabase.rpc('get_my_social_connections');
  if (error) throw new Error('Could not load your connections.');
  return (data ?? []) as ServerConnection[];
}

export async function disconnectConnection(provider: string, businessId: string): Promise<void> {
  const res = await fetch(
    `${fnUrl('social-auth')}?action=disconnect&provider=${encodeURIComponent(provider)}&business_id=${encodeURIComponent(businessId)}`,
    { method: 'POST', headers: await authHeaders() }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error ?? 'Could not disconnect.');
}

export interface PublishMedia {
  name: string;
  url: string;
  type: 'image' | 'video';
}

export interface PublishJobPayload {
  id: string;
  title?: string;
  caption?: string;
  hashtags?: string;
  channels: string[];
  media?: PublishMedia | null;
}

export interface PublishResult {
  channel: string;
  ok: boolean;
  simulated?: boolean;
  externalId?: string;
  message?: string;
  error?: string;
}

export interface PublishOutcome {
  results: PublishResult[];
  ok: boolean;
  anyReal: boolean;
  simulated: boolean;
}

/** Post a scheduled job to every channel (real where connected, simulated otherwise). */
export async function publishPost(businessId: string, job: PublishJobPayload): Promise<PublishOutcome> {
  const res = await fetch(fnUrl('social-publish'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ business_id: businessId, job }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Could not publish.');
  return body as PublishOutcome;
}
