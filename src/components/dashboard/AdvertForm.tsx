import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { SERVER_ROW_CAP } from '../../lib/fetchAllBusinesses';
import { useAuth } from '../../contexts/AuthContext';
import { ADVERT_CATEGORIES } from '../../data/advertCategories';

interface AdvertFormProps {
  editingId: string | null;
  /**
   * Console mode: an admin correcting somebody else's placement.
   *
   * The owner path is scoped by `user_id` at every step — the businesses you
   * may link, the advert you may read, and the row the update is allowed to
   * touch. An admin is exempt from that scoping by database policy, so the
   * filter has to be dropped here too; leaving it on would return null from
   * the read and update zero rows, both silently.
   */
  asAdmin?: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdvertForm({ editingId, asAdmin, onSuccess, onCancel }: AdvertFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState<{ id: string; name: string }[]>([]);
  const [formData, setFormData] = useState({
    business_id: '',
    title: '',
    description: '',
    image_url: '',
    budget: '',
    status: 'pending',
    category: '',
    location: '',
    pricing: '',
    duration: '',
    dimensions: '',
    traffic_density: ''
  });

  useEffect(() => {
    if (editingId) fetchAdvert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // Load the businesses a campaign can be linked to. An owner sees their own;
  // an admin sees the whole directory, since the placement may belong to any
  // listing (or to none).
  useEffect(() => {
    if (!user) return;
    let query = supabase
      .from('businesses')
      .select('id, name')
      .limit(SERVER_ROW_CAP);
    if (!asAdmin) query = query.eq('user_id', user.id);
    query.then(({ data }) => setBusinesses(data || []));
  }, [user, asAdmin]);

  const fetchAdvert = async () => {
    let query = supabase
      .from('advertisements')
      .select('*')
      .eq('id', editingId);
    if (!asAdmin && user) query = query.eq('user_id', user.id);
    const { data } = await query.maybeSingle();

    if (data) {
      setFormData({
        business_id: data.business_id || '',
        title: data.title || '',
        description: data.description || '',
        image_url: data.image_url || '',
        budget: data.budget?.toString() || '',
        status: data.status || 'pending',
        category: data.category || '',
        location: data.location || '',
        pricing: data.pricing?.toString() || '',
        duration: data.duration?.toString() || '',
        dimensions: data.dimensions || '',
        traffic_density: data.traffic_density || ''
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const advertData: Record<string, unknown> = {
        ...formData,
        // Don't store an empty-string business_id — omit it instead
        business_id: formData.business_id || null,
        budget: parseInt(formData.budget) || 0,
        pricing: parseFloat(formData.pricing) || 0,
        duration: parseInt(formData.duration) || 0
      };

      let error;
      if (editingId) {
        let update = supabase
          .from('advertisements')
          .update(advertData)
          .eq('id', editingId);
        // An owner may only touch their own row. The console edits by policy,
        // so applying the same filter there would match nothing.
        if (!asAdmin) update = update.eq('user_id', user.id);
        ({ error } = await update);
      } else {
        ({ error } = await supabase
          .from('advertisements')
          .insert([{ ...advertData, user_id: user.id }]));
      }

      if (error) throw error;
      toast.success(
        editingId
          ? (asAdmin ? 'Placement updated' : 'Campaign updated')
          : 'Campaign created',
      );
      onSuccess();
    } catch (error: any) {
      console.error('Error saving advertisement:', error);
      toast.error(`Could not save advert: ${error.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-4">
        {asAdmin
          ? 'Edit placement'
          : editingId ? 'Edit Campaign' : 'Create Campaign'}
      </h3>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Campaign Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          required
        />
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
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          >
            <option value="">Select Category</option>
            {ADVERT_CATEGORIES.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g. Victoria Island, Lagos or Westlands, Nairobi"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>
      </div>

      {businesses.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Linked Business (optional)</label>
          <select
            value={formData.business_id}
            onChange={(e) => setFormData({ ...formData, business_id: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white dark:bg-gray-800"
          >
            <option value="">Not linked to a business</option>
            {businesses.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Budget ($)</label>
          <input
            type="number"
            value={formData.budget}
            onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (days)</label>
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Pricing ($/day)</label>
          <input
            type="number"
            step="0.01"
            value={formData.pricing}
            onChange={(e) => setFormData({ ...formData, pricing: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Dimensions</label>
          <input
            type="text"
            value={formData.dimensions}
            onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
            placeholder="e.g., 10ft x 20ft"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Traffic Density</label>
          <select
            value={formData.traffic_density}
            onChange={(e) => setFormData({ ...formData, traffic_density: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">Select Density</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
        <input
          type="url"
          value={formData.image_url}
          onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
        >
          {loading ? 'Saving...' : asAdmin ? 'Save placement' : 'Save Campaign'}
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
