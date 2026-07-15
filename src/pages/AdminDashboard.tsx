import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Business, Advertisement, MediaService, User as UserProfile } from '../types';
import { Shield, Users, ShoppingBag, Award, Film, Trash2, Search, ArrowLeft, RefreshCw, BadgeCheck } from 'lucide-react';

type AdminTab = 'users' | 'businesses' | 'adverts' | 'media';

const ROLES = ['business', 'media_service', 'admin'];

// Dev-only UI preview (http://localhost:5173/admin?preview). Compiled out of
// production builds; real protection is Supabase RLS, which still blocks all
// admin reads/writes for non-admin sessions regardless of this flag.
const DEV_PREVIEW =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview');

export default function AdminDashboard() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [search, setSearch] = useState('');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEV_PREVIEW) {
      setRole('admin');
      setCheckingRole(false);
      return;
    }
    if (authLoading) return; // wait for the session before deciding
    const checkRole = async () => {
      if (!authUser) {
        setRole(null);
        setCheckingRole(false);
        return;
      }
      const { data } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();
      setRole(data?.role || 'business');
      setCheckingRole(false);
    };
    checkRole();
  }, [authUser, authLoading]);

  useEffect(() => {
    if (role === 'admin') fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, businessRes, advertRes, mediaRes] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        supabase.from('advertisements').select('*').order('created_at', { ascending: false }),
        supabase.from('media_services').select('*').order('created_at', { ascending: false }),
      ]);
      setUsers(usersRes.data || []);
      setBusinesses(businessRes.data || []);
      setAdverts(advertRes.data || []);
      setMediaServices(mediaRes.data || []);

      const firstError = usersRes.error || businessRes.error || advertRes.error || mediaRes.error;
      if (firstError) toast.error(`Some data failed to load: ${firstError.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- mutations ------------------------------------------------------

  const updateUserRole = async (id: string, newRole: string) => {
    if (id === authUser?.id && newRole !== 'admin') {
      toast.error("You can't remove your own admin role");
      return;
    }
    const { error } = await supabase.from('users').update({ role: newRole }).eq('id', id);
    if (error) {
      toast.error(`Failed to update role: ${error.message}`);
    } else {
      setUsers(users.map(u => (u.id === id ? { ...u, role: newRole } : u)));
      toast.success('Role updated');
    }
  };

  const deleteRow = async (
    table: 'users' | 'businesses' | 'advertisements' | 'media_services',
    id: string,
    label: string
  ) => {
    if (table === 'users' && id === authUser?.id) {
      toast.error("You can't delete your own account");
      return;
    }
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    if (table === 'users') setUsers(users.filter(u => u.id !== id));
    if (table === 'businesses') setBusinesses(businesses.filter(b => b.id !== id));
    if (table === 'advertisements') setAdverts(adverts.filter(a => a.id !== id));
    if (table === 'media_services') setMediaServices(mediaServices.filter(m => m.id !== id));
    toast.success('Deleted');
  };

  const updateStatus = async (
    table: 'businesses' | 'advertisements' | 'media_services',
    id: string,
    status: string
  ) => {
    const { error } = await supabase.from(table).update({ status }).eq('id', id);
    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
      return;
    }
    if (table === 'businesses') setBusinesses(businesses.map(b => (b.id === id ? { ...b, status } : b)));
    if (table === 'advertisements') setAdverts(adverts.map(a => (a.id === id ? { ...a, status } : a)));
    if (table === 'media_services') setMediaServices(mediaServices.map(m => (m.id === id ? { ...m, status } : m)));
    toast.success('Status updated');
  };

  const toggleVerified = async (id: string, verified: boolean) => {
    const { error } = await supabase.from('businesses').update({ verified }).eq('id', id);
    if (error) {
      toast.error(`Failed to update verification: ${error.message}`);
      return;
    }
    setBusinesses(businesses.map(b => (b.id === id ? { ...b, verified } : b)));
    toast.success(verified ? 'Business verified' : 'Verification removed');
  };

  // ---- filtering ------------------------------------------------------

  const q = search.trim().toLowerCase();
  const match = (...fields: (string | undefined)[]) =>
    !q || fields.some(f => f?.toLowerCase().includes(q));

  const filteredUsers = users.filter(u => match(u.email, u.name, u.role));
  const filteredBusinesses = businesses.filter(b => match(b.name, b.category, b.location));
  const filteredAdverts = adverts.filter(a => match(a.title, a.category, a.type, a.location));
  const filteredMedia = mediaServices.filter(m => match(m.title, m.service_type));

  // ---- guards ---------------------------------------------------------

  if (checkingRole) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Checking permissions...</p>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <Shield size={32} className="text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You need administrator privileges to view this page.
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <ArrowLeft size={18} />
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: typeof Users; count: number }[] = [
    { id: 'users', label: 'Users', icon: Users, count: users.length },
    { id: 'businesses', label: 'Businesses', icon: ShoppingBag, count: businesses.length },
    { id: 'adverts', label: 'Adverts', icon: Award, count: adverts.length },
    { id: 'media', label: 'Media Services', icon: Film, count: mediaServices.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              <Shield size={20} className="text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-gray-600 text-sm">Manage all platform data</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAll}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
            >
              <ArrowLeft size={14} />
              My Dashboard
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`bg-white rounded-xl shadow p-5 text-left hover:shadow-md transition border-2 ${
                activeTab === t.id ? 'border-purple-500' : 'border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <t.icon size={20} className="text-purple-600" />
                <span className="text-2xl font-bold text-gray-900">{t.count}</span>
              </div>
              <p className="text-sm text-gray-600">{t.label}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-3 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={`Search ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm bg-white"
          />
        </div>

        {/* Tables */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <p className="text-gray-600 p-8 text-center">Loading platform data...</p>
          ) : (
            <div className="overflow-x-auto">
              {/* Users */}
              {activeTab === 'users' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {u.email}
                          {u.id === authUser?.id && (
                            <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">you</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{u.name || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={u.role || 'business'}
                            onChange={e => updateUserRole(u.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => deleteRow('users', u.id, `profile for ${u.email}`)}
                            title="Delete profile row (the auth account must be removed from the Supabase dashboard)"
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Businesses */}
              {activeTab === 'businesses' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Verified</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBusinesses.map(b => (
                      <tr key={b.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          <Link to={b.username ? `/${b.username}` : `/businesses/${b.id}`} className="hover:text-blue-600">{b.name}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{b.category}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{b.location || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => toggleVerified(b.id, !b.verified)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
                              b.verified
                                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={b.verified ? 'Click to remove verification' : 'Click to verify'}
                          >
                            <BadgeCheck size={14} />
                            {b.verified ? 'Verified' : 'Verify'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={b.status || 'open'}
                            onChange={e => updateStatus('businesses', b.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                          >
                            <option value="open">open</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => deleteRow('businesses', b.id, b.name)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredBusinesses.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No businesses found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Adverts */}
              {activeTab === 'adverts' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Pricing</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdverts.map(a => (
                      <tr key={a.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          <Link to={`/adverts/${a.id}`} className="hover:text-blue-600">{a.title}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{a.category || a.type || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{a.location || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {a.pricing ? `$${Number(a.pricing).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={a.status || 'active'}
                            onChange={e => updateStatus('advertisements', a.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                          >
                            <option value="active">active</option>
                            <option value="pending">pending</option>
                            <option value="completed">completed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => deleteRow('advertisements', a.id, a.title)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredAdverts.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">No adverts found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Media services */}
              {activeTab === 'media' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Pricing</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMedia.map(m => (
                      <tr key={m.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          <Link to={`/media/${m.id}`} className="hover:text-blue-600">{m.title}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{m.service_type}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{m.pricing ? `$${m.pricing}` : '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={m.status || 'open'}
                            onChange={e => updateStatus('media_services', m.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                          >
                            <option value="open">open</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => deleteRow('media_services', m.id, m.title)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredMedia.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">No media services found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          Note: deleting a user here removes their profile row and (via cascade) their content.
          The login account itself must be removed from Supabase Dashboard → Authentication.
        </p>
      </div>
    </div>
  );
}
