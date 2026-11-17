import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Link2, Loader2, Unlink } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { formatLagos } from '../../lib/brandSocial';
import { brandAuthorizeUrl, fetchCapabilities, openConnectPopup, type BrandCapabilities } from '../../lib/socialPublish';
import ConfirmDialog from '../ConfirmDialog';

/**
 * NowOpen Africa's own X, LinkedIn, TikTok and YouTube accounts.
 *
 * Connect signs the admin in on the platform through social-auth's brand mode;
 * tokens are stored encrypted on the server and never reach this screen. A
 * channel publishes directly only when its switch is on, and the database
 * refuses that switch without a live connection.
 */

interface Conn { provider: string; account_name: string | null; token_expires_at: string | null; connected_at: string; refreshed_at: string | null; last_error: string | null; has_refresh: boolean }
interface Channel { id: string; label: string; publish_route?: string; external_account_id?: string | null }

const PROVIDERS: { id: string; label: string; channels: string[]; note: string }[] = [
  { id: 'x', label: 'X', channels: ['x'], note: 'Text and image posts. X charges per post on its pay-per-use plan.' },
  { id: 'linkedin', label: 'LinkedIn', channels: ['linkedin_profile', 'linkedin_company'], note: 'Text and image posts. The company page also needs LinkedIn’s Community Management approval.' },
  { id: 'tiktok', label: 'TikTok', channels: ['tiktok'], note: 'Videos. Until TikTok audits the app, posts are visible only to the account.' },
  { id: 'youtube', label: 'YouTube', channels: ['youtube'], note: 'Shorts and videos. Until Google verifies the app, uploads stay private.' },
];

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-3 min-h-[44px] text-sm font-semibold transition disabled:opacity-50';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-700`;
const btnQuiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700`;
const input = 'rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white min-h-[44px]';

export default function BrandConnections({ channels, onChanged }: { channels: Channel[]; onChanged: () => void }) {
  const [caps, setCaps] = useState<BrandCapabilities | null>(null);
  const [conns, setConns] = useState<Conn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [orgId, setOrgId] = useState(channels.find((c) => c.id === 'linkedin_company')?.external_account_id ?? '');

  const load = useCallback(async () => {
    try { setCaps((await fetchCapabilities()).brand ?? null); } catch { setCaps(null); }
    const { data, error } = await supabase.rpc('brand_social_connection_status');
    if (!error) setConns((data ?? []) as Conn[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = async (provider: string) => {
    setBusy(provider);
    try {
      const url = await brandAuthorizeUrl(provider);
      const outcome = await openConnectPopup(url);
      if (outcome.status === 'connected') toast.success('Connected.');
      else toast.error(outcome.error ?? 'Not connected.');
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
    void load(); onChanged();
  };

  const disconnect = async (provider: string) => {
    setBusy(provider);
    const { error } = await supabase.rpc('brand_social_disconnect', { p_provider: provider });
    setBusy(null); setConfirmOff(null);
    if (error) toast.error(error.message); else toast.success('Disconnected. Its channels went back to Zoho.');
    void load(); onChanged();
  };

  const setRoute = async (channelId: string, direct: boolean) => {
    setBusy(channelId);
    const patch: Record<string, unknown> = { publish_route: direct ? 'direct' : 'zoho' };
    if (channelId === 'linkedin_company') patch.external_account_id = orgId.trim() || null;
    const { error } = await supabase.from('brand_social_channels').update(patch).eq('id', channelId);
    setBusy(null);
    if (error) toast.error(error.message); else toast.success(direct ? 'Publishes directly from now on.' : 'Back to Zoho.');
    onChanged();
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><Link2 size={18} /> Connected accounts</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 max-w-2xl">
          Connect NowOpen Africa’s own accounts to publish approved posts to them directly. Each needs its developer app set up first; until then the channel keeps going through Zoho.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {PROVIDERS.map((p) => {
          const conn = conns.find((c) => c.provider === p.id);
          const ready = caps?.configured?.[p.id] === true;
          return (
            <div key={p.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 dark:text-white">{p.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conn ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : ready ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                  {conn ? 'Connected' : ready ? 'Ready to connect' : 'App not set up'}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{p.note}</p>
              {conn && (
                <p className="text-sm text-gray-800 dark:text-gray-100">
                  {conn.account_name ?? 'Account'} · connected {formatLagos(conn.connected_at)}
                  {!conn.has_refresh && conn.token_expires_at && <span className="block text-xs text-amber-700 dark:text-amber-300">No refresh token: reconnect before {formatLagos(conn.token_expires_at)}.</span>}
                </p>
              )}
              {conn?.last_error && <p className="text-xs text-red-700 dark:text-red-300 flex gap-1"><AlertTriangle size={14} className="flex-none mt-0.5" /> {conn.last_error}</p>}
              {!ready && caps && (
                <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                  <p>Needs the secrets <span className="font-mono">{caps.requiredSecrets?.[p.id]?.join(', ')}</span>, and this callback URL in the app’s settings:</p>
                  <p className="font-mono break-all rounded bg-gray-50 dark:bg-gray-900 p-2">{caps.redirectUris?.[p.id]}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!conn ? (
                  <button type="button" className={btnPrimary} disabled={!ready || busy === p.id} onClick={() => void connect(p.id)}>
                    {busy === p.id ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connect {p.label}
                  </button>
                ) : (
                  <>
                    <button type="button" className={btnQuiet} disabled={busy === p.id} onClick={() => void connect(p.id)}>Reconnect</button>
                    <button type="button" className={btnQuiet} disabled={busy === p.id} onClick={() => setConfirmOff(p.id)}><Unlink size={16} /> Disconnect</button>
                  </>
                )}
              </div>

              {conn && p.channels.map((chId) => {
                const ch = channels.find((c) => c.id === chId);
                if (!ch) return null;
                const direct = ch.publish_route === 'direct';
                return (
                  <div key={chId} className="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-2">
                    {chId === 'linkedin_company' && (
                      <label className="block text-xs text-gray-600 dark:text-gray-300">
                        Company page id (numbers, from the page admin URL)
                        <input className={`${input} mt-1 w-full`} inputMode="numeric" value={orgId ?? ''} disabled={direct}
                          onChange={(e) => setOrgId(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 12345678" />
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white min-h-[44px]">
                      <input type="checkbox" className="h-5 w-5" checked={direct} disabled={busy === chId}
                        onChange={(e) => void setRoute(chId, e.target.checked)} />
                      Publish {ch.label} directly
                    </label>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(confirmOff)}
        title={`Disconnect ${PROVIDERS.find((p) => p.id === confirmOff)?.label ?? ''}?`}
        message="The stored token is deleted and its channels go back to Zoho. Nothing already published is touched."
        confirmLabel="Disconnect"
        busy={busy === confirmOff}
        onConfirm={() => confirmOff && void disconnect(confirmOff)}
        onCancel={() => setConfirmOff(null)}
      />
    </div>
  );
}
