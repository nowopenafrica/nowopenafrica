import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Loader2, Sparkles, CreditCard, CalendarClock, AlertTriangle, Info, Heart } from 'lucide-react';
import {
  AppNotification, fetchNotifications, markNotificationRead, markAllNotificationsRead,
} from '../../lib/notifications';

const ICON_FOR: Record<string, typeof Bell> = {
  plan: CreditCard,
  success: Check,
  warning: AlertTriangle,
  booking: CalendarClock,
  welcome: Sparkles,
  info: Info,
  // An update from a business this person chose to keep.
  keep: Heart,
};

function timeAgo(iso: string): string {
  const secs = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await fetchNotifications(userId));
    setLoading(false);
  }, [userId]);

  // Initial load + gentle polling so admin-sent notifications appear without a
  // page refresh.
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  const onItemClick = async (n: AppNotification) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      await markNotificationRead(n.id);
    }
    if (n.link) {
      setOpen(false);
      if (/^https?:\/\//.test(n.link)) window.open(n.link, '_blank', 'noopener');
      else navigate(n.link);
    }
  };

  const onMarkAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    await markAllNotificationsRead(userId);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative inline-flex items-center justify-center w-[44px] h-[44px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[26rem] overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-900 dark:text-white">Notifications</span>
            {unread > 0 && (
              <button onClick={onMarkAll} className="inline-flex items-center gap-1 min-h-[44px] px-1 rounded text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 size={18} className="animate-spin" /></div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell size={22} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm text-gray-500 dark:text-gray-400">You're all caught up.</p>
              </div>
            ) : (
              items.map((n) => {
                const Icon = ICON_FOR[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => onItemClick(n)}
                    className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition ${n.read ? '' : 'bg-blue-50/50 dark:bg-blue-900/10'}`}
                  >
                    <span className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${n.read ? 'bg-gray-100 dark:bg-gray-700 text-gray-500' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{n.title}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                      </span>
                      {n.body && <span className="block text-xs text-gray-600 dark:text-gray-400 mt-0.5">{n.body}</span>}
                      <span className="block text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
