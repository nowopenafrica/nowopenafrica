import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Business, Advert, MediaService } from '../types';
import { User, ShoppingBag, Award, Film, LogOut, Plus, Shield, LayoutGrid } from 'lucide-react';
import BusinessForm from '../components/dashboard/BusinessForm';
import BusinessList from '../components/dashboard/BusinessList';
import AdvertForm from '../components/dashboard/AdvertForm';
import AdvertList from '../components/dashboard/AdvertList';
import MediaForm from '../components/dashboard/MediaForm';
import MediaList from '../components/dashboard/MediaList';

type TabId = 'overview' | 'businesses' | 'adverts' | 'media';

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'businesses', label: 'My Businesses', icon: ShoppingBag },
  { id: 'adverts', label: 'My Adverts', icon: Award },
  { id: 'media', label: 'My Media Services', icon: Film },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [userRole, setUserRole] = useState<string>('user');
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Which entity's form is open, and which row it's editing (null = create)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumping this remounts the list components so they refetch after a save
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (user) {
      fetchUserData();
      checkUserRole();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshKey]);

  const fetchUserData = async () => {
    if (!user) return;
    try {
      const [businessData, advertData, mediaData] = await Promise.all([
        supabase.from('businesses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('advertisements').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('media_services').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      ]);

      setBusinesses(businessData.data || []);
      setAdverts(advertData.data || []);
      setMediaServices(mediaData.data || []);
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  const checkUserRole = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id);

      if (data && data.length > 0) {
        setUserRole(data[0].role || 'user');
      }
    } catch (err) {
      console.error('Error checking user role:', err);
      setUserRole('user');
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const openTab = (tab: TabId) => {
    setActiveTab(tab);
    setShowForm(false);
    setEditingId(null);
  };

  const openCreateForm = (tab: TabId) => {
    setActiveTab(tab);
    setEditingId(null);
    setShowForm(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingId(null);
    setRefreshKey(k => k + 1);
    toast.success('Saved successfully');
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingId(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // Full class strings (not template-built) so Tailwind's compiler sees them
  const statCards = [
    { tab: 'businesses' as TabId, label: 'Businesses', count: businesses.length, icon: ShoppingBag, iconBg: 'bg-blue-100', iconText: 'text-blue-600', btn: 'bg-blue-600 hover:bg-blue-700', cta: 'Add Business' },
    { tab: 'adverts' as TabId, label: 'Adverts', count: adverts.length, icon: Award, iconBg: 'bg-purple-100', iconText: 'text-purple-600', btn: 'bg-purple-600 hover:bg-purple-700', cta: 'Create Advert' },
    { tab: 'media' as TabId, label: 'Media Services', count: mediaServices.length, icon: Film, iconBg: 'bg-pink-100', iconText: 'text-pink-600', btn: 'bg-pink-600 hover:bg-pink-700', cta: 'Add Service' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={20} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Welcome back,</h1>
              <p className="text-gray-600">{user.email}</p>
              <p className="text-xs text-gray-500">
                Role: {userRole === 'admin' ? 'Administrator' : userRole === 'media_service' ? 'Media Service' : 'Business'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/profile"
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
            >
              Edit Profile
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white hover:bg-red-600 rounded-lg transition text-sm font-medium"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Admin banner */}
        {userRole === 'admin' && (
          <div className="bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl p-6 mb-8 text-white">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
                  <Shield size={20} />
                  Admin Dashboard
                </h2>
                <p className="text-sm opacity-90">
                  Manage all users, businesses, adverts, and media services across the platform.
                </p>
              </div>
              <Link
                to="/admin"
                className="px-6 py-2 bg-white text-purple-600 font-medium rounded-lg hover:bg-gray-100 transition"
              >
                Open Admin Panel
              </Link>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-lg mb-8">
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex px-4" aria-label="Dashboard tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => openTab(tab.id)}
                  className={`flex items-center gap-2 py-4 px-4 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                    activeTab === tab.id
                      ? 'text-blue-600 border-blue-600'
                      : 'text-gray-600 border-transparent hover:text-gray-900'
                  }`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {statCards.map(card => (
                  <div key={card.tab} className="bg-gray-50 rounded-xl p-6 text-center border border-gray-100">
                    <div className={`w-12 h-12 ${card.iconBg} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                      <card.icon size={24} className={card.iconText} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{card.count}</h3>
                    <p className="text-gray-600 mb-4">{card.label}</p>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openTab(card.tab)}
                        className="px-4 py-2 bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium"
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => openCreateForm(card.tab)}
                        className={`inline-flex items-center gap-1 px-4 py-2 text-white rounded-lg text-sm font-medium ${card.btn}`}
                      >
                        <Plus size={14} />
                        {card.cta}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Businesses */}
            {activeTab === 'businesses' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Your Businesses</h2>
                  {!showForm && (
                    <button
                      onClick={() => openCreateForm('businesses')}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium"
                    >
                      <Plus size={14} />
                      Add Business
                    </button>
                  )}
                </div>
                {showForm && (
                  <BusinessForm editingId={editingId} onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
                )}
                <BusinessList key={`biz-${refreshKey}`} onEdit={handleEdit} />
              </div>
            )}

            {/* Adverts */}
            {activeTab === 'adverts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Your Advert Campaigns</h2>
                  {!showForm && (
                    <button
                      onClick={() => openCreateForm('adverts')}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg text-sm font-medium"
                    >
                      <Plus size={14} />
                      Create Advert
                    </button>
                  )}
                </div>
                {showForm && (
                  <AdvertForm editingId={editingId} onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
                )}
                <AdvertList key={`adv-${refreshKey}`} onEdit={handleEdit} />
              </div>
            )}

            {/* Media services */}
            {activeTab === 'media' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900">Your Media Services</h2>
                  {!showForm && (
                    <button
                      onClick={() => openCreateForm('media')}
                      className="inline-flex items-center gap-1 px-4 py-2 bg-pink-600 text-white hover:bg-pink-700 rounded-lg text-sm font-medium"
                    >
                      <Plus size={14} />
                      Add Service
                    </button>
                  )}
                </div>
                {showForm && (
                  <MediaForm editingId={editingId} onSuccess={handleFormSuccess} onCancel={handleFormCancel} />
                )}
                <MediaList key={`med-${refreshKey}`} onEdit={handleEdit} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
