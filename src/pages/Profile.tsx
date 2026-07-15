import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { User, Business, MediaService } from '../types';
import { ArrowLeft, User as UserIcon, Clock, MapPin, Phone, Mail, Globe, Star, Image } from 'lucide-react';

export default function Profile() {
  const { id } = useParams<{ id: string }>();
  const { user: authUser } = useAuth();
  // The /profile route has no :id param — default to the signed-in user
  const profileId = id || authUser?.id;
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    location: '',
    website: '',
    phone: '',
    email: '',
    profile_image_url: '',
    cover_image_url: '',
    skills: '',
    experience: '',
    education: '',
    awards: '',
    services: '',
  });

  useEffect(() => {
    if (profileId) fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const fetchProfile = async () => {
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();

      const { data: businessData } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', profileId);

      const { data: mediaData } = await supabase
        .from('media_services')
        .select('*')
        .eq('user_id', profileId);

      if (userData) {
        setUser(userData);
        setBusinesses(businessData || []);
        setMediaServices(mediaData || []);

        setFormData({
          name: userData.name || '',
          bio: userData.bio || '',
          location: userData.location || '',
          website: userData.website || '',
          phone: userData.phone || '',
          email: userData.email || '',
          profile_image_url: userData.profile_image_url || '',
          cover_image_url: userData.cover_image_url || '',
          skills: userData.skills || '',
          experience: userData.experience || '',
          education: userData.education || '',
          awards: userData.awards || '',
          services: userData.services || '',
        });
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      await supabase
        .from('users')
        .update(formData)
        .eq('id', id);

      setEditing(false);
      fetchProfile();
    } catch (err) {
      console.error('Error saving profile:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Profile not found</p>
          <Link to="/" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
          >
            <ArrowLeft size={18} />
            Back to Home
          </Link>
        </div>

        {/* Profile Header - Behance-inspired */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Cover Image */}
          <div className="relative h-96 bg-gray-200 overflow-hidden">
            {formData.cover_image_url ? (
              <img
                src={formData.cover_image_url}
                alt={formData.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
            )}

            {/* Profile Photo */}
            <div className="absolute -bottom-16 left-8">
              <div className="relative">
                <div className="w-32 h-32 bg-gray-300 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
                  {formData.profile_image_url ? (
                    <img
                      src={formData.profile_image_url}
                      alt={formData.name}
                      className="w-28 h-28 rounded-full object-cover"
                    />
                  ) : (
                    <UserIcon size={40} className="text-blue-600" />
                  )}
                </div>
                {editing && (
                  <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <Image size={16} className="text-white" />
                  </div>
                )}
              </div>
            </div>

            {/* Edit Button */}
            {editing && (
              <button
                onClick={handleSaveProfile}
                className="absolute top-4 right-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Save Profile
              </button>
            )}
          </div>

          {/* Profile Content */}
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  {formData.name || user.email}
                </h1>
                <p className="text-lg text-gray-600">{formData.bio || 'Creative professional on NowOpen Africa'}</p>
              </div>
              {user.id === authUser?.id && (
                <button
                  onClick={() => setEditing(!editing)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                >
                  {editing ? 'Cancel' : 'Edit Profile'}
                </button>
              )}
            </div>

            {/* Professional Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Professional Information</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <UserIcon size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-600">Name</p>
                      <p className="text-sm text-gray-900">{formData.name || user.email}</p>
                    </div>
                  </div>
                  {formData.location && (
                    <div className="flex items-start gap-3">
                      <MapPin size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-600">Location</p>
                        <p className="text-sm text-gray-900">{formData.location}</p>
                      </div>
                    </div>
                  )}
                  {formData.phone && (
                    <div className="flex items-start gap-3">
                      <Phone size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-600">Phone</p>
                        <p className="text-sm text-gray-900">{formData.phone}</p>
                      </div>
                    </div>
                  )}
                  {formData.email && (
                    <div className="flex items-start gap-3">
                      <Mail size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-600">Email</p>
                        <p className="text-sm text-gray-900">{formData.email}</p>
                      </div>
                    </div>
                  )}
                  {formData.website && (
                    <div className="flex items-start gap-3">
                      <Globe size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-600">Website</p>
                        <p className="text-sm text-gray-900">
                          <a href={formData.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                            {formData.website}
                          </a>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Professional Skills</h3>
                <div className="space-y-3">
                  {formData.skills && (
                    <div>
                      <p className="text-xs font-medium text-gray-600">Skills</p>
                      <p className="text-sm text-gray-900">{formData.skills}</p>
                    </div>
                  )}
                  {formData.experience && (
                    <div>
                      <p className="text-xs font-medium text-gray-600">Experience</p>
                      <p className="text-sm text-gray-900">{formData.experience}</p>
                    </div>
                  )}
                  {formData.education && (
                    <div>
                      <p className="text-xs font-medium text-gray-600">Education</p>
                      <p className="text-sm text-gray-900">{formData.education}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Achievements</h3>
                <div className="space-y-3">
                  {formData.awards && (
                    <div>
                      <p className="text-xs font-medium text-gray-600">Awards</p>
                      <p className="text-sm text-gray-900">{formData.awards}</p>
                    </div>
                  )}
                  {formData.services && (
                    <div>
                      <p className="text-xs font-medium text-gray-600">Services</p>
                      <p className="text-sm text-gray-900">{formData.services}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{businesses.length}</div>
                <p className="text-xs text-gray-600">Businesses</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">{mediaServices.length}</div>
                <p className="text-xs text-gray-600">Media Services</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-pink-600">0</div>
                <p className="text-xs text-gray-600">Adverts</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">0</div>
                <p className="text-xs text-gray-600">Projects</p>
              </div>
            </div>

            {/* Edit Form (when editing) */}
            {editing && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Profile</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Skills</label>
                    <input
                      type="text"
                      value={formData.skills}
                      onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Experience</label>
                    <input
                      type="text"
                      value={formData.experience}
                      onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Education</label>
                    <input
                      type="text"
                      value={formData.education}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Awards</label>
                    <input
                      type="text"
                      value={formData.awards}
                      onChange={(e) => setFormData({ ...formData, awards: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Services</label>
                  <input
                    type="text"
                    value={formData.services}
                    onChange={(e) => setFormData({ ...formData, services: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Businesses Section */}
        {businesses.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Businesses</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {businesses.map((business) => (
                <Link
                  key={business.id}
                  to={business.username ? `/${business.username}` : `/businesses/${business.id}`}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition"
                >
                  <div className="h-32 overflow-hidden">
                    {business.image_url ? (
                      <img
                        src={business.image_url}
                        alt={business.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-blue-600 font-medium mb-1">{business.category}</p>
                    <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                      {business.name}
                    </h3>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                      {business.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Clock size={14} className="text-gray-500" />
                      <span>{business.created_at ? new Date(business.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Media Services Section */}
        {mediaServices.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Media Services</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mediaServices.map((service) => (
                <Link
                  key={service.id}
                  to={`/media/${service.id}`}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-pink-300 transition"
                >
                  <div className="h-32 overflow-hidden">
                    {service.image_url ? (
                      <img
                        src={service.image_url}
                        alt={service.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-pink-400 to-pink-600" />
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-pink-600 font-medium mb-1">{service.service_type}</p>
                    <h3 className="font-bold text-gray-900 mb-1 line-clamp-2 text-sm">
                      {service.title}
                    </h3>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-3">
                      {service.description}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-600">
                      <Star size={14} className="fill-yellow-400 text-yellow-400" />
                      <span>{(service.rating ?? 0).toFixed(1)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
