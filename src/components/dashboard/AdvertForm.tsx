import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface AdvertFormProps {
  editingId: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AdvertForm({ editingId, onSuccess, onCancel }: AdvertFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
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
  }, [editingId]);

  const fetchAdvert = async () => {
    const { data } = await supabase
      .from('advertisements')
      .select('*')
      .eq('id', editingId)
      .maybeSingle();

    if (data) {
      setFormData({
        business_id: data.business_id,
        title: data.title,
        description: data.description,
        image_url: data.image_url,
        budget: data.budget.toString(),
        status: data.status,
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
      const advertData = {
        ...formData,
        budget: parseInt(formData.budget),
        pricing: parseFloat(formData.pricing) || 0,
        duration: parseInt(formData.duration) || 0
      };

      const { error } = editingId
        ? await supabase
            .from('advertisements')
            .update(advertData)
            .eq('id', editingId)
        : await supabase
            .from('advertisements')
            .insert([{ ...advertData, user_id: user.id }]);

      if (error) throw error;
      onSuccess();
    } catch (error: any) {
      console.error('Error saving advertisement:', error);
      alert(`Could not save advert: ${error.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <h3 className="font-bold text-lg text-gray-900 mb-4">
        {editingId ? 'Edit Campaign' : 'Create Campaign'}
      </h3>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Campaign Title</label>
        <input
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          required
        />
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          >
            <option value="">Select Category</option>
            <option value="Billboard">Billboard</option>
            <option value="Transit">Transit</option>
            <option value="Digital">Digital</option>
            <option value="Print">Print</option>
            <option value="Radio">Radio</option>
            <option value="Television">Television</option>
            <option value="Online">Online</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
          <select
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          >
            <option value="">Select Location</option>
            <option value="Ikeja, Lagos">Ikeja, Lagos</option>
            <option value="Victoria Island, Lagos">Victoria Island, Lagos</option>
            <option value="Lekki, Lagos">Lekki, Lagos</option>
            <option value="Surulere, Lagos">Surulere, Lagos</option>
            <option value="Ajah, Lagos">Ajah, Lagos</option>
            <option value="Ikorodu, Lagos">Ikorodu, Lagos</option>
            <option value="Badagry, Lagos">Badagry, Lagos</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Budget ($)</label>
          <input
            type="number"
            value={formData.budget}
            onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Duration (days)</label>
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Pricing ($/day)</label>
          <input
            type="number"
            step="0.01"
            value={formData.pricing}
            onChange={(e) => setFormData({ ...formData, pricing: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Dimensions</label>
          <input
            type="text"
            value={formData.dimensions}
            onChange={(e) => setFormData({ ...formData, dimensions: e.target.value })}
            placeholder="e.g., 10ft x 20ft"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Traffic Density</label>
          <select
            value={formData.traffic_density}
            onChange={(e) => setFormData({ ...formData, traffic_density: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="">Select Density</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Image URL</label>
        <input
          type="url"
          value={formData.image_url}
          onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
        >
          {loading ? 'Saving...' : 'Save Campaign'}
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
