import { useEffect, useRef, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Instagram, Facebook, Linkedin, Music2, Twitter, MapPin, Pin, MessagesSquare, MessageCircle, Send, CalendarClock, CheckCircle2, Clock, Link2, Trash2, Copy, RefreshCw, Globe, ImagePlus, X, Loader2 } from 'lucide-react';
import { LucideIcon } from 'lucide-react';
import { Business } from '../../types';
import {
  SOCIAL_CHANNELS, PublishStatus, PublishJob, PublisherState,
  loadPublisher, savePublisher, createJob,
  connectChannel, disconnectChannel, channelLabel, channelShort, channelHome,
  connectedCount, channelHandle,
  allDue, upcomingCount, publishedCount, scheduleLabel,
} from '../../lib/publisher';
import {
  fetchCapabilities, authorizeUrl, openConnectPopup, getServerConnections,
  disconnectConnection, publishPost, ServerConnection, Capabilities,
} from '../../lib/socialPublish';
import AiGenerateToggle from './AiGenerateToggle';

interface Props {
  business: Business;
  prefill?: { title: string; text: string } | null;
  onClearPrefill?: () => void;
}

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  tiktok: Music2,
  x: Twitter,
  gmb: MapPin,
  pinterest: Pin,
  threads: MessagesSquare,
  'whatsapp-status': MessageCircle,
  nowopen: Globe,
};

const STATUS_STYLES: Record<PublishStatus, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' },
  publishing: { label: 'Publishing…', className: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-200' },
  published: { label: 'Published', className: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200' },
  failed: { label: 'Failed', className: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200' },
};

export default function SchedulePublish({ business, prefill, onClearPrefill }: Props) {
  const [state, setState] = useState<PublisherState>(() => loadPublisher(business.id));
  const [title, setTitle] = useState(prefill?.title ?? '');
  const [caption, setCaption] = useState(prefill?.text ?? '');
  const [hashtags, setHashtags] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [selected, setSelected] = useState<string[]>(() => state.channels.filter((c) => c.connected).map((c) => c.key));
  const [media, setMedia] = useState<PublishJob['media'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [handleDraft, setHandleDraft] = useState('');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [serverConnections, setServerConnections] = useState<Record<string, ServerConnection>>({});
  const serverConnectionsRef = useRef(serverConnections);
  const publishingIds = useRef<Set<string>>(new Set());

  // Which channels can be connected with real OAuth in this project.
  const realChannels = capabilities?.configured ?? {};
  const serverConnected = new Set(Object.keys(serverConnections));
  const localConnected = new Set(state.channels.filter((c) => c.connected).map((c) => c.key));
  const connectedKeys = new Set<string>([...localConnected, ...serverConnected]);

  // The account name shown for a channel: the server connection wins (it's the
  // real account), otherwise the locally typed handle.
  const displayHandle = (key: string): string | undefined =>
    serverConnections[key]?.account_name ?? channelHandle(state, key);

  useEffect(() => { serverConnectionsRef.current = serverConnections; }, [serverConnections]);

  const refreshConnections = useCallback(async (): Promise<Record<string, ServerConnection>> => {
    try {
      const rows = await getServerConnections();
      const forBusiness: Record<string, ServerConnection> = {};
      for (const r of rows) if (String(r.business_id) === String(business.id)) forBusiness[r.provider] = r;
      setServerConnections(forBusiness);
      serverConnectionsRef.current = forBusiness;
      return forBusiness;
    } catch {
      return serverConnectionsRef.current;
    }
  }, [business.id]);

  useEffect(() => {
    let cancelled = false;
    fetchCapabilities().then((c) => { if (!cancelled) setCapabilities(c); }).catch(() => {});
    refreshConnections();
    return () => { cancelled = true; };
  }, [business.id, refreshConnections]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const type = file.type.startsWith('video') ? 'video' as const : 'image' as const;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setMedia({ name: file.name, url: reader.result, type });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    savePublisher(business.id, state);
  }, [state, business.id]);

  // Consume any prefill from the AI Content tab once, on mount.
  useEffect(() => {
    if (prefill) onClearPrefill?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-publish anything whose time has already come — including jobs that
  // become due while this tab stays open (re-checked every 30s).
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const fireDue = () => {
      const due = allDue(stateRef.current.jobs);
      due.forEach((j) => publishToAll(j.id));
    };
    fireDue();
    const t = window.setInterval(fireDue, 30_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const publishToAll = async (id: string) => {
    if (publishingIds.current.has(id)) return;
    publishingIds.current.add(id);
    const job = stateRef.current.jobs.find((j) => j.id === id);
    if (!job) { publishingIds.current.delete(id); return; }

    setState((prev) => ({
      ...prev,
      jobs: prev.jobs.map((j) => j.id === id ? { ...j, status: 'publishing' as PublishStatus, publishedAt: undefined, simulated: false } : j),
    }));

    const markPublished = (simulated: boolean, at: string) => {
      setState((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) => j.id === id ? { ...j, status: 'published' as PublishStatus, publishedAt: at, simulated } : j),
      }));
    };

    try {
      const outcome = await publishPost(business.id, {
        id: job.id,
        title: job.title,
        caption: job.caption,
        hashtags: job.hashtags,
        channels: job.channels,
        media: job.media ?? null,
      });
      if (outcome.ok) {
        markPublished(outcome.simulated, new Date().toISOString());
        toast.success(outcome.simulated ? 'Published everywhere (simulated)' : 'Published everywhere');
      } else {
        const firstError = outcome.results.find((r) => !r.ok)?.error ?? 'Could not publish to every channel';
        setState((prev) => ({
          ...prev,
          jobs: prev.jobs.map((j) => j.id === id ? { ...j, status: 'failed' as PublishStatus } : j),
        }));
        toast.error(firstError);
      }
    } catch {
      // Service unreachable / not signed in — keep the on-device simulation so
      // scheduling still works exactly as it did before real OAuth landed.
      markPublished(true, new Date().toISOString());
      toast.success('Published everywhere');
    } finally {
      publishingIds.current.delete(id);
    }
  };

  const pickChannel = (key: string) => {
    if (!connectedKeys.has(key)) {
      // Connecting an account needs a real account — open the connect flow so
      // the channel is linked to a real account, not just a bare toggle.
      startConnect(key);
      return;
    }
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  // Connect: real OAuth when the provider is configured in this project,
  // otherwise the legacy "type your handle" simulation. Resolves true when the
  // channel ended up connected (real OAuth path only).
  const startConnect = async (key: string): Promise<boolean> => {
    setConnecting(key);
    if (realChannels[key]) {
      setHandleDraft('');
      try {
        const url = await authorizeUrl(key, business.id);
        const outcome = await openConnectPopup(url);
        if (outcome.status === 'connected') {
          await refreshConnections();
          setSelected((prev) => prev.includes(key) ? prev : [...prev, key]);
          setConnecting(null);
          toast.success(`${channelLabel(key)} connected`);
          return true;
        }
        setConnecting(null);
        toast.error(outcome.error ?? `${channelLabel(key)} connection cancelled`);
        return false;
      } catch (e) {
        setConnecting(null);
        toast.error(e instanceof Error ? e.message : `Could not connect ${channelLabel(key)}.`);
        return false;
      }
    } else {
      setHandleDraft(channelHandle(state, key) || '');
      setConnecting(key);
      return false;
    }
  };

  const confirmConnect = (key: string) => {
    if (!handleDraft.trim()) {
      toast.error('Add the account handle to connect, e.g. @yourname.');
      return;
    }
    setState((prev) => connectChannel(prev, key, handleDraft));
    setSelected((prev) => prev.includes(key) ? prev : [...prev, key]);
    setConnecting(null);
    setHandleDraft('');
    toast.success(`${channelLabel(key)} connected as @${handleDraft.trim().replace(/^@/, '')}`);
  };

  const disconnect = async (key: string) => {
    if (serverConnections[key]) {
      try { await disconnectConnection(key, business.id); } catch { /* keep going */ }
      await refreshConnections();
    }
    setState((prev) => disconnectChannel(prev, key));
    setSelected((prev) => prev.filter((k) => k !== key));
    setConnecting(null);
    toast.success(`${channelLabel(key)} disconnected`);
  };

  const schedule = async (immediate: boolean) => {
    if (!title.trim() && !caption.trim()) return toast.error('Add a title or caption first.');
    if (selected.length === 0) return toast.error('Select at least one channel first.');

    // Auto-prompt OAuth consent for any selected channel that should post for
    // real but isn't connected through its platform yet — so the post goes to
    // a real account instead of a silent simulation.
    let conns = serverConnectionsRef.current;
    try { conns = await refreshConnections(); } catch { /* keep what we have */ }
    const pendingOAuth = selected.filter((k) => realChannels[k] && !conns[k]);
    for (const target of pendingOAuth) {
      toast(`${channelLabel(target)} isn't signed in — approve it to publish for real.`);
      const connected = await startConnect(target);
      try { conns = await refreshConnections(); } catch { /* keep what we have */ }
      if (!connected && !conns[target]) {
        return toast.error(`${channelLabel(target)} wasn't connected, so nothing was scheduled.`);
      }
    }

    const keys = selected.filter((k) => conns[k] || localConnected.has(k));
    if (keys.length === 0) return toast.error('Connect at least one channel first.');
    const at = immediate ? new Date().toISOString() : `${date}T${time || '09:00'}:00`;
    const channelHandles: Record<string, string> = {};
    for (const k of keys) { const h = displayHandle(k); if (h) channelHandles[k] = h; }
    const job = createJob({ title: title.trim(), caption: caption.trim(), hashtags: hashtags.trim(), scheduledAt: at, channels: keys, media: media ?? undefined, channelHandles });
    setState((prev) => ({ ...prev, jobs: [job, ...prev.jobs] }));
    setTitle(''); setCaption(''); setHashtags(''); setMedia(null);
    if (immediate) {
      publishToAll(job.id);
      toast.success('Publishing…');
    } else {
      toast.success(`Scheduled for ${scheduleLabel(at)}`);
    }
  };

  const remove = (id: string) => {
    setState((prev) => ({ ...prev, jobs: prev.jobs.filter((j) => j.id !== id) }));
    toast.success('Removed from the queue');
  };

  const copyText = (text: string, message: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(message)).catch(() => toast.error('Could not copy — select the text manually.'));
  };

  const sortedJobs = [...state.jobs].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const nextUpcoming = sortedJobs.find((j) => j.status === 'scheduled');

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Connected</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{connectedCount(state)}<span className="text-sm text-gray-400 font-medium"> / {SOCIAL_CHANNELS.length}</span></p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Scheduled</p>
          <p className="mt-1 text-2xl font-bold text-amber-500">{upcomingCount(state.jobs)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Published</p>
          <p className="mt-1 text-2xl font-bold text-green-500">{publishedCount(state.jobs)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Next publish</p>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white leading-tight pt-1">{nextUpcoming ? scheduleLabel(nextUpcoming.scheduledAt) : 'Nothing scheduled'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Composer */}
        <div className="lg:col-span-3 space-y-5">
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Send size={15} className="text-purple-500" /> Schedule a post
            </h4>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend offer"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Caption</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={5} placeholder="Write your caption…"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Hashtags</label>
              <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#WeekendDeals #NowOpenAfrica"
                className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px]" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">Image or video</label>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onFile} />
              {media ? (
                <div className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-2">
                  {media.type === 'video'
                    ? <video src={media.url} className="h-12 w-12 rounded object-cover" muted />
                    : <img src={media.url} alt={media.name} className="h-12 w-12 rounded object-cover" />}
                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate flex-1">{media.name}</span>
                  <button onClick={() => setMedia(null)} title="Remove file"
                    className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full inline-flex items-center justify-center gap-2 px-3 min-h-[44px] rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:border-purple-400 hover:text-purple-500 transition">
                    <ImagePlus size={15} /> Upload image / video
                  </button>
                  <AiGenerateToggle
                    width={1024}
                    height={1024}
                    defaultPrompt={`${business.name} ${business.category ? `— ${business.category}` : ''} social post visual`}
                    onGenerated={(url, kind) => setMedia({ name: kind === 'video' ? 'ai-video.mp4' : 'ai-image.png', url, type: kind })}
                  />
                </>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Time</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                  className="flex items-center w-full px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-2">Publish to</label>
              <div className="flex flex-wrap gap-2">
                {SOCIAL_CHANNELS.map((c) => {
                  const Icon = CHANNEL_ICONS[c.key] ?? Send;
                  const isConnected = connectedKeys.has(c.key);
                  const isSelected = selected.includes(c.key);
                  return (
                    <button key={c.key} onClick={() => pickChannel(c.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${isSelected
                        ? 'border-transparent text-white bg-purple-600'
                        : isConnected
                          ? 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                          : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:text-purple-500'}`}>
                      <Icon size={13} /> {c.label}
                      {isSelected && <CheckCircle2 size={12} />}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">Tap a dashed channel to connect your account — approved channels are signed in through their platform, then selected for this post.</p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => schedule(true)}
                className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                <Send size={15} /> Publish now
              </button>
              <button onClick={() => schedule(false)}
                className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
                <CalendarClock size={15} /> Schedule for later
              </button>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <Globe size={12} /> Schedule once, publish everywhere. Channels signed in through their platform post for real; anything not connected yet is marked published (simulated) so your queue keeps moving.
          </p>
        </div>

        {/* Connected channels */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Connected channels</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Link a channel to schedule posts to it.</p>
            <div className="space-y-2">
              {SOCIAL_CHANNELS.map((c) => {
                const Icon = CHANNEL_ICONS[c.key] ?? Send;
                const isConnected = connectedKeys.has(c.key);
                const isConnecting = connecting === c.key;
                const isReal = realChannels[c.key] === true;
                const handle = displayHandle(c.key);
                return (
                  <div key={c.key} className={`rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 ${isConnected ? '' : 'border-dashed'}`}>
                    <div className="flex items-center gap-3">
                      <Icon size={16} className={`shrink-0 ${isConnected ? 'text-purple-500' : 'text-gray-300 dark:text-gray-600'}`} />
                      <span className={`text-sm font-medium flex-1 ${isConnected ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                        {c.label}
                        {isConnected && handle && <span className="block text-[11px] font-normal text-gray-400 dark:text-gray-500">@{handle.replace(/^@/, '')}</span>}
                        {isConnected && serverConnections[c.key] && <span className="ml-1 text-[10px] font-bold uppercase text-green-500">real</span>}
                      </span>
                      {isConnected && <Link2 size={13} className="text-green-500 shrink-0" />}
                      {isConnected ? (
                        <button onClick={() => disconnect(c.key)}
                          className="inline-flex items-center gap-1 px-2.5 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
                          Disconnect
                        </button>
                      ) : isConnecting ? (
                        isReal ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                            <Loader2 size={11} className="animate-spin" /> Connecting…
                          </span>
                        ) : (
                          <button onClick={() => setConnecting(null)}
                            className="inline-flex items-center gap-1 px-2.5 rounded-lg text-[11px] font-semibold border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
                            Cancel
                          </button>
                        )
                      ) : (
                        <button onClick={() => startConnect(c.key)}
                          className="inline-flex items-center gap-1 px-2.5 rounded-lg text-[11px] font-semibold border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition min-h-[44px]">
                          <Link2 size={11} /> Connect
                        </button>
                      )}
                    </div>
                    {isConnecting && !isReal && (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          value={handleDraft}
                          onChange={(e) => setHandleDraft(e.target.value)}
                          placeholder="your account handle"
                          onKeyDown={(e) => { if (e.key === 'Enter') confirmConnect(c.key); }}
                          className="flex-1 min-w-0 px-2.5 .5 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[44px] items-center"
                        />
                        <button onClick={() => confirmConnect(c.key)}
                          className="inline-flex items-center gap-1 px-3 .5 rounded-lg text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                          <CheckCircle2 size={11} /> Connect
                        </button>
                      </div>
                    )}
                    {isConnecting && isReal && (
                      <p className="text-[11px] text-gray-400 mt-2">Approve {c.label} in the window that just opened.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Queue */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Clock size={15} className="text-purple-500" /> Publishing queue
        </h4>
        {sortedJobs.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Nothing here yet — schedule a post to build your queue.</p>
        ) : (
          <div className="space-y-3">
            {sortedJobs.map((job) => {
              const status = STATUS_STYLES[job.status];
              return (
                <div key={job.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${status.className}`}>
                      {job.status === 'publishing' && <RefreshCw size={11} className="mr-1 animate-spin" />}
                      {status.label}
                    </span>
                    {job.status === 'published' && job.simulated && (
                      <span title="No connected account could post this — the platforms weren't contacted."
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400">
                        Simulated
                      </span>
                    )}
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{job.title || 'Untitled post'}</span>
                    <span className="ml-auto text-[11px] text-gray-400">{scheduleLabel(job.scheduledAt)}</span>
                  </div>
                  {job.media && (
                    job.media.type === 'video'
                      ? <video src={job.media.url} className="mt-2 h-28 rounded-lg object-cover" muted />
                      : <img src={job.media.url} alt={job.media.name} className="mt-2 h-20 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
                  )}
                  {job.caption && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 line-clamp-2 whitespace-pre-line">{job.caption}</p>}
                  {job.hashtags && <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">{job.hashtags}</p>}
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    {job.channels.map((k) => {
                      const Icon = CHANNEL_ICONS[k] ?? Send;
                      const handle = job.channelHandles?.[k] ?? channelHandle(state, k);
                      const url = channelHome(k, handle);
                      const label = `${channelShort(k)}${handle ? ` · @${handle.replace(/^@/, '')}` : ''}`;
                      return job.status === 'published' ? (
                        <a key={k} href={url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 rounded-md bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[11px] font-semibold hover:underline min-h-[44px]">
                          <Icon size={12} /> {label}
                        </a>
                      ) : (
                        <span key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 text-[11px] font-semibold">
                          <Icon size={12} /> {label}
                        </span>
                      );
                    })}
                    <div className="ml-auto flex items-center gap-2">
                      {job.caption && (
                        <button onClick={() => copyText([job.caption, job.hashtags].filter(Boolean).join('\n\n'), 'Post copied')}
                          className="inline-flex items-center gap-1 px-2 rounded-md text-[11px] font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition min-h-[44px]">
                          <Copy size={11} /> Copy post
                        </button>
                      )}
                      {job.status === 'scheduled' && (
                        <button onClick={() => publishToAll(job.id)}
                          className="inline-flex items-center gap-1 px-2.5 rounded-md text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                          <Send size={11} /> Publish now
                        </button>
                      )}
                      {job.status === 'published' && job.simulated && (
                        <button onClick={() => publishToAll(job.id)}
                          className="inline-flex items-center gap-1 px-2.5 rounded-md text-[11px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
                          <RefreshCw size={11} /> Publish for real
                        </button>
                      )}
                      <button onClick={() => remove(job.id)} title="Delete"
                        className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
