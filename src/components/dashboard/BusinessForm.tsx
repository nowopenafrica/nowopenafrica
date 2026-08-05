import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Upload, ImageIcon, CheckCircle, XCircle, X, Plus, Check, LocateFixed } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { detectLocation } from '../../lib/geolocation';
import { BUSINESS_CATEGORY_GROUPS, BUSINESS_CATEGORIES } from '../../data/categories';
import { getCategoryFeatures, getModuleByKey, MODULE_LIBRARY } from '../../data/categoryFeatures';
import { moduleLimitForPlan, getBusinessTier } from '../../data/pricingPlans';
import { compressImage } from '../../lib/imageCompression';

interface BusinessFormProps {
  editingId: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const USERNAME_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
// Usernames live at the site root (nowopenafrica.com/<username>), so every
// top-level route must be reserved to avoid collisions.
const RESERVED_USERNAMES = [
  'admin', 'adverts', 'advert', 'api', 'app', 'business', 'businesses',
  'contact', 'dashboard', 'digital-forms', 'edit', 'help', 'home', 'login',
  'media', 'new', 'pricing', 'profile', 'register', 'settings', 'signup',
  'support', 'terms', 'privacy', 'waitlist', 'www',
];

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export default function BusinessForm({ editingId, onSuccess, onCancel }: BusinessFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploadingField, setUploadingField] = useState<'image_url' | 'logo_url' | null>(null);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    description: '',
    category: '',
    // Up to 3 extra categories this business also serves.
    secondary_categories: [] as string[],
    location: '',
    phone: '',
    website: '',
    email: '',
    image_url: '',
    logo_url: '',
    status: 'open' as 'open' | 'closed',
    // Owner-selected booking modules. null = all of the category's modules.
    enabled_modules: null as string[] | null,
  });

  // How many booking modules this owner's plan allows. Defaults to unlimited
  // until we can read the plan, so it never blocks anyone before the
  // subscription migration is applied.
  const [moduleCap, setModuleCap] = useState(999);
  const [planName, setPlanName] = useState('your');
  const [showAddModules, setShowAddModules] = useState(false);
  const [detectingLoc, setDetectingLoc] = useState(false);

  const useMyLocation = async () => {
    setDetectingLoc(true);
    try {
      const loc = await detectLocation();
      setFormData((prev) => ({ ...prev, location: loc.label }));
      toast.success('Location detected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not detect your location.');
    } finally {
      setDetectingLoc(false);
    }
  };

  useEffect(() => {
    if (editingId) fetchBusiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useEffect(() => {
    if (!user) return;
    supabase.from('users').select('plan, plan_status').eq('id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        const effective = d.plan_status === 'trialing' ? 'business-pro' : (d.plan || 'starter');
        setModuleCap(moduleLimitForPlan(effective));
        setPlanName(getBusinessTier(effective)?.name || 'Free Launch');
      });
  }, [user]);

  const fetchBusiness = async () => {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', editingId)
      .maybeSingle();

    if (data) {
      setFormData({
        name: data.name || '',
        username: data.username || '',
        description: data.description || '',
        category: data.category || '',
        secondary_categories: data.secondary_categories ?? [],
        location: data.location || '',
        phone: data.phone || '',
        website: data.website || '',
        email: data.email || '',
        image_url: data.image_url || '',
        logo_url: data.logo_url || '',
        status: data.status || 'open',
        enabled_modules: data.enabled_modules ?? null,
      });
      if (data.username) setUsernameEdited(true);
    }
  };

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      // Keep suggesting a username from the name until the user edits it
      username: usernameEdited ? prev.username : slugify(name),
    }));
    if (!usernameEdited) setUsernameStatus('idle');
  };

  const handleUsernameChange = (raw: string) => {
    const username = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setUsernameEdited(true);
    setFormData(prev => ({ ...prev, username }));
    setUsernameStatus('idle');
  };

  // Returns true when the username is valid and free
  const checkUsername = async (): Promise<boolean> => {
    const username = formData.username.trim();
    if (!username) {
      setUsernameStatus('invalid');
      return false;
    }
    if (!USERNAME_REGEX.test(username) || RESERVED_USERNAMES.includes(username)) {
      setUsernameStatus('invalid');
      return false;
    }
    setUsernameStatus('checking');
    let query = supabase.from('businesses').select('id').ilike('username', username);
    if (editingId) query = query.neq('id', editingId);
    const { data, error } = await query.limit(1);
    if (error) {
      // Column may not exist yet (migration not applied) — don't block saving
      console.warn('Username check failed:', error.message);
      setUsernameStatus('idle');
      return true;
    }
    const free = !data || data.length === 0;
    setUsernameStatus(free ? 'available' : 'taken');
    return free;
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'image_url' | 'logo_url'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (JPG, PNG, WebP…)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large — maximum size is 5 MB');
      return;
    }

    setUploadingField(field);
    try {
      const upload = await compressImage(file);
      const ext = upload.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${field}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('business-images')
        .upload(path, upload, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      setFormData(prev => ({ ...prev, [field]: data.publicUrl }));
    } catch (err: any) {
      console.error('Image upload failed:', err);
      alert(
        `Image upload failed: ${err.message || 'unknown error'}\n\n` +
        'If this says the bucket does not exist, run the latest migration ' +
        '(scripts/sql/apply_all_migrations.sql) in the Supabase SQL editor.'
      );
    } finally {
      setUploadingField(null);
      // allow re-selecting the same file
      if (field === 'image_url' && coverInputRef.current) coverInputRef.current.value = '';
      if (field === 'logo_url' && logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  // Modules available for the chosen category, and the ones currently switched
  // on (null selection means "all", so every box shows checked by default).
  const categoryModules = getCategoryFeatures(formData.category);
  const categoryKeys = categoryModules.map((m) => m.key);
  const selectedKeys = formData.enabled_modules ?? categoryKeys;
  // Resolve any selected key to a real module (category first, then add-on
  // library) so the count includes modules the owner added beyond the category.
  const resolveModule = (key: string) =>
    categoryModules.find((m) => m.key === key) || getModuleByKey(key);
  const selectedCount = selectedKeys.filter((k) => resolveModule(k)).length;
  const capLabel = moduleCap >= 999 ? 'unlimited' : String(moduleCap);
  const atCap = selectedCount >= moduleCap;

  // Extra booking modules the owner can add on top of the category defaults.
  const addonModules = MODULE_LIBRARY.filter((m) => !categoryKeys.includes(m.key));

  const isModuleOn = (key: string) =>
    formData.enabled_modules === null || formData.enabled_modules.includes(key);
  // Add-on modules only count as "on" when explicitly listed — a null selection
  // means "category defaults only", never the add-ons.
  const isAddonOn = (key: string) => (formData.enabled_modules ?? []).includes(key);
  const toggleModule = (key: string) => {
    const current = formData.enabled_modules ?? categoryKeys;
    const turningOn = !current.includes(key);
    if (turningOn && selectedCount >= moduleCap) {
      toast.error(`Your ${planName} plan includes up to ${capLabel} booking module${moduleCap === 1 ? '' : 's'}. Upgrade to add more.`);
      return;
    }
    const next = turningOn ? [...current, key] : current.filter((k) => k !== key);
    setFormData({ ...formData, enabled_modules: next });
  };

  const toggleSecondaryCategory = (cat: string) => {
    const current = formData.secondary_categories;
    if (current.includes(cat)) {
      setFormData({ ...formData, secondary_categories: current.filter((c) => c !== cat) });
    } else {
      if (current.length >= 3) {
        toast.error('You can add up to 3 secondary categories.');
        return;
      }
      setFormData({ ...formData, secondary_categories: [...current, cat] });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      if (!(await checkUsername())) {
        setLoading(false);
        return;
      }

      const payload = { ...formData, username: formData.username.trim().toLowerCase() };

      const save = (body: Record<string, unknown>) =>
        editingId
          ? supabase.from('businesses').update(body).eq('id', editingId)
          : supabase.from('businesses').insert([{ ...body, user_id: user.id }]);

      let { error } = await save(payload);
      // Gracefully degrade if a new column's migration hasn't been applied
      // yet — retry without it so the rest of the profile still saves.
      if (error && /enabled_modules|secondary_categories/.test(error.message)) {
        const { enabled_modules, secondary_categories, ...rest } = payload;
        void enabled_modules;
        void secondary_categories;
        ({ error } = await save(rest));
        if (!error) {
          alert('Saved — but module selection needs the latest migration (scripts/sql/apply_all_migrations.sql) to take effect.');
        }
      }

      if (error) throw error;
      onSuccess();
    } catch (error: any) {
      console.error('Error saving business:', error);
      alert(`Could not save business: ${error.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-4">
        {editingId ? 'Edit Business' : 'Add New Business'}
      </h3>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Business Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          required
        />
      </div>

      {/* Username / profile URL */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Profile URL</label>
        <div className="flex items-stretch">
          <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 dark:border-gray-600 rounded-l-lg bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            nowopenafrica.com/
          </span>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            onBlur={checkUsername}
            placeholder="your-business-name"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>
        <p className="mt-1 text-xs flex items-center gap-1">
          {usernameStatus === 'checking' && (
            <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Checking availability…</span>
          )}
          {usernameStatus === 'available' && (
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Available</span>
          )}
          {usernameStatus === 'taken' && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-1"><XCircle size={12} /> Already taken — try another</span>
          )}
          {usernameStatus === 'invalid' && (
            <span className="text-red-600 dark:text-red-400 flex items-center gap-1"><XCircle size={12} /> 3–40 characters: lowercase letters, numbers and hyphens</span>
          )}
          {usernameStatus === 'idle' && (
            <span className="text-gray-500 dark:text-gray-400">Lowercase letters, numbers and hyphens only</span>
          )}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          rows={3}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
          <select
            value={formData.category}
            onChange={(e) => {
              const cat = e.target.value;
              const mods = getCategoryFeatures(cat);
              // Respect the plan cap: if the category offers more modules than
              // the plan allows, pre-select just the first `moduleCap`.
              const capped = mods.length > moduleCap ? mods.slice(0, moduleCap).map((m) => m.key) : null;
              // A new primary can't also be one of the secondary categories.
              setFormData({ ...formData, category: cat, enabled_modules: capped, secondary_categories: [] });
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800"
            required
          >
            <option value="" disabled>Select a category</option>
            {/* Keep a previously-saved custom value selectable */}
            {formData.category && !BUSINESS_CATEGORIES.includes(formData.category) && (
              <option value={formData.category}>{formData.category}</option>
            )}
            {BUSINESS_CATEGORY_GROUPS.map(group => (
              <optgroup key={group.group} label={group.group}>
                {group.items.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Location / Address</label>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={detectingLoc}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {detectingLoc ? <Loader2 size={12} className="animate-spin" /> : <LocateFixed size={12} />} Use my location
            </button>
          </div>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g. 12 Admiralty Way, Lekki, Lagos"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Shown on a map on your profile — a full address gives a precise pin.</p>
        </div>
      </div>

      {/* Secondary categories — up to 3 extra services this business offers,
          so it also shows up under those filters in the directory/search */}
      {formData.category && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Secondary categories
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Up to 3 extra categories you also serve — e.g. a tailor who also sells fabric.
              </p>
            </div>
            <span className={`text-[11px] font-medium ${formData.secondary_categories.length >= 3 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>
              {formData.secondary_categories.length} / 3
            </span>
          </div>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto pr-1">
            {BUSINESS_CATEGORY_GROUPS.map((group) => {
              const options = group.items.filter((item) => item !== formData.category);
              if (options.length === 0) return null;
              return (
                <div key={group.group}>
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{group.group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {options.map((item) => {
                      const on = formData.secondary_categories.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleSecondaryCategory(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                            on
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-500'
                          }`}
                        >
                          {on && <Check size={11} />}
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking modules — which tools appear on the profile (category
          defaults + any the owner adds from the module library) */}
      {formData.category && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4">
          <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Booking tools on your profile
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            Choose which booking / order tools appear on your business page.
          </p>
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-3">
            Your {planName} plan includes up to <span className="text-gray-900 dark:text-white">{capLabel}</span> booking module{moduleCap === 1 ? '' : 's'} · {selectedCount} selected
            {atCap && moduleCap < 999 && (
              <> · <Link to="/pricing" className="text-blue-600 dark:text-blue-400 hover:underline">Upgrade for more</Link></>
            )}
          </p>

          <div className="space-y-2">
            {categoryModules.map((m) => {
              const on = isModuleOn(m.key);
              const locked = !on && atCap;
              return (
                <label
                  key={m.key}
                  className={`flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 transition ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-600'}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={() => toggleModule(m.key)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">{m.tabLabel}</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Customer action: “{m.ctaLabel}”
                    </span>
                  </span>
                </label>
              );
            })}

            {/* Modules the owner has added beyond the category defaults */}
            {addonModules.filter((m) => isAddonOn(m.key)).map((m) => (
              <div
                key={m.key}
                className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/10 px-3 py-2.5"
              >
                <Check size={16} className="mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">
                    {m.name} <span className="ml-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Added</span>
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Customer action: “{m.ctaLabel}”</span>
                </span>
                <button type="button" onClick={() => toggleModule(m.key)} title="Remove module" className="text-gray-400 hover:text-red-500 transition">
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          {categoryModules.length === 0 && !addonModules.some((m) => isAddonOn(m.key)) && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This category has no built-in booking tools — add one below to take bookings or orders.
            </p>
          )}

          {/* Add more booking modules */}
          <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              type="button"
              onClick={() => setShowAddModules((s) => !s)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Plus size={15} /> Add booking module
            </button>

            {showAddModules && (
              <div className="mt-2 space-y-2">
                {addonModules.filter((m) => !isAddonOn(m.key)).length === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">All available modules are already on your profile.</p>
                ) : (
                  addonModules.filter((m) => !isAddonOn(m.key)).map((m) => (
                    <div
                      key={m.key}
                      className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5"
                    >
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">{m.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{m.desc}</span>
                      </span>
                      <button
                        type="button"
                        disabled={atCap}
                        onClick={() => toggleModule(m.key)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed self-center flex-shrink-0"
                      >
                        <Plus size={13} /> Add
                      </button>
                    </div>
                  ))
                )}
                {atCap && moduleCap < 999 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    You've reached your {planName} plan's module limit. <Link to="/pricing" className="underline">Upgrade</Link> to add more.
                  </p>
                )}
              </div>
            )}
          </div>

          {formData.enabled_modules !== null && formData.enabled_modules.length === 0 && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              No booking tools selected — your profile will show none.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
          <input
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'open' | 'closed' })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Profile photo (logo) */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Profile Photo</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden flex items-center justify-center flex-shrink-0">
            {formData.logo_url ? (
              <img src={formData.logo_url} alt="Business logo" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-gray-400" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, 'logo_url')}
              className="hidden"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingField === 'logo_url'}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm disabled:opacity-50"
              >
                {uploadingField === 'logo_url' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploadingField === 'logo_url' ? 'Uploading…' : 'Upload Photo'}
              </button>
              {formData.logo_url && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, logo_url: '' })}
                  className="inline-flex items-center gap-1 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 rounded-lg transition text-sm"
                >
                  <X size={14} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Square logo shown on your listing card, JPG/PNG/WebP up to 5 MB</p>
          </div>
        </div>
        {/* Fallback: paste an image URL directly */}
        <input
          type="url"
          value={formData.logo_url}
          onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
          placeholder="…or paste an image URL"
          className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      {/* Cover / banner photo */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cover Banner</label>
        <div className="flex items-center gap-4">
          <div className="w-32 h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden flex items-center justify-center flex-shrink-0">
            {formData.image_url ? (
              <img src={formData.image_url} alt="Business cover" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-gray-400" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageUpload(e, 'image_url')}
              className="hidden"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingField === 'image_url'}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm disabled:opacity-50"
              >
                {uploadingField === 'image_url' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploadingField === 'image_url' ? 'Uploading…' : 'Upload Banner'}
              </button>
              {formData.image_url && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, image_url: '' })}
                  className="inline-flex items-center gap-1 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 rounded-lg transition text-sm"
                >
                  <X size={14} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Wide cover image at the top of your profile, JPG/PNG/WebP up to 5 MB</p>
          </div>
        </div>
        {/* Fallback: paste an image URL directly */}
        <input
          type="url"
          value={formData.image_url}
          onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
          placeholder="…or paste an image URL"
          className="mt-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading || uploadingField !== null}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </div>
          ) : (
            'Save Business'
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
