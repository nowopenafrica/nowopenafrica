import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { Business, Advert, MediaService } from '../types';
import { User, ShoppingBag, Award, Film, LogOut, Plus, Shield, LayoutGrid, CalendarCheck, MessageSquare, Inbox, Crown, Check, ArrowUpRight, Sparkles, Activity } from 'lucide-react';
import { getBusinessTier, getCreativeTier, nextBusinessTier } from '../data/pricingPlans';
import BusinessForm from '../components/dashboard/BusinessForm';
import BusinessList from '../components/dashboard/BusinessList';
import BusinessContentManager from '../components/dashboard/BusinessContentManager';
import GoLiveModal from '../components/live/GoLiveModal';
import TrustPanel from '../components/dashboard/TrustPanel';
import TeamManager from '../components/dashboard/TeamManager';
import NotificationsBell from '../components/dashboard/NotificationsBell';
import AdvertForm from '../components/dashboard/AdvertForm';
import AdvertList from '../components/dashboard/AdvertList';
import MediaForm from '../components/dashboard/MediaForm';
import MediaList from '../components/dashboard/MediaList';
import BusinessClockCard from '../components/dashboard/BusinessClockCard';
import BusinessTimeline from '../components/BusinessTimeline';
import { loadClockConfig, getBusinessHealth } from '../lib/businessStatus';
import { applySeo } from '../lib/seo';

type TabId = 'overview' | 'businesses' | 'adverts' | 'media' | 'inbox';

const TABS: { id: TabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'businesses', label: 'My Businesses', icon: ShoppingBag },
  { id: 'inbox', label: 'Bookings & Enquiries', icon: Inbox },
  { id: 'adverts', label: 'My Adverts', icon: Award },
  { id: 'media', label: 'My Media Services', icon: Film },
];

// Friendly labels for the booking module_key values (mirrors categoryFeatures).
const MODULE_LABELS: Record<string, string> = {
  rooms: 'Room booking', reservations: 'Table reservation', orders: 'Order',
  viewings: 'Property viewing', 'test-drive': 'Test drive', appointments: 'Appointment',
  classes: 'Class', sessions: 'Session', events: 'Event booking', trips: 'Trip / seat',
  admissions: 'Admission', consultations: 'Consultation', applications: 'Application',
  quotes: 'Quote request', requests: 'Service request', projects: 'Project enquiry',
  performances: 'Performance booking', repairs: 'Repair', service: 'Service booking',
  care: 'Childcare booking',
};
const moduleLabel = (key?: string | null): string =>
  !key ? 'Booking' : (MODULE_LABELS[key] ?? key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

interface PlanState {
  plan: string;
  creative_plan: string;
  plan_status: string;
  plan_billing_cycle: string | null;
  plan_renews_at: string | null;
}
const DEFAULT_PLAN_STATE: PlanState = {
  plan: 'starter', creative_plan: 'creative-starter', plan_status: 'active',
  plan_billing_cycle: null, plan_renews_at: null,
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { format } = useCurrency();
  const [businesses, setBusinesses] = useState<Business[]>([]);

  useEffect(() => {
    return applySeo({
      title: 'Dashboard — NowOpen Africa',
      description: 'Manage your NowOpen Africa business.',
      path: '/dashboard',
      robots: 'noindex, nofollow',
    });
  }, []);
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('user');
  const [planState, setPlanState] = useState<PlanState>(DEFAULT_PLAN_STATE);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Which entity's form is open, and which row it's editing (null = create)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Business whose services/products/gallery are being managed
  const [contentBusiness, setContentBusiness] = useState<Business | null>(null);
  // Business whose NowOpen Live modal (go live / schedule / history) is open
  const [goLiveBusiness, setGoLiveBusiness] = useState<Business | null>(null);
  // Business whose Trust & Verification panel is open
  const [trustBusiness, setTrustBusiness] = useState<Business | null>(null);
  // Business whose Team (members) manager is open
  const [teamBusiness, setTeamBusiness] = useState<Business | null>(null);
  // Bumping this remounts the list components so they refetch after a save
  const [refreshKey, setRefreshKey] = useState(0);

  // Which business the Business Clock (and the timeline / health panels beside
  // it) is showing. Defaults to the first; owners with more than one switch
  // between them from the clock's header. Falls back if the selected business
  // is deleted or the list reloads without it.
  const [clockBusinessId, setClockBusinessId] = useState<string | null>(null);
  const primaryBusiness =
    businesses.find((b) => String(b.id) === clockBusinessId) ?? businesses[0];
  const primaryHealth = useMemo(
    () => (primaryBusiness ? getBusinessHealth(primaryBusiness, loadClockConfig(primaryBusiness)) : null),
    [primaryBusiness]
  );

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

      const myBusinesses = businessData.data || [];
      setBusinesses(myBusinesses);
      setAdverts(advertData.data || []);
      setMediaServices(mediaData.data || []);

      // Incoming bookings + enquiries across the owner's businesses.
      const ids = myBusinesses.map((b) => b.id);
      if (ids.length > 0) {
        const [bookingData, enquiryData] = await Promise.all([
          supabase.from('business_bookings').select('*').in('business_id', ids).order('created_at', { ascending: false }),
          supabase.from('business_enquiries').select('*').in('business_id', ids).order('created_at', { ascending: false }),
        ]);
        setBookings(bookingData.data || []);
        setEnquiries(enquiryData.data || []);
      } else {
        setBookings([]);
        setEnquiries([]);
      }
    } catch (err) {
      console.error('Error fetching user data:', err);
    }
  };

  const updateBookingStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('business_bookings').update({ status }).eq('id', id);
    if (error) { toast.error('Could not update booking'); return; }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
    toast.success(`Booking ${status}`);
  };

  const checkUserRole = async () => {
    if (!user) return;
    // Try to read role + plan together. If the subscriptions migration hasn't
    // been applied yet (plan columns missing), fall back to role-only so the
    // dashboard still loads — the account just shows the free plan.
    const withPlan = await supabase
      .from('users')
      .select('role, plan, creative_plan, plan_status, plan_billing_cycle, plan_renews_at')
      .eq('id', user.id)
      .maybeSingle();

    if (!withPlan.error && withPlan.data) {
      const row = withPlan.data as any;
      setUserRole(row.role || 'user');
      setPlanState({
        plan: row.plan || 'starter',
        creative_plan: row.creative_plan || 'creative-starter',
        plan_status: row.plan_status || 'active',
        plan_billing_cycle: row.plan_billing_cycle ?? null,
        plan_renews_at: row.plan_renews_at ?? null,
      });
      return;
    }

    const roleOnly = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    setUserRole((roleOnly.data as any)?.role || 'user');
    setPlanState(DEFAULT_PLAN_STATE);
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  // Full class strings (not template-built) so Tailwind's compiler sees them
  const statCards = [
    { tab: 'businesses' as TabId, label: 'Businesses', count: businesses.length, icon: ShoppingBag, iconBg: 'bg-blue-100 dark:bg-blue-900/30', iconText: 'text-blue-600 dark:text-blue-400', btn: 'bg-blue-600 hover:bg-blue-700', cta: 'Add Business' },
    { tab: 'adverts' as TabId, label: 'Adverts', count: adverts.length, icon: Award, iconBg: 'bg-purple-100 dark:bg-purple-900/30', iconText: 'text-purple-600 dark:text-purple-400', btn: 'bg-purple-600 hover:bg-purple-700', cta: 'Create Advert' },
    { tab: 'media' as TabId, label: 'Media Services', count: mediaServices.length, icon: Film, iconBg: 'bg-pink-100 dark:bg-pink-900/30', iconText: 'text-pink-600 dark:text-pink-400', btn: 'bg-pink-600 hover:bg-pink-700', cta: 'Add Service' },
  ];

  const pendingBookings = bookings.filter((b) => (b.status || 'pending') === 'pending').length;
  const businessNameById: Record<string, string> = Object.fromEntries(businesses.map((b) => [String(b.id), b.name]));

  // Current subscription for this account (creative accounts see their creative
  // tier; everyone else sees the business tier). Every account has at least the
  // free Free Launch plan, provisioned at signup — and new business registrations
  // start on a 3-month all-access trial.
  const isCreativeAcct = userRole === 'media_service';
  const nowMs = Date.now();
  const renewMs = planState.plan_renews_at ? new Date(planState.plan_renews_at).getTime() : 0;
  const onTrial = planState.plan_status === 'trialing' && renewMs > nowMs;
  const trialExpired = planState.plan_status === 'trialing' && renewMs > 0 && renewMs <= nowMs;
  const trialDaysLeft = onTrial ? Math.max(1, Math.ceil((renewMs - nowMs) / 86_400_000)) : 0;

  const storedTierId = isCreativeAcct ? planState.creative_plan : planState.plan;
  // Once the trial lapses the account effectively reverts to the free tier.
  const currentTierId = trialExpired ? (isCreativeAcct ? 'creative-starter' : 'starter') : storedTierId;
  const tierObj: any = isCreativeAcct ? getCreativeTier(currentTierId) : getBusinessTier(currentTierId);
  const isFreePlan = !onTrial && currentTierId === (isCreativeAcct ? 'creative-starter' : 'starter');
  const upgradeTier = isCreativeAcct ? null : nextBusinessTier(currentTierId);
  const annualCycle = planState.plan_billing_cycle === 'annual';
  const planRenews = planState.plan_renews_at ? new Date(planState.plan_renews_at).toLocaleDateString() : null;
  const planPriceLabel = onTrial
    ? `Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left`
    : tierObj?.custom
      ? 'Custom pricing'
      : isFreePlan
        ? 'Free forever'
        : !isCreativeAcct && annualCycle
          ? `${format(tierObj?.annualUsd ?? 0)}/year`
          : `${format(tierObj?.monthlyUsd ?? 0)}/month`;
  const planMetaSuffix = onTrial && planRenews ? ` · ends ${planRenews}`
    : !isFreePlan && !onTrial && planRenews ? ` · renews ${planRenews}` : '';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <User size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back,</h1>
              <p className="text-gray-600 dark:text-gray-400">{user.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Role: {userRole === 'admin' ? 'Administrator' : userRole === 'media_service' ? 'Media Service' : 'Business'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell userId={user.id} />
            <Link
              to="/studio"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium"
            >
              <Sparkles size={14} /> Studio
            </Link>
            <Link
              to="/profile"
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm font-medium"
            >
              Edit Profile
            </Link>
            <Link
              to="/security"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm font-medium"
            >
              <Shield size={14} /> Security
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
          <div className="rounded-xl p-6 mb-8 text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4c1d95 20%, #831843 40%, #9a3412 60%, #92400e 80%, #166534 100%)' }}>
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
              <div className="flex items-center gap-2">
                <Link
                  to="/admin-creator"
                  className="px-6 py-2 bg-white text-purple-600 font-medium rounded-lg hover:bg-gray-100 transition"
                >
                  Admin Creator
                </Link>
                <Link
                  to="/admin"
                  className="px-6 py-2 bg-white/20 text-white font-medium rounded-lg hover:bg-white/30 transition"
                >
                  Open Admin Panel
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            <nav className="flex px-4" aria-label="Dashboard tabs">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => openTab(tab.id)}
                  className={`flex items-center gap-2 py-4 px-4 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                    activeTab === tab.id
                      ? 'text-blue-600 dark:text-blue-400 border-blue-600'
                      : 'text-gray-600 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-white'
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
              <div className="space-y-6">
              {/* Your plan / subscription */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Crown size={24} className="text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-gray-900 dark:text-white">
                          {tierObj?.name ?? 'Free Launch'} plan{onTrial ? ' — all access' : ''}
                        </p>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          onTrial ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                          : isFreePlan ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'}`}>
                          {onTrial ? 'Free trial' : isFreePlan ? 'Free' : planState.plan_status === 'active' ? 'Active' : planState.plan_status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {planPriceLabel}{planMetaSuffix}
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition"
                  >
                    {onTrial ? 'Choose a plan' : isFreePlan ? (upgradeTier ? `Upgrade to ${upgradeTier.name}` : 'View plans') : 'Manage plan'}
                    <ArrowUpRight size={15} />
                  </Link>
                </div>
                {tierObj?.features?.length ? (
                  <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                    {tierObj.features.slice(0, 6).map((f: string) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
                        <Check size={14} className="text-green-500 mt-0.5 flex-shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {/* Live Business Clock — the owner's master open/closed switch */}
              {primaryBusiness && primaryHealth && (
                <div className="space-y-6">
                  <BusinessClockCard
                    business={primaryBusiness}
                    businesses={businesses}
                    onSelectBusiness={setClockBusinessId}
                  />
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-5">
                      <BusinessTimeline business={primaryBusiness} config={loadClockConfig(primaryBusiness)} />
                    </div>
                    <div className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Activity size={16} className="text-purple-600 dark:text-purple-400" />
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">Business Health</h3>
                        <span className="ml-auto text-sm font-bold text-gray-900 dark:text-white">{primaryHealth.score}%</span>
                      </div>
                      <div className="space-y-2.5">
                        {primaryHealth.parts.map((p) => (
                          <div key={p.label}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-600 dark:text-gray-400">{p.label}</span>
                              <span className="font-semibold text-gray-900 dark:text-white">{p.score}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${p.score >= 70 ? 'bg-green-500' : p.score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                                style={{ width: `${p.score}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Incoming bookings + enquiries summary */}
              <button
                onClick={() => openTab('inbox')}
                className="w-full flex items-center justify-between gap-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-5 text-left hover:border-blue-300 dark:hover:border-blue-700 transition"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Inbox size={24} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white">Bookings &amp; enquiries</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {bookings.length} booking{bookings.length !== 1 ? 's' : ''} · {enquiries.length} enquir{enquiries.length !== 1 ? 'ies' : 'y'}
                      {pendingBookings > 0 && <span className="text-amber-600 dark:text-amber-400 font-medium"> · {pendingBookings} pending</span>}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">View →</span>
              </button>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {statCards.map(card => (
                  <div key={card.tab} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-6 text-center border border-gray-100 dark:border-gray-800">
                    <div className={`w-12 h-12 ${card.iconBg} rounded-lg flex items-center justify-center mx-auto mb-4`}>
                      <card.icon size={24} className={card.iconText} />
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{card.count}</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">{card.label}</p>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openTab(card.tab)}
                        className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium"
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
              </div>
            )}

            {/* Bookings & Enquiries (incoming) */}
            {activeTab === 'inbox' && (
              <div className="space-y-8">
                {/* Bookings */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <CalendarCheck size={18} className="text-blue-600 dark:text-blue-400" />
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Bookings received</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{bookings.length}</span>
                  </div>
                  {bookings.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No bookings yet. When customers book from your business profiles, they'll appear here.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bookings.map((b) => (
                        <div key={b.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[11px] font-semibold">{moduleLabel(b.module_key)}</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white">{businessNameById[String(b.business_id)] || 'Business'}</span>
                              </div>
                              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                                {Array.isArray(b.items) && b.items.length > 0
                                  ? b.items.map((it: any) => `${it.quantity ?? 1}× ${it.name}`).join(', ')
                                  : (b.item_name || '—')}
                              </p>
                              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                {b.customer_name}{b.customer_phone ? ` · ${b.customer_phone}` : ''}{b.customer_email ? ` · ${b.customer_email}` : ''}
                              </p>
                              {(b.requested_date || b.requested_time || b.quantity) && (
                                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                  {b.requested_date ? new Date(b.requested_date).toLocaleDateString() : ''}
                                  {b.requested_time ? ` · ${b.requested_time}` : ''}
                                  {b.quantity ? ` · qty ${b.quantity}` : ''}
                                </p>
                              )}
                            </div>
                            <select
                              value={b.status || 'pending'}
                              onChange={(e) => updateBookingStatus(b.id, e.target.value)}
                              className="px-2.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-800 dark:text-white flex-shrink-0"
                            >
                              <option value="pending">Pending</option>
                              <option value="confirmed">Confirmed</option>
                              <option value="declined">Declined</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Enquiries */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <MessageSquare size={18} className="text-purple-600 dark:text-purple-400" />
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Enquiries</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{enquiries.length}</span>
                  </div>
                  {enquiries.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      No enquiries yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {enquiries.map((e) => (
                        <div key={e.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{businessNameById[String(e.business_id)] || 'Business'}</span>
                            {e.context ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{e.context}</span> : null}
                          </div>
                          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{e.message}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {e.name}{e.phone ? ` · ${e.phone}` : ''}{e.email ? ` · ${e.email}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Businesses */}
            {activeTab === 'businesses' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Businesses</h2>
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
                {contentBusiness && (
                  <BusinessContentManager
                    businessId={String(contentBusiness.id)}
                    businessName={contentBusiness.name}
                    category={contentBusiness.category}
                    enabledModules={(contentBusiness as any).enabled_modules ?? null}
                    onClose={() => setContentBusiness(null)}
                  />
                )}
                <BusinessList
                  key={`biz-${refreshKey}`}
                  onEdit={handleEdit}
                  onManageContent={(business) => { setContentBusiness(business); setShowForm(false); }}
                  onGoLive={(business) => setGoLiveBusiness(business)}
                  onManageTrust={(business) => setTrustBusiness(business)}
                  onManageTeam={(business) => setTeamBusiness(business)}
                />
                {goLiveBusiness && (
                  <GoLiveModal
                    business={{ id: String(goLiveBusiness.id), name: goLiveBusiness.name }}
                    onClose={() => setGoLiveBusiness(null)}
                  />
                )}
                {trustBusiness && (
                  <TrustPanel
                    businessId={String(trustBusiness.id)}
                    businessName={trustBusiness.name}
                    onClose={() => setTrustBusiness(null)}
                    onSaved={() => setRefreshKey((k) => k + 1)}
                  />
                )}
                {teamBusiness && (
                  <TeamManager
                    businessId={String(teamBusiness.id)}
                    businessName={teamBusiness.name}
                    onClose={() => setTeamBusiness(null)}
                  />
                )}
              </div>
            )}

            {/* Adverts */}
            {activeTab === 'adverts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Advert Campaigns</h2>
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
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Your Media Services</h2>
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
