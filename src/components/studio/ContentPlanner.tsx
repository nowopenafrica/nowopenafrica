import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Business } from '../../types';
import { PlanItem, loadPlannerItems, savePlannerItems } from '../../lib/planner';

interface Props {
  business: Business;
}

const PLATFORMS = ['Instagram', 'Facebook', 'Story / WhatsApp', 'TikTok', 'X / Twitter', 'LinkedIn', 'Email', 'SMS'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The day-of-week rotation used by "Auto-plan month" — the same cadence the
// AI Social Studio recommends: specials, reviews, behind-the-scenes, promos.
const WEEK_PATTERN: { title: string; platform: string }[] = [
  { title: 'Inspirational quote', platform: 'Facebook' },
  { title: 'Weekly special', platform: 'Instagram' },
  { title: 'Behind the scenes', platform: 'Story / WhatsApp' },
  { title: 'Customer review share', platform: 'Facebook' },
  { title: 'Team & story', platform: 'LinkedIn' },
  { title: 'Weekend promo', platform: 'Instagram' },
  { title: 'Best seller', platform: 'Story / WhatsApp' },
];

export default function ContentPlanner({ business }: Props) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [items, setItems] = useState<PlanItem[]>(() => loadPlannerItems(business.id));
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [date, setDate] = useState(now.toISOString().slice(0, 10));
  const [status, setStatus] = useState<'planned' | 'published'>('planned');

  useEffect(() => {
    savePlannerItems(business.id, items);
  }, [items, business.id]);

  const addItem = () => {
    if (!title.trim()) return toast.error('Give the post a title first.');
    setItems((prev) => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date,
      title: title.trim(),
      platform,
      status,
    }]);
    setTitle('');
    setShowForm(false);
    toast.success('Added to your calendar');
  };

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const toggleStatus = (id: string) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: i.status === 'planned' ? 'published' : 'planned' } : i));

  const byDate = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    items.forEach((i) => {
      const arr = map.get(i.date) || [];
      arr.push(i);
      map.set(i.date, arr);
    });
    return map;
  }, [items]);

  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);
  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const planned = items.filter((i) => i.status === 'planned').length;
  const published = items.filter((i) => i.status === 'published').length;

  const move = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const autoPlan = () => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    const next: PlanItem[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (byDate.has(ds)) continue;
      const p = WEEK_PATTERN[d.getDay()];
      next.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: ds, title: p.title, platform: p.platform, status: 'planned' });
    }
    if (!next.length) return toast('Every day already has a post this month.');
    setItems((prev) => [...prev, ...next]);
    toast.success(`Planned ${next.length} days for ${monthLabel}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => move(-1)} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            <ChevronLeft size={16} />
          </button>
          <h3 className="text-base font-bold text-gray-900 dark:text-white w-44 text-center">{monthLabel}</h3>
          <button onClick={() => move(1)} className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> {planned} planned
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> {published} published
          </span>
          <button onClick={autoPlan}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition">
            <Sparkles size={15} /> Auto-plan month
          </button>
          <button onClick={() => { setShowForm((v) => !v); setDate(new Date(year, month, 1).toISOString().slice(0, 10)); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
            <Plus size={15} /> Add post
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekend offer post"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm">
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <div className="flex gap-2 pt-0.5">
              <button onClick={() => setStatus('planned')}
                className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition ${status === 'planned' ? 'bg-amber-400 text-amber-950' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>Planned</button>
              <button onClick={() => setStatus('published')}
                className={`flex-1 px-2 py-2 rounded-lg text-xs font-medium transition ${status === 'published' ? 'bg-green-500 text-white' : 'border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}>Published</button>
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex justify-end items-end">
            <button onClick={addItem}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition">
              <Plus size={15} /> Add to calendar
            </button>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: first }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayItems = byDate.get(ds) || [];
            const isToday = ds === todayStr;
            return (
              <div key={ds} className={`min-h-[76px] rounded-lg border p-1.5 transition ${isToday ? 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/30' : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'}`}>
                <span className={`text-[11px] font-semibold ${isToday ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'}`}>{day}</span>
                <div className="mt-1 space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <div key={item.id} className="group relative">
                      <button onClick={() => toggleStatus(item.id)} title="Click to mark published/planned"
                        className={`w-full text-left px-1.5 py-1 rounded-md text-[10px] font-medium leading-tight transition ${item.status === 'published'
                          ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 line-through'
                          : 'bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200'}`}>
                        {item.title}
                      </button>
                      <button onClick={() => removeItem(item.id)}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-200 items-center justify-center hidden group-hover:flex">
                        <Trash2 size={9} />
                      </button>
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <p className="text-[9px] text-gray-400 pl-1">+{dayItems.length - 3} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <CalendarDays size={12} /> Saved on this device for {business.name}. Tap a post to toggle planned / published.
      </p>
    </div>
  );
}
