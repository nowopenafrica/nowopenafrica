// NowOpen Studio — Schedule & Publish.
//
// A single publishing queue that fans out to every connected channel, so one
// post can be scheduled once and "published everywhere". Connections and the
// publish queue live on-device (like the rest of the Studio), and publishing
// simulates delivery to each platform with a one-tap destination link.

export interface SocialChannel {
  key: string;
  label: string;
  short: string;
}

export const SOCIAL_CHANNELS: SocialChannel[] = [
  { key: 'instagram', label: 'Instagram', short: 'IG' },
  { key: 'facebook', label: 'Facebook', short: 'FB' },
  { key: 'linkedin', label: 'LinkedIn', short: 'IN' },
  { key: 'tiktok', label: 'TikTok', short: 'TT' },
  { key: 'x', label: 'X', short: 'X' },
  { key: 'whatsapp-status', label: 'WhatsApp Status', short: 'WA' },
  { key: 'nowopen', label: 'NowOpen Profile', short: 'NO' },
  { key: 'gmb', label: 'Google Business Profile', short: 'GMB' },
  { key: 'pinterest', label: 'Pinterest', short: 'PIN' },
  { key: 'threads', label: 'Threads', short: 'TH' },
];

export type PublishStatus = 'scheduled' | 'publishing' | 'published' | 'failed';

export interface PublishMedia {
  name: string;
  url: string; // data URL so the attached file survives a reload
  type: 'image' | 'video';
}

export interface PublishJob {
  id: string;
  title: string;
  caption: string;
  hashtags: string;
  scheduledAt: string; // ISO datetime
  channels: string[]; // channel keys
  status: PublishStatus;
  createdAt: string;
  publishedAt?: string;
  media?: PublishMedia;
  // Account handle snapshot per channel at schedule time, so a published job
  // keeps linking to the account it was actually published to even if the
  // owner reconnects a different handle later.
  channelHandles?: Record<string, string>;
  // True when delivery was simulated (provider not wired up / not connected)
  // rather than actually posted — lets the queue offer a "publish for real".
  simulated?: boolean;
}

export interface ChannelConnection {
  key: string;
  connected: boolean;
  handle?: string; // account handle/username the owner connected, e.g. '@cafe'
}

export interface PublisherState {
  channels: ChannelConnection[];
  jobs: PublishJob[];
}

function defaultState(): PublisherState {
  return {
    channels: SOCIAL_CHANNELS.map((c) => ({ key: c.key, connected: false })),
    jobs: [],
  };
}

export function publisherKey(businessId: string): string {
  return `nowopen_publisher_${businessId}`;
}

export function loadPublisher(businessId: string): PublisherState {
  try {
    const raw = localStorage.getItem(publisherKey(businessId));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PublisherState>;
    const parsedChannels = Array.isArray(parsed.channels) ? parsed.channels : [];
    return {
      channels: SOCIAL_CHANNELS.map((c) => {
        const saved = parsedChannels.find((ch) => ch.key === c.key) as ChannelConnection | undefined;
        return {
          key: c.key,
          connected: !!saved?.connected,
          handle: typeof saved?.handle === 'string' ? saved.handle : undefined,
        };
      }),
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
    };
  } catch {
    return defaultState();
  }
}

export function savePublisher(businessId: string, state: PublisherState): void {
  try { localStorage.setItem(publisherKey(businessId), JSON.stringify(state)); } catch { /* quota / private mode */ }
}

export function channelLabel(key: string): string {
  return SOCIAL_CHANNELS.find((c) => c.key === key)?.label || key;
}

export function channelShort(key: string): string {
  return SOCIAL_CHANNELS.find((c) => c.key === key)?.short || key;
}

export function connectedCount(state: PublisherState): number {
  return state.channels.filter((c) => c.connected).length;
}

// The destination page a published post "lands on" per channel. When the owner
// connected an account handle, the link points at that account; otherwise it
// falls back to the platform's well-known home URL.
export function channelHome(key: string, handle?: string): string {
  const clean = handle?.replace(/^@/, '').trim();
  const homes: Record<string, string> = {
    instagram: 'https://www.instagram.com/',
    facebook: 'https://www.facebook.com/',
    linkedin: 'https://www.linkedin.com/feed/',
    tiktok: 'https://www.tiktok.com/',
    x: 'https://x.com/home',
    gmb: 'https://www.google.com/business/',
    'whatsapp-status': 'https://web.whatsapp.com/',
    nowopen: 'https://www.nowopen.africa/',
    pinterest: 'https://www.pinterest.com/',
    threads: 'https://www.threads.net/',
  };
  if (clean) {
    const accounts: Record<string, string> = {
      instagram: `https://www.instagram.com/${clean}/`,
      facebook: `https://www.facebook.com/${clean}`,
      linkedin: `https://www.linkedin.com/in/${clean}/`,
      tiktok: `https://www.tiktok.com/@${clean}`,
      x: `https://x.com/${clean}`,
      'whatsapp-status': `https://wa.me/${clean.replace(/\D/g, '')}`,
      nowopen: `https://www.nowopen.africa/${clean}`,
      pinterest: `https://www.pinterest.com/${clean}/`,
      threads: `https://www.threads.net/@${clean}`,
    };
    if (accounts[key]) return accounts[key];
  }
  return homes[key] || 'https://www.google.com/';
}

// Every scheduled job whose time has already come, earliest first — the set
// the queue should be publishing right now.
export function allDue(jobs: PublishJob[], now = new Date()): PublishJob[] {
  return jobs
    .filter((j) => j.status === 'scheduled' && new Date(j.scheduledAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
}

// The earliest scheduled job whose time has passed — the next one the queue
// should be publishing right now.
export function nextDue(jobs: PublishJob[], now = new Date()): PublishJob | null {
  return allDue(jobs, now)[0] || null;
}

export function upcomingCount(jobs: PublishJob[]): number {
  return jobs.filter((j) => j.status === 'scheduled' || j.status === 'publishing').length;
}

export function publishedCount(jobs: PublishJob[]): number {
  return jobs.filter((j) => j.status === 'published').length;
}

export function scheduleLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function createJob(draft: { title: string; caption: string; hashtags: string; scheduledAt: string; channels: string[]; media?: PublishMedia; channelHandles?: Record<string, string> }): PublishJob {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...draft,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  };
}

export function toggleChannel(state: PublisherState, key: string): PublisherState {
  return { ...state, channels: state.channels.map((c) => c.key === key ? { ...c, connected: !c.connected } : c) };
}

// Connect a channel with the account handle the owner supplied. The handle is
// normalised (leading @ stripped, case preserved) and used for post links.
export function connectChannel(state: PublisherState, key: string, handle?: string): PublisherState {
  const clean = handle?.trim().replace(/^@/, '');
  return {
    ...state,
    channels: state.channels.map((c) => c.key === key ? { ...c, connected: true, handle: clean || undefined } : c),
  };
}

export function disconnectChannel(state: PublisherState, key: string): PublisherState {
  return { ...state, channels: state.channels.map((c) => c.key === key ? { ...c, connected: false, handle: undefined } : c) };
}

// The handle stored for a channel, if it is connected.
export function channelHandle(state: PublisherState, key: string): string | undefined {
  return state.channels.find((c) => c.key === key)?.connected ? state.channels.find((c) => c.key === key)?.handle : undefined;
}
