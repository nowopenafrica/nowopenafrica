import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck, Smartphone, Monitor, LogOut, Loader2, ArrowLeft, Check, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';

export default function Security() {
  const { user, signOutAllDevices } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    return applySeo({
      title: 'Account Security — NowOpen Africa',
      description: 'Manage two-factor authentication, sessions and sign-out for your NowOpen Africa account.',
      path: '/security',
      robots: 'noindex, nofollow',
    });
  }, []);

  const [factors, setFactors] = useState<any[]>([]);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const [logins, setLogins] = useState<any[]>([]);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const refreshFactors = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors(data?.totp ?? []);
    setLoadingFactors(false);
  }, []);

  useEffect(() => {
    refreshFactors();
    if (user) {
      supabase
        .from('login_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15)
        .then(({ data }) => setLogins(data || []));
    }
  }, [refreshFactors, user]);

  const verifiedFactor = factors.find((f) => f.status === 'verified');

  const startEnroll = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch (err: any) {
      toast.error(err.message || 'Could not start 2FA setup.');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnroll = async () => {
    if (!enroll) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (chErr) throw chErr;
      const { error } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code: code.trim() });
      if (error) throw error;
      toast.success('Two-factor authentication is on.');
      setEnroll(null); setCode('');
      refreshFactors();
    } catch (err: any) {
      toast.error(err.message || 'That code was not valid — try again.');
    } finally {
      setBusy(false);
    }
  };

  const disableFactor = async (factorId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      toast.success('Two-factor authentication turned off.');
      refreshFactors();
    } catch (err: any) {
      toast.error(err.message || 'Could not turn off 2FA.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOutAll = async () => {
    setSigningOutAll(true);
    try {
      await signOutAllDevices();
      toast.success('Signed out of all devices.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err.message || 'Could not sign out everywhere.');
      setSigningOutAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-blue-600 dark:text-blue-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Security</h1>
          <Link to="/dashboard" className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] px-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            <ArrowLeft size={15} /> Dashboard
          </Link>
        </div>

        {/* 2FA */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="font-bold text-gray-900 dark:text-white">Two-factor authentication</h2>
            {verifiedFactor && <span className="ml-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">On</span>}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Add a second step at sign-in using an authenticator app (Google Authenticator, Authy, 1Password…).
          </p>

          {loadingFactors ? (
            <Loader2 className="animate-spin text-gray-400" />
          ) : verifiedFactor ? (
            <button onClick={() => disableFactor(verifiedFactor.id)} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
              <Trash2 size={15} /> Turn off 2FA
            </button>
          ) : enroll ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Scan this with your authenticator app, then enter the 6-digit code.</p>
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2 bg-white" dangerouslySetInnerHTML={{ __html: enroll.qr }} />
                <div className="text-xs text-gray-500 dark:text-gray-400 break-all">
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Can't scan? Enter this key:</p>
                  <code className="text-[11px]">{enroll.secret}</code>
                </div>
              </div>
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={6}
                  inputMode="numeric" placeholder="123456"
                  className="w-32 text-center tracking-widest px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg text-sm" />
                <button onClick={confirmEnroll} disabled={busy || code.length < 6}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Verify
                </button>
                <button onClick={() => { setEnroll(null); setCode(''); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:underline">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={startEnroll} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />} Set up 2FA
            </button>
          )}
        </section>

        {/* Sessions */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <div className="flex items-center gap-2 mb-1">
            <Monitor size={18} className="text-gray-500 dark:text-gray-400" />
            <h2 className="font-bold text-gray-900 dark:text-white">Sessions</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            If you've lost a device or suspect someone else has access, sign out everywhere and change your password.
          </p>
          <button onClick={handleSignOutAll} disabled={signingOutAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
            {signingOutAll ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />} Sign out of all devices
          </button>
        </section>

        {/* Login history */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6">
          <h2 className="font-bold text-gray-900 dark:text-white mb-1">Recent sign-ins</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Spot anything you don't recognise? Sign out everywhere and reset your password.</p>
          {logins.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No recent sign-ins recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {logins.map((l) => (
                <div key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{shortUA(l.user_agent)}</span>
                  <span className="text-xs text-gray-400 shrink-0">{l.created_at ? new Date(l.created_at).toLocaleString() : ''}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function shortUA(ua?: string | null): string {
  if (!ua) return 'Unknown device';
  const os = /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iOS/i.test(ua) ? 'iOS' : /Linux/i.test(ua) ? 'Linux' : 'device';
  const browser = /Edg\//i.test(ua) ? 'Edge' : /Chrome\//i.test(ua) ? 'Chrome' : /Firefox\//i.test(ua) ? 'Firefox' : /Safari\//i.test(ua) ? 'Safari' : 'browser';
  return `${browser} on ${os}`;
}
