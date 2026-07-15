import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface MediaFormProps {
  editingId: string | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function MediaForm({ editingId, onSuccess, onCancel }: MediaFormProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    service_type: '',
    pricing: '',
    image_url: '',
    portfolio_url: '',
    rating: '5',
  });

  useEffect(() => {
    if (editingId) fetchMedia();
  }, [editingId]);

  const fetchMedia = async () => {
    const { data } = await supabase
      .from('media_services')
      .select('*')
      .eq('id', editingId)
      .maybeSingle();

    if (data) {
      setFormData({
        title: data.title,
        description: data.description,
        service_type: data.service_type,
        pricing: data.pricing,
        image_url: data.image_url,
        portfolio_url: data.portfolio_url,
        rating: data.rating,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const payload = {
        ...formData,
        pricing: parseInt(formData.pricing) || 0,
        rating: parseFloat(formData.rating) || 0,
      };

      const { error } = editingId
        ? await supabase
            .from('media_services')
            .update(payload)
            .eq('id', editingId)
        : await supabase
            .from('media_services')
            .insert([{ ...payload, user_id: user.id }]);

      if (error) throw error;
      onSuccess();
    } catch (error: any) {
      console.error('Error saving media service:', error);
      alert(`Could not save media service: ${error.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <h3 className="font-bold text-lg text-gray-900 mb-4">
        {editingId ? 'Edit Service' : 'List New Service'}
      </h3>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Service Title</label>
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Service Type</label>
          <select
            value={formData.service_type}
            onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          >
            <option value="">Select Service Type</option>
            <option value="Video Production">Video Production</option>
            <option value="Graphic Design">Graphic Design</option>
            <option value="Content Creation">Content Creation</option>
            <option value="Photography">Photography</option>
            <option value="Advertising">Advertising</option>
            <option value="Social Media">Social Media</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Price ($)</label>
          <input
            type="number"
            value={formData.pricing}
            onChange={(e) => setFormData({ ...formData, pricing: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            required
          />
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

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Portfolio URL</label>
        <input
          type="url"
          value={formData.portfolio_url}
          onChange={(e) => setFormData({ ...formData, portfolio_url: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
      </div>

      <div className="flex gap-4 pt-4">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
        >
          {loading ? 'Saving...' : 'Save Service'}
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
