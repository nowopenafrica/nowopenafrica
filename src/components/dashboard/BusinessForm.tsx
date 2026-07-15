import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Upload, ImageIcon, CheckCircle, XCircle, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BUSINESS_CATEGORY_GROUPS, BUSINESS_CATEGORIES } from '../../data/categories';

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
  const [uploading, setUploading] = useState(false);
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    description: '',
    category: '',
    location: '',
    phone: '',
    website: '',
    email: '',
    image_url: '',
    status: 'open' as 'open' | 'closed',
  });

  useEffect(() => {
    if (editingId) fetchBusiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

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
        location: data.location || '',
        phone: data.phone || '',
        website: data.website || '',
        email: data.email || '',
        image_url: data.image_url || '',
        status: data.status || 'open',
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('business-images')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      setFormData(prev => ({ ...prev, image_url: data.publicUrl }));
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      alert(
        `Photo upload failed: ${err.message || 'unknown error'}\n\n` +
        'If this says the bucket does not exist, run the latest migration ' +
        '(scripts/sql/apply_all_migrations.sql) in the Supabase SQL editor.'
      );
    } finally {
      setUploading(false);
      // allow re-selecting the same file
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      const { error } = editingId
        ? await supabase
            .from('businesses')
            .update(payload)
            .eq('id', editingId)
        : await supabase
            .from('businesses')
            .insert([{ ...payload, user_id: user.id }]);

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
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <h3 className="font-bold text-lg text-gray-900 mb-4">
        {editingId ? 'Edit Business' : 'Add New Business'}
      </h3>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Business Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          required
        />
      </div>

      {/* Username / profile URL */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Profile URL</label>
        <div className="flex items-stretch">
          <span className="inline-flex items-center px-3 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 text-gray-500 text-xs whitespace-nowrap">
            nowopenafrica.com/
          </span>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => handleUsernameChange(e.target.value)}
            onBlur={checkUsername}
            placeholder="your-business-name"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>
        <p className="mt-1 text-xs flex items-center gap-1">
          {usernameStatus === 'checking' && (
            <span className="text-gray-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Checking availability…</span>
          )}
          {usernameStatus === 'available' && (
            <span className="text-green-600 flex items-center gap-1"><CheckCircle size={12} /> Available</span>
          )}
          {usernameStatus === 'taken' && (
            <span className="text-red-600 flex items-center gap-1"><XCircle size={12} /> Already taken — try another</span>
          )}
          {usernameStatus === 'invalid' && (
            <span className="text-red-600 flex items-center gap-1"><XCircle size={12} /> 3–40 characters: lowercase letters, numbers and hyphens</span>
          )}
          {usernameStatus === 'idle' && (
            <span className="text-gray-500">Lowercase letters, numbers and hyphens only</span>
          )}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          rows={3}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Location / Address</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g. 12 Admiralty Way, Lekki, Lagos"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">Shown on a map on your profile — a full address gives a precise pin.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
          <input
            type="url"
            value={formData.website}
            onChange={(e) => setFormData({ ...formData, website: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'open' | 'closed' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Profile photo */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Profile Photo</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center flex-shrink-0">
            {formData.image_url ? (
              <img src={formData.image_url} alt="Business profile" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={24} className="text-gray-400" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition text-sm disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? 'Uploading…' : 'Upload Photo'}
              </button>
              {formData.image_url && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, image_url: '' })}
                  className="inline-flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition text-sm"
                >
                  <X size={14} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500">JPG, PNG or WebP, up to 5 MB</p>
          </div>
        </div>
        {/* Fallback: paste an image URL directly */}
        <input
          type="url"
          value={formData.image_url}
          onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
          placeholder="…or paste an image URL"
          className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading || uploading}
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
          className="px-6 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
