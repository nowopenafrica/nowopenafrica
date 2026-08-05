import { useState } from 'react';
import toast from 'react-hot-toast';
import { Megaphone, Pin, PinOff, Send, Trash2, Copy, Plus, X, CheckCircle2, Eye } from 'lucide-react';
import { Business } from '../../types';
import {
  Announcement, AnnouncementType,
  ANNOUNCEMENT_TYPES, announcementLabel,
  announcementDraft, announcementPreview, createAnnouncement,
  loadAnnouncements, saveAnnouncements,
} from '../../lib/announcements';
import { profileUrl } from '../../lib/studio';

interface Props {
  business: Business;
}

export default function AnnouncementsStudio({ business }: Props) {
  const [list, setList] = useState<Announcement[]>(() => loadAnnouncements(business.id));
  const [type, setType] = useState<AnnouncementType>('new-product');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const persist = (next: Announcement[]) => { setList(next); saveAnnouncements(business.id, next); };

  const pickType = (t: AnnouncementType) => {
    setType(t);
    const d = announcementDraft(business, t);
    setTitle(d.title);
    setBody(d.body);
  };

  const openForm = () => {
    setShowForm(true);
    pickType(type);
  };

  const publish = () => {
    if (!title.trim() || !body.trim()) return toast.error('Add a title and message first.');
    const a = createAnnouncement(business, type, { title, body, pinned: false });
    const next = [{ ...a, publishedAt: new Date().toISOString() }, ...list];
    persist(next);
    setShowForm(false);
    toast.success('Announcement published to your profile');
  };

  const saveDraft = () => {
    if (!title.trim() || !body.trim()) return toast.error('Add a title and message first.');
    const a = createAnnouncement(business, type, { title, body });
    persist([a, ...list]);
    setShowForm(false);
    toast.success('Announcement saved as draft');
  };

  const togglePin = (id: string) => {
    persist(list.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a)));
  };

  const remove = (id: string) => {
    persist(list.filter((a) => a.id !== id));
  };

  const share = (a: Announcement) => {
    const text = `${announcementPreview(business, a)}\n\nSee us → ${profileUrl(business)}`;
    if (business.phone) {
      const digits = business.phone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else toast.success('Copy the announcement and share it from your phone.');
  };

  const copy = (a: Announcement) => {
    navigator.clipboard?.writeText(announcementPreview(business, a)).then(() => {
      setCopiedId(a.id);
      setTimeout(() => setCopiedId(null), 1200);
    }).catch(() => toast.error('Could not copy.'));
  };

  const ordered = [...list].sort((x, y) => Number(!!y.pinned) - Number(!!x.pinned) || String(y.createdAt).localeCompare(String(x.createdAt)));

  return (
    <div className="space-y-5">
      {/* Compose */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Megaphone size={16} className="text-purple-600 dark:text-purple-400" /> New announcement
          </h3>
          <button onClick={() => (showForm ? setShowForm(false) : openForm())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
            {showForm ? <><X size={15} /> Close</> : <><Plus size={15} /> Compose</>}
          </button>
        </div>

        {showForm && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ANNOUNCEMENT_TYPES.map((t) => (
                <button key={t.key} onClick={() => pickType(t.key)}
                  className={`text-left px-3 py-2 rounded-lg text-xs font-medium border transition ${type === t.key ? 'border-transparent text-white bg-purple-600' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <span className="block">{t.emoji} {t.label}</span>
                </button>
              ))}
            </div>

            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message"
              className="w-full min-h-[90px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />

            <div className="flex items-center justify-between rounded-xl bg-gray-50 dark:bg-gray-900 p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">Preview</p>
              <div className="text-right text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap max-w-md">{announcementPreview(business, { ...createAnnouncement(business, type, { title, body }), date: new Date().toISOString().slice(0, 10) })}</div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={saveDraft} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition">
                Save draft
              </button>
              <button onClick={publish} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
                <CheckCircle2 size={15} /> Publish to profile
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <Megaphone size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No announcements yet. Compose one and publish it to your profile.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((a) => {
            const published = !!a.publishedAt;
            return (
              <div key={a.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {a.pinned && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                          <Pin size={10} /> Pinned
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${published ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${published ? 'bg-green-500' : 'bg-gray-400'}`} /> {published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white mt-1.5">{a.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{a.body}</p>
                    <p className="text-[11px] text-gray-400 mt-2">{announcementLabel(a.type)} · {new Date(`${a.date}T00:00:00`).toLocaleDateString()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => togglePin(a.id)} title={a.pinned ? 'Unpin' : 'Pin'} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition">
                      {a.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                    </button>
                    <button onClick={() => copy(a)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition">
                      {copiedId === a.id ? 'Copied!' : 'Copy'} <Copy size={13} />
                    </button>
                    <button onClick={() => share(a)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:bg-green-700 transition">
                      <Send size={13} /> WhatsApp
                    </button>
                    <button onClick={() => remove(a.id)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-500 transition">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Eye size={12} /> Published announcements appear on your NowOpen profile feed. Pin the important ones to keep them on top.
      </p>
    </div>
  );
}
