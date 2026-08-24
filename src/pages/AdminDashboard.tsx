import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import {
  canAccessTab, canDelete, canManageRoles, canManagePlans, isStaff, isEditor,
  ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, type AdminTabId,
} from '../lib/permissions';
import { loadHeroSettings, saveHeroSettings, heroBackground, DEFAULT_HERO, type HeroSettings } from '../lib/heroSettings';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import { Business, Advertisement, MediaService, User as UserProfile } from '../types';
import {
  Shield, Users, ShoppingBag, Award, Film, Trash2, Search, ArrowLeft, RefreshCw, BadgeCheck,
  CalendarCheck, CreditCard, ListChecks, FileText, MessageSquare, Upload, Video, LayoutGrid, ShieldCheck,
  Crown, Eye, Inbox, History, ClipboardList,
} from 'lucide-react';
import { APPLICATION_STATUS_LABELS, hubRelationshipById } from '../lib/formsEngine';
import { NOWOPEN_ORG_ID } from '../lib/workforce';
import TrustPanel from '../components/dashboard/TrustPanel';
import TrustBadge from '../components/TrustBadge';
import { getBusinessTier, BUSINESS_TIERS } from '../data/pricingPlans';
import { logAudit } from '../lib/audit';
import { createNotification } from '../lib/notifications';

type AdminTab = AdminTabId;

type DeletableTable = 'users' | 'businesses' | 'advertisements' | 'media_services' | 'business_bookings' | 'payment_intents' | 'waitlist' | 'business_registrations' | 'platform_enquiries';



// Friendly labels for the per-industry booking/cart module_key values written
// by categoryFeatures.ts, so the admin Bookings view reads "Test Drive" instead
// of the raw "test-drive" slug. Falls back to a title-cased slug for anything new.
const MODULE_LABELS: Record<string, string> = {
  rooms: 'Room booking', reservations: 'Table reservation', orders: 'Order',
  viewings: 'Property viewing', 'test-drive': 'Test drive', appointments: 'Appointment',
  classes: 'Class', sessions: 'Session', events: 'Event booking', trips: 'Trip / seat',
  admissions: 'Admission', consultations: 'Consultation', applications: 'Application',
  quotes: 'Quote request', requests: 'Service request', projects: 'Project enquiry',
  performances: 'Performance booking', repairs: 'Repair', service: 'Service booking',
  care: 'Childcare booking',
};
const moduleLabel = (key?: string | null): string => {
  if (!key) return '';
  return MODULE_LABELS[key] ?? key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

// Dev-only UI preview (http://localhost:5173/admin?preview, or the local dev
// server automatically in mode 'development'). Compiled out of production
// builds; real protection is Supabase RLS, which still blocks all admin
// reads/writes for non-admin sessions regardless of these flags.
const DEV_PREVIEW =
  import.meta.env.MODE === 'development' ||
  (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));

export default function AdminDashboard() {
  const { user: authUser, loading: authLoading } = useAuth();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    return applySeo({
      title: 'Admin Console — NowOpen Africa',
      description: 'NowOpen Africa administration console.',
      path: '/admin',
      robots: 'noindex, nofollow',
    });
  }, []);

  const [checkingRole, setCheckingRole] = useState(true);
  /**
   * The open section lives in the URL.
   *
   * Without it an admin could not send a colleague "look at the deletion
   * requests", a refresh dropped them back on Overview part-way through a
   * review queue, and Back left the console entirely rather than returning to
   * the previous section. `replace` so stepping through sections does not bury
   * the page they came from.
   *
   * Validated against the tabs this ROLE may open, so a hand-edited ?tab= can
   * never put an editor in front of a section the permission layer withholds.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const [trustReviewBiz, setTrustReviewBiz] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ table: DeletableTable; id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [adverts, setAdverts] = useState<Advertisement[]>([]);
  const [mediaServices, setMediaServices] = useState<MediaService[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [waitlistEntries, setWaitlistEntries] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [verificationDocs, setVerificationDocs] = useState<any[]>([]);
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  const [resolvingReq, setResolvingReq] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroVideos, setHeroVideos] = useState<{ name: string; url: string }[]>([]);
  const [hero, setHero] = useState<HeroSettings>(DEFAULT_HERO);
  const [heroSaving, setHeroSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const HERO_BUCKET = 'hero-videos';

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
    if (isStaff(role)) { fetchAll(); fetchHeroVideos(); loadHeroSettings().then(setHero); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [usersRes, businessRes, advertRes, mediaRes, bookingsRes, paymentsRes, waitlistRes, registrationsRes, enquiriesRes] = await Promise.all([
        supabase.from('users').select('*').order('created_at', { ascending: false }),
        supabase.from('businesses').select('*').order('created_at', { ascending: false }),
        supabase.from('advertisements').select('*').order('created_at', { ascending: false }),
        supabase.from('media_services').select('*').order('created_at', { ascending: false }),
        supabase.from('business_bookings').select('*').order('created_at', { ascending: false }),
        supabase.from('payment_intents').select('*').order('created_at', { ascending: false }),
        supabase.from('waitlist').select('*').order('created_at', { ascending: false }),
        supabase.from('business_registrations').select('*').order('created_at', { ascending: false }),
        supabase.from('platform_enquiries').select('*').order('created_at', { ascending: false }),
      ]);
      setUsers(usersRes.data || []);
      setBusinesses(businessRes.data || []);
      setAdverts(advertRes.data || []);
      setMediaServices(mediaRes.data || []);
      setBookings(bookingsRes.data || []);
      setPayments(paymentsRes.data || []);
      setWaitlistEntries(waitlistRes.data || []);
      setRegistrations(registrationsRes.data || []);
      setEnquiries(enquiriesRes.data || []);

      // These newer tables may not exist yet on a project that hasn't run
      // the latest migrations — fail soft (empty list) rather than blocking
      // the whole panel, but still surface it so it's not silently missed.
      const firstError = usersRes.error || businessRes.error || advertRes.error || mediaRes.error
        || bookingsRes.error || paymentsRes.error || waitlistRes.error || registrationsRes.error || enquiriesRes.error;
      if (firstError) toast.error(`Some data failed to load: ${firstError.message}`);

      // Newer subsystems — subscriptions & verification. These tables only
      // exist once the latest migrations are applied, so load them separately
      // and fail soft (empty) rather than blocking or nagging the whole panel.
      const [subsRes, docsRes, reqRes, auditRes, appsRes] = await Promise.all([
        supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('verification_documents').select('*').order('created_at', { ascending: false }),
        supabase.from('deletion_requests').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('os_form_applications').select('*').eq('org_id', NOWOPEN_ORG_ID).order('submitted_at', { ascending: false }),
      ]);
      setSubscriptions(subsRes.data || []);
      setVerificationDocs(docsRes.data || []);
      setDeletionRequests(reqRes.data || []);
      setAuditLog(auditRes.data || []);
      // OS Forms Hub ledger (applications) — newer OS table, fail soft (empty)
      // like the other newer subsystems rather than blocking the panel.
      setApplications(appsRes.data || []);
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
      logAudit(authUser, 'update_user_role', 'users', id, { role: newRole });
    }
  };

  // Change/upgrade a user's business plan. The DB plan-column guard now allows
  // admins (see the admin_plan_and_notifications migration), so this write
  // sticks. We also record it in the audit log and notify the user.
  const updateUserPlan = async (id: string, newPlan: string) => {
    const tier = getBusinessTier(newPlan);
    const { data, error } = await supabase
      .from('users')
      .update({
        plan: newPlan,
        plan_status: 'active',
        plan_updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('plan')
      .maybeSingle();

    // The guard trigger silently reverts the value for non-admins; if the
    // returned plan doesn't match, the migration likely isn't applied yet.
    if (error) {
      toast.error(`Failed to change plan: ${error.message}`);
      return;
    }
    if (data && data.plan !== newPlan) {
      toast.error('Plan change was blocked by the database. Apply the latest migrations (admin plan guard).');
      return;
    }

    setUsers(users.map(u => (u.id === id ? ({ ...u, plan: newPlan, plan_status: 'active' } as UserProfile) : u)));
    toast.success(`Plan set to ${tier?.name || newPlan}`);
    logAudit(authUser, 'update_user_plan', 'users', id, { plan: newPlan });
    // Let the business owner know from their dashboard notifications.
    createNotification({
      userId: id,
      title: `Your plan is now ${tier?.name || newPlan}`,
      body: 'An administrator updated your NowOpen Africa subscription. Your new plan features are active.',
      type: 'plan',
      link: '/pricing',
    });
  };

  // Opens the in-app confirmation modal. (Native window.confirm() is
  // unreliable — some browsers/webviews suppress it, which made the delete
  // button feel unresponsive. The modal below is the actual confirm step.)
  const deleteRow = (table: DeletableTable, id: string, label: string) => {
    // Defence in depth behind the hidden buttons. RLS is the real boundary, but
    // failing here gives a clear message instead of a silent empty result.
    if (!canDelete(role)) {
      toast.error('Only an admin can delete records.');
      return;
    }
    if (table === 'users' && id === authUser?.id) {
      toast.error("You can't delete your own account");
      return;
    }
    setDeleteTarget({ table, id, label });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { table, id } = deleteTarget;
    setDeleting(true);
    // `.select()` makes the delete return the rows it actually removed. Without
    // it, RLS that blocks the delete returns no error AND no rows — which would
    // otherwise look like success. Checking the returned rows surfaces the real
    // outcome (0 rows == permission/RLS problem, not a silent success).
    const { data, error } = await supabase.from(table).delete().eq('id', id).select();
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error(
        'Nothing was deleted. You need an admin role, and the admin RLS policies ' +
        'must be applied (scripts/sql/apply_all_migrations.sql).'
      );
      return;
    }
    if (table === 'users') setUsers(users.filter(u => u.id !== id));
    if (table === 'businesses') setBusinesses(businesses.filter(b => b.id !== id));
    if (table === 'advertisements') setAdverts(adverts.filter(a => a.id !== id));
    if (table === 'media_services') setMediaServices(mediaServices.filter(m => m.id !== id));
    if (table === 'business_bookings') setBookings(bookings.filter(b => b.id !== id));
    if (table === 'payment_intents') setPayments(payments.filter(p => p.id !== id));
    if (table === 'waitlist') setWaitlistEntries(waitlistEntries.filter(w => w.id !== id));
    if (table === 'business_registrations') setRegistrations(registrations.filter(r => r.id !== id));
    if (table === 'platform_enquiries') setEnquiries(enquiries.filter(e => e.id !== id));
    toast.success('Deleted');
    logAudit(authUser, 'delete', table, id, { label: deleteTarget.label });
  };

  // Approve = perform the actual delete of the requested entity, then mark the
  // request approved. Reject = just mark it rejected (the listing stays).
  const resolveDeletionRequest = async (req: any, decision: 'approved' | 'rejected') => {
    setResolvingReq(req.id);
    try {
      if (decision === 'approved') {
        const tableByType: Record<string, DeletableTable> = {
          business: 'businesses', advert: 'advertisements', media: 'media_services',
        };
        const table = tableByType[req.entity_type];
        if (table) {
          const { data, error } = await supabase.from(table).delete().eq('id', req.entity_id).select();
          if (error) { toast.error(`Delete failed: ${error.message}`); return; }
          if (!data || data.length === 0) {
            toast.error('Nothing was deleted — the admin RLS policies may not be applied (scripts/sql/apply_all_migrations.sql).');
            return;
          }
          if (table === 'businesses') setBusinesses(prev => prev.filter(b => b.id !== req.entity_id));
          if (table === 'advertisements') setAdverts(prev => prev.filter(a => a.id !== req.entity_id));
          if (table === 'media_services') setMediaServices(prev => prev.filter(m => m.id !== req.entity_id));
        }
      }
      const { error: updErr } = await supabase.from('deletion_requests')
        .update({ status: decision, reviewed_by: authUser?.id ?? null, reviewed_at: new Date().toISOString() })
        .eq('id', req.id);
      if (updErr) { toast.error(`Could not update request: ${updErr.message}`); return; }
      setDeletionRequests(prev => prev.map(r => (r.id === req.id ? { ...r, status: decision } : r)));
      toast.success(decision === 'approved' ? 'Approved & deleted' : 'Request rejected');
      logAudit(authUser, decision === 'approved' ? 'approve_deletion' : 'reject_deletion', req.entity_type, req.entity_id, { label: req.entity_label });
    } finally {
      setResolvingReq(null);
    }
  };

  const updateStatus = async (
    table: 'businesses' | 'advertisements' | 'media_services' | 'business_bookings' | 'payment_intents' | 'business_registrations',
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
    if (table === 'business_bookings') setBookings(bookings.map(b => (b.id === id ? { ...b, status } : b)));
    if (table === 'payment_intents') setPayments(payments.map(p => (p.id === id ? { ...p, status } : p)));
    if (table === 'business_registrations') setRegistrations(registrations.map(r => (r.id === id ? { ...r, status } : r)));
    toast.success('Status updated');
  };

  const toggleWaitlistInvited = async (id: string, invited: boolean) => {
    const { error } = await supabase.from('waitlist').update({ invited }).eq('id', id);
    if (error) {
      toast.error(`Failed to update: ${error.message}`);
      return;
    }
    setWaitlistEntries(waitlistEntries.map(w => (w.id === id ? { ...w, invited } : w)));
    toast.success(invited ? 'Marked as invited' : 'Invited flag removed');
  };

  const toggleVerified = async (id: string, verified: boolean) => {
    const { error } = await supabase.from('businesses').update({ verified }).eq('id', id);
    if (error) {
      toast.error(`Failed to update verification: ${error.message}`);
      return;
    }
    setBusinesses(businesses.map(b => (b.id === id ? { ...b, verified } : b)));
    toast.success(verified ? 'Business verified' : 'Verification removed');
    logAudit(authUser, verified ? 'verify_business' : 'unverify_business', 'businesses', id);
  };

  // ---- hero video slider management ------------------------------------

  // Optimistic: the switch moves immediately, and reverts if the write fails.
  // A toggle that waits on a round trip before responding feels broken.
  const updateHero = async (patch: Partial<HeroSettings>) => {
    const next = { ...hero, ...patch };
    const previous = hero;
    setHero(next);
    setHeroSaving(true);
    const res = await saveHeroSettings(next, authUser?.id);
    setHeroSaving(false);
    if (res.ok) {
      toast.success('Homepage banner updated');
      logAudit(authUser, 'update', 'site_settings', 'hero_banner', next);
    } else {
      setHero(previous);
      toast.error(res.error ?? 'Could not save the banner settings.');
    }
  };

  const fetchHeroVideos = async () => {
    const { data, error } = await supabase.storage.from(HERO_BUCKET).list('', { limit: 20, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      toast.error(`Failed to load hero videos: ${error.message}`);
      return;
    }
    const files = (data || []).filter(f => /\.(mp4|webm|ogg)$/i.test(f.name));
    const withUrls = files.map(f => ({
      name: f.name,
      url: supabase.storage.from(HERO_BUCKET).getPublicUrl(f.name).data.publicUrl,
    }));
    setHeroVideos(withUrls);
  };

  const uploadHeroVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('Please select a video file');
      return;
    }
    if (heroVideos.length >= 10) {
      toast.error('Maximum 10 hero videos allowed. Delete one first.');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'mp4';
      const filename = `hero-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(HERO_BUCKET).upload(filename, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      toast.success('Video uploaded successfully');
      await fetchHeroVideos();
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteHeroVideo = async (filename: string) => {
    if (!window.confirm(`Delete hero video "${filename}"? This cannot be undone.`)) return;
    const { error } = await supabase.storage.from(HERO_BUCKET).remove([filename]);
    if (error) {
      toast.error(`Delete failed: ${error.message}`);
      return;
    }
    setHeroVideos(prev => prev.filter(v => v.name !== filename));
    toast.success('Video deleted');
  };

  // ---- filtering ------------------------------------------------------

  const q = search.trim().toLowerCase();
  const match = (...fields: (string | undefined)[]) =>
    !q || fields.some(f => f?.toLowerCase().includes(q));

  const filteredUsers = users.filter(u => match(u.email, u.name, u.role));
  const filteredBusinesses = businesses.filter(b => match(b.name, b.category, b.location));
  const filteredAdverts = adverts.filter(a => match(a.title, a.category, a.type, a.location));
  const filteredMedia = mediaServices.filter(m => match(m.title, m.service_type));
  const businessNameById = Object.fromEntries(businesses.map(b => [String(b.id), b.name]));
  const filteredBookings = bookings.filter(b => match(businessNameById[b.business_id], b.customer_name, b.customer_email, b.item_name, b.status));
  const filteredPayments = payments.filter(p => match(p.item_title, p.email, p.kind, p.status, p.provider, p.currency));
  const filteredWaitlist = waitlistEntries.filter(w => match(w.name, w.email, w.business_type, w.country));
  const filteredRegistrations = registrations.filter(r => match(r.business_name, r.category, r.location, r.email, r.phone));
  const filteredApplications = applications.filter(a => match(a.reference, a.applicant_name, a.email, a.relationship, a.status));
  const filteredEnquiries = enquiries.filter(e => match(e.item_title, e.name, e.email, e.kind, e.message));
  const userEmailById = Object.fromEntries(users.map(u => [String(u.id), u.email]));
  const filteredSubscriptions = subscriptions.filter(s => match(userEmailById[s.user_id], s.tier, s.kind, s.status, s.billing_cycle));
  const filteredVerificationDocs = verificationDocs.filter(d => match(businessNameById[d.business_id], d.doc_type, d.status));
  const filteredDeletionRequests = deletionRequests.filter(r => match(r.entity_label, r.entity_type, r.status, userEmailById[r.requester_id]));
  const filteredAudit = auditLog.filter(a => match(a.action, a.entity_type, a.actor_email, a.entity_id));

  // ---- guards ---------------------------------------------------------

  if (checkingRole) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">Checking permissions...</p>
      </div>
    );
  }

  if (!isStaff(role)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <Shield size={32} className="text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You need administrator or editor privileges to view this page.
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

  const allTabs: { id: AdminTab; label: string; icon: typeof Users; count: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid, count: 0 },
    { id: 'users', label: 'Users', icon: Users, count: users.length },
    { id: 'businesses', label: 'Businesses', icon: ShoppingBag, count: businesses.length },
    { id: 'verification', label: 'Verification', icon: ShieldCheck, count: verificationDocs.filter((d: any) => (d.status || 'pending') === 'pending').length },
    { id: 'subscriptions', label: 'Subscriptions', icon: Crown, count: subscriptions.filter((s: any) => s.status === 'active').length },
    { id: 'requests', label: 'Deletion Requests', icon: Inbox, count: deletionRequests.filter((r: any) => (r.status || 'pending') === 'pending').length },
    { id: 'adverts', label: 'Adverts', icon: Award, count: adverts.length },
    { id: 'media', label: 'Media Services', icon: Film, count: mediaServices.length },
    { id: 'bookings', label: 'Bookings', icon: CalendarCheck, count: bookings.length },
    { id: 'payments', label: 'Payments', icon: CreditCard, count: payments.length },
    { id: 'waitlist', label: 'Waitlist', icon: ListChecks, count: waitlistEntries.length },
    { id: 'registrations', label: 'Registrations', icon: FileText, count: registrations.length },
    { id: 'applications', label: 'Applications', icon: ClipboardList, count: applications.length },
    { id: 'enquiries', label: 'Enquiries', icon: MessageSquare, count: enquiries.length },
    { id: 'audit', label: 'Audit Log', icon: History, count: auditLog.length },
    { id: 'hero-videos', label: 'Hero Videos', icon: Video, count: heroVideos.length },
  ];
  const tabs = allTabs.filter(t => canAccessTab(role, t.id));

  const tabParam = searchParams.get('tab');
  const activeTab: AdminTab = tabs.some(t => t.id === tabParam) ? (tabParam as AdminTab) : 'overview';
  const setActiveTab = (id: AdminTab) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center">
              <Shield size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {isEditor(role) ? 'Editor Panel' : 'Admin Panel'}
              </h1>
              {/* Name the limits rather than leaving an editor to infer them
                  from missing tabs — absence reads as a bug, not a boundary. */}
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {isEditor(role)
                  ? 'Homepage and listing content. Accounts, payments, verification and deletion are admin-only.'
                  : 'Manage all platform data'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAll}
              className="inline-flex items-center gap-2 px-4 min-h-[44px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm font-medium"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-4 min-h-[44px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm font-medium"
            >
              <ArrowLeft size={14} />
              My Dashboard
            </Link>
          </div>
        </div>

        {/* The count cards ARE the navigation, so they need to say so. They
            were plain buttons: nothing announced them as a group, nothing
            announced which one was open, and the only selected cue was a 2px
            border — invisible to a screen reader and easy to miss by eye. */}
        <div role="tablist" aria-label="Admin sections" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              id={`admin-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={activeTab === t.id}
              aria-controls="admin-tabpanel"
              tabIndex={activeTab === t.id ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
                setActiveTab(next.id);
                document.getElementById(`admin-tab-${next.id}`)?.focus();
              }}
              onClick={() => setActiveTab(t.id)}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow p-5 text-left hover:shadow-md transition border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                activeTab === t.id
                  ? 'border-purple-500 ring-1 ring-purple-200 dark:ring-purple-900'
                  : 'border-transparent'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <t.icon size={20} className="text-purple-600 dark:text-purple-400" />
                {t.id !== 'overview' && <span className="text-2xl font-bold text-gray-900 dark:text-white">{t.count}</span>}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t.label}</p>
            </button>
          ))}
        </div>

        {/* Search (hidden on overview) */}
        {activeTab !== 'overview' && (
          <div className="relative mb-6 max-w-md">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={`Search ${tabs.find(t => t.id === activeTab)?.label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm bg-white dark:bg-gray-800"
            />
          </div>
        )}

        {/* Overview — "what needs attention" */}
        {activeTab === 'overview' && !loading && (() => {
          const pendingBookings = bookings.filter((b: any) => (b.status || 'pending') === 'pending').length;
          const paidPayments = payments.filter((p: any) => p.status === 'paid').length;
          const unverified = businesses.filter((b: any) => !b.verified).length;
          const uninvited = waitlistEntries.filter((w: any) => !w.invited).length;
          const totalListings = businesses.length + adverts.length + mediaServices.length;
          const pendingDocs = verificationDocs.filter((d: any) => (d.status || 'pending') === 'pending').length;
          const activeSubs = subscriptions.filter((s: any) => s.status === 'active').length;
          const onTrial = users.filter((u: any) => u.plan_status === 'trialing').length;
          const tieredBusinesses = businesses.filter((b: any) => b.verification_tier && b.verification_tier !== 'none').length;
          const pendingReqs = deletionRequests.filter((r: any) => (r.status || 'pending') === 'pending').length;
          const pendingApps = applications.filter((a: any) =>
            ['new', 'screening', 'under-review', 'interview', 'qualification', 'discussion', 'proposal', 'nda', 'documents', 'agreement'].includes(a.status)).length;
          const action = [
            { label: 'Deletion requests', value: pendingReqs, tab: 'requests' as AdminTab, tone: 'rose', icon: Inbox },
            { label: 'Documents to review', value: pendingDocs, tab: 'verification' as AdminTab, tone: 'emerald', icon: ShieldCheck },
            { label: 'Bookings pending', value: pendingBookings, tab: 'bookings' as AdminTab, tone: 'amber', icon: CalendarCheck },
            { label: 'Registrations to review', value: registrations.length, tab: 'registrations' as AdminTab, tone: 'blue', icon: FileText },
            { label: 'Applications pending', value: pendingApps, tab: 'applications' as AdminTab, tone: 'emerald', icon: ClipboardList },
            { label: 'Enquiries to review', value: enquiries.length, tab: 'enquiries' as AdminTab, tone: 'purple', icon: MessageSquare },
            { label: 'Businesses to verify', value: unverified, tab: 'businesses' as AdminTab, tone: 'rose', icon: BadgeCheck },
          ];
          const tone: Record<string, string> = {
            amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300',
            blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
            purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
            rose: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300',
            emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300',
          };
          const health = [
            { label: 'Total users', value: users.length },
            { label: 'Total listings', value: totalListings },
            { label: 'Verified businesses', value: `${businesses.length - unverified}/${businesses.length}` },
            { label: 'Tier-verified (Bronze+)', value: tieredBusinesses },
            { label: 'Active subscriptions', value: activeSubs },
            { label: 'On free trial', value: onTrial },
            { label: 'Paid payments', value: `${paidPayments}/${payments.length}` },
            { label: 'Waitlist — not invited', value: uninvited },
            { label: 'Live media services', value: mediaServices.length },
          ];
          return (
            <div id="admin-tabpanel" role="tabpanel" aria-labelledby="admin-tab-overview" className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 space-y-8">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Needs attention</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Open items across the platform — click to jump in.</p>
                {/* Only queues with something in them. Every row rendered as a
                    coloured alert card whatever its count, so four red and amber
                    tiles reading "0" sat beside the two that actually needed
                    work — a panel called "needs attention" that mostly did not.
                    Empty queues move to a quiet line underneath, so the colour
                    on this panel always means something. */}
                {(() => {
                  const open = action.filter((a) => Number(a.value) > 0);
                  const clear = action.filter((a) => !(Number(a.value) > 0));
                  return (
                    <>
                      {open.length > 0 ? (
                        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {open.map((a) => (
                            <button
                              key={a.label}
                              onClick={() => setActiveTab(a.tab)}
                              className={`rounded-xl p-4 text-left transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-purple-500 ${tone[a.tone]}`}
                            >
                              <a.icon size={18} />
                              <div className="mt-2 text-2xl font-extrabold tabular-nums">{a.value}</div>
                              <div className="text-xs font-medium opacity-80">{a.label}</div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 p-4 text-sm font-medium">
                          Nothing waiting on you. Every queue is clear.
                        </p>
                      )}
                      {open.length > 0 && clear.length > 0 && (
                        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                          Clear: {clear.map((a) => a.label.toLowerCase()).join(', ')}.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Platform health</h2>
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {health.map((h) => (
                    <div key={h.label} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
                      <div className="text-xl font-bold text-gray-900 dark:text-white">{h.value}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{h.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Tables */}
        {activeTab !== 'overview' && (
        <div id="admin-tabpanel" role="tabpanel" aria-labelledby={`admin-tab-${activeTab}`} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <p className="text-gray-600 dark:text-gray-400 p-8 text-center">Loading platform data...</p>
          ) : (
            <div className="overflow-x-auto">
              {/* Users */}
              {activeTab === 'users' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Role</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                          {u.email}
                          {u.id === authUser?.id && (
                            <span className="ml-2 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded text-xs">you</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{u.name || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          {canManageRoles(role) ? (
                            <select
                              value={u.role || 'business'}
                              onChange={e => updateUserRole(u.id, e.target.value)}
                              title={ROLE_DESCRIPTIONS[(u.role as keyof typeof ROLE_DESCRIPTIONS) || 'business']}
                              className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                            >
                              {ASSIGNABLE_ROLES.map(r => (
                                <option key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {ROLE_LABELS[(u.role as keyof typeof ROLE_LABELS) || 'business']}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canManagePlans(role) ? (
                            <select
                              value={(u as any).plan || 'starter'}
                              onChange={e => updateUserPlan(u.id, e.target.value)}
                              title="Change / upgrade this business's plan"
                              className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                            >
                              {BUSINESS_TIERS.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {getBusinessTier((u as any).plan || 'starter')?.name || 'Starter'}
                            </span>
                          )}
                          {(u as any).plan_status && (u as any).plan_status !== 'active' && (
                            <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 capitalize">{(u as any).plan_status}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('users', u.id, `profile for ${u.email}`)}
                              title="Delete profile row (the auth account must be removed from the Supabase dashboard)"
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Businesses */}
              {activeTab === 'businesses' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Trust tier</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Verified</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBusinesses.map(b => (
                      <tr key={b.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                          <Link to={b.username ? `/${b.username}` : `/businesses/${b.id}`} className="inline-flex items-center min-h-[44px] hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded">{b.name}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{b.category}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{b.location || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          {(b as any).verification_tier && (b as any).verification_tier !== 'none'
                            ? <TrustBadge tier={(b as any).verification_tier} score={(b as any).trust_score} />
                            : <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => toggleVerified(b.id, !b.verified)}
                            className={`inline-flex items-center gap-1 px-2 min-h-[44px] rounded text-xs font-medium transition ${
                              b.verified
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
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
                            className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                          >
                            <option value="open">open</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setTrustReviewBiz({ id: b.id, name: b.name })}
                              title="Review trust & verification"
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded transition"
                            >
                              <ShieldCheck size={16} />
                            </button>
                            {canDelete(role) && (
                              <button
                                onClick={() => deleteRow('businesses', b.id, b.name)}
                                className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredBusinesses.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No businesses found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Verification queue */}
              {activeTab === 'verification' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Document</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Submitted</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVerificationDocs.map(d => {
                      const bizName = businessNameById[d.business_id] || '—';
                      const sc = d.status === 'approved' ? 'text-green-600 dark:text-green-400'
                        : d.status === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
                      return (
                        <tr key={d.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{bizName}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{String(d.doc_type || '').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                          <td className={`px-4 py-3 text-sm font-semibold capitalize ${sc}`}>{d.status || 'pending'}</td>
                          <td className="px-4 py-3 text-sm">
                            <button
                              onClick={() => setTrustReviewBiz({ id: d.business_id, name: bizName })}
                              className="inline-flex items-center gap-1 px-2.5 min-h-[44px] text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                              <Eye size={13} /> Review
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredVerificationDocs.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No documents submitted. Open any business (shield icon) to set its verification tier manually.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Subscriptions */}
              {activeTab === 'subscriptions' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Account</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Billing</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Renews / ends</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubscriptions.map(s => {
                      const sc = s.status === 'active' ? 'text-green-600 dark:text-green-400'
                        : s.status === 'canceled' ? 'text-gray-500' : 'text-amber-600 dark:text-amber-400';
                      return (
                        <tr key={s.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{userEmailById[s.user_id] || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">{getBusinessTier(s.tier)?.name || s.tier} <span className="text-xs text-gray-400">· {s.kind}</span></td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">{s.billing_cycle || '—'}</td>
                          <td className={`px-4 py-3 text-sm font-semibold capitalize ${sc}`}>{s.status}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{s.amount_usd != null ? `$${s.amount_usd}` : '—'}</td>
                        </tr>
                      );
                    })}
                    {filteredSubscriptions.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No paid subscriptions yet. New business signups start on a 3-month all-access trial (shown under “On free trial” on the overview).
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Audit log */}
              {activeTab === 'audit' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">When</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Admin</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Action</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudit.map(a => (
                      <tr key={a.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{a.actor_email || '—'}</td>
                        <td className="px-4 py-3 text-sm"><span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">{String(a.action || '').replace(/_/g, ' ')}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {a.entity_type || ''}{a.detail?.label ? ` · ${a.detail.label}` : a.entity_id ? ` · ${String(a.entity_id).slice(0, 8)}…` : ''}
                        </td>
                      </tr>
                    ))}
                    {filteredAudit.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No admin actions recorded yet. Deletes, role changes and verification decisions appear here.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Deletion requests */}
              {activeTab === 'requests' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Listing</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Requested by</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Requested</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeletionRequests.map(r => {
                      const pending = (r.status || 'pending') === 'pending';
                      const sc = r.status === 'approved' ? 'text-green-600 dark:text-green-400'
                        : r.status === 'rejected' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
                      return (
                        <tr key={r.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{r.entity_label || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">{r.entity_type}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{userEmailById[r.requester_id] || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                          <td className={`px-4 py-3 text-sm font-semibold capitalize ${sc}`}>{r.status || 'pending'}</td>
                          <td className="px-4 py-3 text-sm">
                            {pending ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => resolveDeletionRequest(r, 'approved')}
                                  disabled={resolvingReq === r.id}
                                  className="px-2.5 min-h-[44px] text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                >
                                  {resolvingReq === r.id ? '…' : 'Approve & delete'}
                                </button>
                                <button
                                  onClick={() => resolveDeletionRequest(r, 'rejected')}
                                  disabled={resolvingReq === r.id}
                                  className="px-2.5 min-h-[44px] text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Reviewed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredDeletionRequests.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        No deletion requests. When a business owner asks to delete a listing, it appears here for approval.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Adverts */}
              {activeTab === 'adverts' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Pricing</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAdverts.map(a => (
                      <tr key={a.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                          <Link to={`/adverts/${a.id}`} className="inline-flex items-center min-h-[44px] hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded">{a.title}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{a.category || a.type || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{a.location || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {a.pricing ? `$${Number(a.pricing).toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={a.status || 'active'}
                            onChange={e => updateStatus('advertisements', a.id, e.target.value)}
                            className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                          >
                            <option value="active">active</option>
                            <option value="pending">pending</option>
                            <option value="completed">completed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('advertisements', a.id, a.title)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredAdverts.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No adverts found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Media services */}
              {activeTab === 'media' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Pricing</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMedia.map(m => (
                      <tr key={m.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">
                          <Link to={`/media/${m.id}`} className="inline-flex items-center min-h-[44px] hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded">{m.title}</Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{m.service_type}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{m.pricing ? `$${m.pricing}` : '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={m.status || 'open'}
                            onChange={e => updateStatus('media_services', m.id, e.target.value)}
                            className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                          >
                            <option value="open">open</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('media_services', m.id, m.title)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredMedia.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No media services found</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Bookings */}
              {activeTab === 'bookings' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Requested</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBookings.map(b => (
                      <tr key={b.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{businessNameById[b.business_id] || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {b.module_key ? (
                            <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-semibold">
                              {moduleLabel(b.module_key)}
                            </span>
                          ) : null}
                          {Array.isArray(b.items) && b.items.length > 0 ? (
                            <div className="space-y-0.5">
                              {b.items.map((it: any, i: number) => (
                                <div key={i} className="text-xs">
                                  <span className="font-medium text-gray-800 dark:text-gray-200">{it.quantity ?? 1}×</span> {it.name}
                                  {it.price ? <span className="text-gray-400"> · {it.price}</span> : ''}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div>{b.item_name || (b.module_key ? '' : '—')}{b.item_price ? <span className="text-gray-400"> · {b.item_price}</span> : ''}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          <div>{b.customer_name}</div>
                          <div className="text-xs text-gray-400">{b.customer_email}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {b.requested_date ? new Date(b.requested_date).toLocaleDateString() : '—'}
                          {b.requested_time ? ` · ${b.requested_time}` : ''}
                          {b.quantity ? ` · qty ${b.quantity}` : ''}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={b.status || 'pending'}
                            onChange={e => updateStatus('business_bookings', b.id, e.target.value)}
                            className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                          >
                            <option value="pending">pending</option>
                            <option value="confirmed">confirmed</option>
                            <option value="declined">declined</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('business_bookings', b.id, `booking from ${b.customer_name}`)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No bookings found. If this table has data you expected to see, run the latest migrations in scripts/sql/apply_all_migrations.sql.</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Payments */}
              {activeTab === 'payments' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Kind</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPayments.map(p => (
                      <tr key={p.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{p.item_title}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.kind}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {p.currency} {Number(p.amount_local).toLocaleString()}
                          {p.method && <div className="text-xs text-gray-400">{p.method}{p.provider ? ` · ${p.provider}` : ''}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.email}</td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={p.status || 'lead'}
                            onChange={e => updateStatus('payment_intents', p.id, e.target.value)}
                            className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                          >
                            <option value="lead">lead</option>
                            <option value="initiated">initiated</option>
                            <option value="paid">paid</option>
                            <option value="failed">failed</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('payment_intents', p.id, p.item_title)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredPayments.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No payment activity yet</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Waitlist */}
              {activeTab === 'waitlist' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Email</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Business Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Country</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Invited</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWaitlist.map(w => (
                      <tr key={w.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{w.name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{w.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{w.business_type || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{w.country || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => toggleWaitlistInvited(w.id, !w.invited)}
                            className={`inline-flex items-center gap-1 px-2 min-h-[44px] rounded text-xs font-medium transition ${
                              w.invited
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                          >
                            <BadgeCheck size={14} />
                            {w.invited ? 'Invited' : 'Not yet'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('waitlist', w.id, w.email)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredWaitlist.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No waitlist signups yet</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Registrations (public Digital Forms submissions) */}
              {activeTab === 'registrations' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegistrations.map(r => (
                      <tr key={r.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{r.business_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.category}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{r.location}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          <div>{r.phone || '—'}</div>
                          <div className="text-xs text-gray-400">{r.email || '—'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <select
                            value={r.status || 'new'}
                            onChange={e => updateStatus('business_registrations', r.id, e.target.value)}
                            className="px-2 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-800"
                          >
                            <option value="new">new</option>
                            <option value="contacted">contacted</option>
                            <option value="approved">approved</option>
                            <option value="rejected">rejected</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('business_registrations', r.id, r.business_name)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredRegistrations.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No registration submissions yet</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* OS Applications (Forms Hub submissions) */}
              {activeTab === 'applications' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      OS Forms Hub submissions (<code>os_form_applications</code>). Review and advance each one in the Applications Review module.
                    </p>
                    <Link
                      to="/admin-creator?section=applications"
                      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition"
                    >
                      <ClipboardList size={14} /> Open Applications Review
                    </Link>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Applicant</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Relationship</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplications.map(a => (
                        <tr key={a.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{a.reference || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            <div>{a.applicant_name}</div>
                            <div className="text-xs text-gray-400">{a.email || '—'}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{hubRelationshipById(a.relationship)?.label ?? a.relationship}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              a.status === 'approved' || a.status === 'active' || a.status === 'onboarding'
                                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                : a.status === 'archived'
                                  ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                                  : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                            }`}>
                              {APPLICATION_STATUS_LABELS[a.status as keyof typeof APPLICATION_STATUS_LABELS] ?? a.status ?? 'New'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                            {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                      {filteredApplications.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No form applications yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Platform enquiries (advert & media contact forms) */}
              {activeTab === 'enquiries' && (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">About</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">From</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Message</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Received</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-900 dark:text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnquiries.map(e => (
                      <tr key={e.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.kind === 'advert' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400'}`}>
                            {e.kind === 'advert' ? 'Advert' : 'Media'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-medium">{e.item_title}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          <div>{e.name}</div>
                          <div className="text-xs text-gray-400">{e.email}{e.phone ? ` · ${e.phone}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate" title={e.message}>{e.message}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                          {e.created_at ? new Date(e.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {canDelete(role) && (
                            <button
                              onClick={() => deleteRow('platform_enquiries', e.id, `enquiry from ${e.name}`)}
                              className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredEnquiries.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No enquiries yet</td></tr>
                    )}
                  </tbody>
                </table>
              )}

              {/* Hero Videos */}
              {activeTab === 'hero-videos' && (
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Homepage Video Slider</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Upload up to 10 videos for the hero banner.</p>
                    </div>
                    <div className="w-full order-last rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <span className="block text-sm font-semibold text-gray-900 dark:text-white">Video slider</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {hero.videoEnabled
                              ? 'Playing on the homepage banner.'
                              : 'Off — visitors see the banner colour below, and the videos are never downloaded.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={hero.videoEnabled}
                          aria-label="Homepage video slider"
                          disabled={heroSaving}
                          onClick={() => updateHero({ videoEnabled: !hero.videoEnabled })}
                          // The 25px track stays the visual; the button around
                          // it carries the 44px target, so the switch looks the
                          // same and is no longer a 25px thing to hit.
                          className="group relative inline-flex h-[44px] w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                        >
                          <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${hero.videoEnabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${hero.videoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                          </span>
                        </button>
                      </div>

                      {/* Only meaningful while clips are playing — with video
                          off there is nothing for the text to sync to. */}
                      {hero.videoEnabled && (
                        <div className="flex items-start justify-between gap-4 flex-wrap border-t border-gray-100 dark:border-gray-700 pt-4">
                          <div className="min-w-0">
                            <span className="block text-sm font-semibold text-gray-900 dark:text-white">Fade text between videos</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 max-w-lg">
                              {hero.textSyncWithVideo
                                ? 'The headline fades out as each video ends, the next one starts, then it fades back in.'
                                : 'The headline fades on its own 15-second cycle, so it can disappear mid-video or stay up while videos change.'}
                            </span>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={hero.textSyncWithVideo}
                            aria-label="Fade banner text between videos"
                            disabled={heroSaving}
                            onClick={() => updateHero({ textSyncWithVideo: !hero.textSyncWithVideo })}
                            className="relative inline-flex h-[44px] w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                          >
                            <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${hero.textSyncWithVideo ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${hero.textSyncWithVideo ? 'translate-x-6' : 'translate-x-1'}`} />
                            </span>
                          </button>
                        </div>
                      )}

                      {/* The colour only matters with the video off, so it only
                          appears then — a control that changes nothing visible
                          is worse than no control at all. */}
                      {!hero.videoEnabled && (
                        <div className="flex items-center gap-3 flex-wrap border-t border-gray-100 dark:border-gray-700 pt-4">
                          <label htmlFor="hero-color" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Banner colour
                          </label>
                          <input
                            id="hero-color"
                            type="color"
                            value={hero.bannerColor ?? '#1e3a5f'}
                            disabled={heroSaving}
                            onChange={(e) => updateHero({ bannerColor: e.target.value })}
                            className="h-10 w-14 cursor-pointer rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent p-1 disabled:opacity-60"
                          />
                          <code className="text-xs text-gray-500 dark:text-gray-400">
                            {hero.bannerColor ?? 'NowOpen gradient'}
                          </code>
                          {hero.bannerColor && (
                            <button
                              type="button"
                              disabled={heroSaving}
                              onClick={() => updateHero({ bannerColor: null })}
                              className="px-3 min-h-[44px] rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                            >
                              Reset to gradient
                            </button>
                          )}
                          <span
                            className="ml-auto h-10 w-32 rounded-lg border border-gray-200 dark:border-gray-700"
                            style={{ background: heroBackground(hero) }}
                            aria-label="Banner preview"
                            title={hero.bannerColor ? 'Chosen colour' : 'NowOpen gradient (unchanged)'}
                          />
                        </div>
                      )}

                      {hero.videoEnabled && hero.bannerColor && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-3">
                          A banner colour is saved ({hero.bannerColor}) but stays hidden while the video is playing.
                        </p>
                      )}
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        onChange={uploadHeroVideo}
                        className="hidden"
                        id="hero-video-upload"
                      />
                      <label
                        htmlFor="hero-video-upload"
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition ${
                          uploading || heroVideos.length >= 10
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                            : 'bg-black text-white hover:bg-gray-800'
                        }`}
                      >
                        <Upload size={16} />
                        {uploading ? 'Uploading...' : 'Upload Video'}
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {heroVideos.map((v, idx) => (
                      <div key={v.name} className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                        <video
                          src={v.url}
                          className="w-full h-40 object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                        <div className="p-3 flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{v.name}</span>
                          <button
                            onClick={() => deleteHeroVideo(v.name)}
                            className="inline-flex items-center justify-center w-[44px] h-[44px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition"
                            title="Delete video"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded font-medium">
                          Slide {idx + 1}
                        </div>
                      </div>
                    ))}
                    {heroVideos.length === 0 && (
                      <div className="col-span-full py-12 text-center text-gray-500 dark:text-gray-400">
                        <Video size={40} className="mx-auto mb-3 opacity-40" />
                        <p>No hero videos uploaded yet.</p>
                        <p className="text-xs mt-1">Upload up to 10 MP4 videos to create a sliding hero banner.</p>
                      </div>
                    )}
                    {heroVideos.length > 0 && heroVideos.length < 3 && (
                      <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">
                        + Add slide {heroVideos.length + 1}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          Note: deleting a user here removes their profile row and (via cascade) their content.
          The login account itself must be removed from Supabase Dashboard → Authentication.
        </p>
      </div>

      {trustReviewBiz && (
        <TrustPanel
          businessId={trustReviewBiz.id}
          businessName={trustReviewBiz.name}
          admin
          onClose={() => setTrustReviewBiz(null)}
          onSaved={fetchAll}
        />
      )}

      {/* Delete confirmation — replaces native window.confirm() so the button
          works reliably in every browser. */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm delete</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-5">
              Delete <span className="font-semibold text-gray-900 dark:text-white">{deleteTarget.label}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
