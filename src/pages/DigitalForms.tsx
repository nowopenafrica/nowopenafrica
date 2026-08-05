import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { BUSINESS_CATEGORY_GROUPS } from '../data/categories';
import {
  ArrowLeft, ShoppingBag, Tag, MapPin, FileText, Link, Facebook, Instagram, Youtube, Linkedin,
  Loader2, CheckCircle, Clock, CreditCard, Languages, ShieldCheck, MessageCircle, Music2,
} from 'lucide-react';
import { XLogo } from '../components/SocialLinks';

type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}
type WeekHours = Record<DayKey, DayHours>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const DEFAULT_HOURS: WeekHours = {
  mon: { closed: false, open: '09:00', close: '18:00' },
  tue: { closed: false, open: '09:00', close: '18:00' },
  wed: { closed: false, open: '09:00', close: '18:00' },
  thu: { closed: false, open: '09:00', close: '18:00' },
  fri: { closed: false, open: '09:00', close: '18:00' },
  sat: { closed: false, open: '10:00', close: '16:00' },
  sun: { closed: true, open: '10:00', close: '16:00' },
};

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card / POS', 'Mobile Money', 'Cheque'];
const LANGUAGES = ['English', 'French', 'Portuguese', 'Arabic', 'Swahili', 'Hausa', 'Yoruba', 'Igbo', 'Pidgin'];
const EMPLOYEE_COUNTS = ['Just me', '2-5', '6-20', '21-50', '51-200', '200+'];

interface FormData {
  businessName: string;
  description: string;
  category: string;
  location: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  yearEstablished: string;
  employeeCount: string;
  services: string;
  serviceDetails: string;
  products: string;
  productDetails: string;
  pricing: string;
  logoUrl: string;
  coverImageUrl: string;
  paymentMethods: string[];
  serviceArea: string;
  languages: string[];
  languagesOther: string;
  businessHours: WeekHours;
  registrationNumber: string;
  taxId: string;
  verificationDocUrl: string;
  socialMedia: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    x?: string;
    youtube?: string;
    linkedin?: string;
  };
}

const EMPTY_FORM: FormData = {
  businessName: '',
  description: '',
  category: '',
  location: '',
  phone: '',
  whatsapp: '',
  email: '',
  website: '',
  yearEstablished: '',
  employeeCount: '',
  services: '',
  serviceDetails: '',
  products: '',
  productDetails: '',
  pricing: '',
  logoUrl: '',
  coverImageUrl: '',
  paymentMethods: [],
  serviceArea: '',
  languages: [],
  languagesOther: '',
  businessHours: DEFAULT_HOURS,
  registrationNumber: '',
  taxId: '',
  verificationDocUrl: '',
  socialMedia: {},
};

export default function DigitalForms() {
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState('basic');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const toggleInArray = (field: 'paymentMethods' | 'languages', value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value],
    }));
  };

  const updateDay = (day: DayKey, patch: Partial<DayHours>) => {
    setFormData(prev => ({
      ...prev,
      businessHours: { ...prev.businessHours, [day]: { ...prev.businessHours[day], ...patch } },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Sections render one at a time, so browser `required` can't see hidden
    // fields — validate the whole form here instead.
    if (!formData.businessName.trim() || !formData.category || !formData.description.trim() || !formData.location.trim()) {
      setActiveSection('basic');
      toast.error('Please complete the required fields in Basic Info first.');
      return;
    }

    setSubmitting(true);
    try {
      const languages = [...formData.languages, ...(formData.languagesOther.trim() ? [formData.languagesOther.trim()] : [])];

      const { error } = await supabase.from('business_registrations').insert([{
        business_name: formData.businessName.trim(),
        category: formData.category,
        description: formData.description.trim(),
        location: formData.location.trim(),
        phone: formData.phone.trim() || null,
        whatsapp: formData.whatsapp.trim() || null,
        email: formData.email.trim().toLowerCase() || null,
        website: formData.website.trim() || null,
        year_established: formData.yearEstablished ? parseInt(formData.yearEstablished, 10) : null,
        employee_count: formData.employeeCount || null,
        services: formData.services.trim() || null,
        service_details: formData.serviceDetails.trim() || null,
        products: formData.products.trim() || null,
        product_details: formData.productDetails.trim() || null,
        pricing: formData.pricing.trim() || null,
        logo_url: formData.logoUrl.trim() || null,
        image_url: formData.coverImageUrl.trim() || null,
        payment_methods: formData.paymentMethods.length > 0 ? formData.paymentMethods : null,
        service_area: formData.serviceArea.trim() || null,
        languages: languages.length > 0 ? languages : null,
        business_hours: formData.businessHours,
        registration_number: formData.registrationNumber.trim() || null,
        tax_id: formData.taxId.trim() || null,
        verification_doc_url: formData.verificationDocUrl.trim() || null,
        social_media: formData.socialMedia,
      }]);

      if (error) throw error;
      setDone(true);
      toast.success('Registration submitted!');
    } catch (err: any) {
      console.error('Registration submit failed:', err);
      toast.error(
        `Could not submit: ${err.message || 'unknown error'}. ` +
        'If this mentions a missing column, run scripts/sql/apply_all_migrations.sql in Supabase.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-10 text-center space-y-5">
          <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Registration received!</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Our team will review <span className="font-medium text-gray-900 dark:text-white">{formData.businessName}</span> and
            be in touch{formData.email ? ` at ${formData.email}` : ''} to complete your listing.
            {(formData.registrationNumber || formData.verificationDocUrl) && ' The verification details you added will help us fast-track your verified badge.'}
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <RouterLink to="/" className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition">
              Back to Home
            </RouterLink>
            <button
              onClick={() => { setFormData(EMPTY_FORM); setActiveSection('basic'); setDone(false); }}
              className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              Register Another Business
            </button>
          </div>
        </div>
      </div>
    );
  }

  const inputCls = "w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
  const labelCls = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2";
  const checkboxRowCls = "flex items-center gap-2 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <RouterLink
            to="/"
            className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium text-sm"
          >
            <ArrowLeft size={18} />
            Back to Home
          </RouterLink>
        </div>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Full Business Onboarding
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Register your business, operating details, services, and products in one comprehensive form —
            everything below (except Basic Info) is optional and can be completed later from your dashboard.
          </p>
        </div>

        {/* Progress Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl mb-8">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex space-x-2 px-6 overflow-x-auto" aria-label="Form Sections">
              {[
                { id: 'basic', label: 'Basic Info', icon: <FileText size={16} /> },
                { id: 'profile', label: 'Business Profile', icon: <Tag size={16} /> },
                { id: 'services', label: 'Services', icon: <ShoppingBag size={16} /> },
                { id: 'products', label: 'Products', icon: <ShoppingBag size={16} /> },
                { id: 'verification', label: 'Verification', icon: <ShieldCheck size={16} /> },
                { id: 'social', label: 'Social Media', icon: <Link size={16} /> },
              ].map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  className={`
                    flex items-center gap-2 py-3 px-4 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap flex-shrink-0
                    ${
                      activeSection === section.id
                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  {section.icon}
                  {section.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Info Section */}
            {activeSection === 'basic' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">Basic Information</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={labelCls}>Business Name *</label>
                    <input
                      type="text"
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      className={inputCls}
                      placeholder="Enter your business name"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Category *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className={inputCls}
                      required
                    >
                      <option value="">Select Category</option>
                      {BUSINESS_CATEGORY_GROUPS.map(group => (
                        <optgroup key={group.group} label={group.group}>
                          {group.items.map(item => (
                            <option key={item} value={item}>{item}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-6">
                  <label className={labelCls}>Description *</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={inputCls}
                    rows={4}
                    placeholder="Describe your business..."
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div>
                    <label className={labelCls}>Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={inputCls}
                      placeholder="+254 XXX XXX XXX"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>WhatsApp Number</label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-3.5 text-gray-400" size={18} />
                      <input
                        type="tel"
                        value={formData.whatsapp}
                        onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                        className={`${inputCls} pl-10`}
                        placeholder="If different from phone"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={inputCls}
                      placeholder="business@example.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div>
                    <label className={labelCls}>Website</label>
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                      className={inputCls}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Year Established</label>
                    <input
                      type="number"
                      min="1900"
                      max={new Date().getFullYear()}
                      value={formData.yearEstablished}
                      onChange={(e) => setFormData({ ...formData, yearEstablished: e.target.value })}
                      className={inputCls}
                      placeholder="e.g. 2018"
                    />
                  </div>

                  <div>
                    <label className={labelCls}>Team Size</label>
                    <select
                      value={formData.employeeCount}
                      onChange={(e) => setFormData({ ...formData, employeeCount: e.target.value })}
                      className={inputCls}
                    >
                      <option value="">Select team size</option>
                      {EMPLOYEE_COUNTS.map(range => (
                        <option key={range} value={range}>{range}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-6">
                  <label className={labelCls}>Location *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className={`${inputCls} pl-10`}
                      placeholder="Enter business location"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Business Profile Section — operating details for full onboarding */}
            {activeSection === 'profile' && (
              <div className="animate-fadeIn space-y-8">
                <div>
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">Business Profile</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelCls}>Logo Image URL</label>
                      <input
                        type="url"
                        value={formData.logoUrl}
                        onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                        className={inputCls}
                        placeholder="https://example.com/logo.jpg"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Cover Photo URL</label>
                      <input
                        type="url"
                        value={formData.coverImageUrl}
                        onChange={(e) => setFormData({ ...formData, coverImageUrl: e.target.value })}
                        className={inputCls}
                        placeholder="https://example.com/cover.jpg"
                      />
                    </div>
                  </div>

                  <div className="mt-6">
                    <label className={labelCls}>Typical Pricing</label>
                    <input
                      type="text"
                      value={formData.pricing}
                      onChange={(e) => setFormData({ ...formData, pricing: e.target.value })}
                      className={inputCls}
                      placeholder="e.g., $500-$2000 or Starting at $500"
                    />
                  </div>

                  <div className="mt-6">
                    <label className={labelCls}>Service / Delivery Area</label>
                    <input
                      type="text"
                      value={formData.serviceArea}
                      onChange={(e) => setFormData({ ...formData, serviceArea: e.target.value })}
                      className={inputCls}
                      placeholder="e.g., Lagos Island only, or Nationwide delivery"
                    />
                  </div>
                </div>

                {/* Payment methods */}
                <div>
                  <label className={`${labelCls} flex items-center gap-2`}>
                    <CreditCard size={16} />
                    Payment Methods Accepted
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {PAYMENT_METHODS.map(method => (
                      <label key={method} className={checkboxRowCls}>
                        <input
                          type="checkbox"
                          checked={formData.paymentMethods.includes(method)}
                          onChange={() => toggleInArray('paymentMethods', method)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {method}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Languages */}
                <div>
                  <label className={`${labelCls} flex items-center gap-2`}>
                    <Languages size={16} />
                    Languages Spoken
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {LANGUAGES.map(lang => (
                      <label key={lang} className={checkboxRowCls}>
                        <input
                          type="checkbox"
                          checked={formData.languages.includes(lang)}
                          onChange={() => toggleInArray('languages', lang)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {lang}
                      </label>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={formData.languagesOther}
                    onChange={(e) => setFormData({ ...formData, languagesOther: e.target.value })}
                    className={inputCls}
                    placeholder="Other language(s), comma separated"
                  />
                </div>

                {/* Business hours */}
                <div>
                  <label className={`${labelCls} flex items-center gap-2`}>
                    <Clock size={16} />
                    Business Hours
                  </label>
                  <div className="space-y-2">
                    {DAYS.map(({ key, label }) => {
                      const day = formData.businessHours[key];
                      return (
                        <div key={key} className="flex flex-wrap items-center gap-3 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg">
                          <span className="w-24 sm:w-28 text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0">{label}</span>
                          <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={day.closed}
                              onChange={(e) => updateDay(key, { closed: e.target.checked })}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Closed
                          </label>
                          {!day.closed && (
                            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                              <input
                                type="time"
                                value={day.open}
                                onChange={(e) => updateDay(key, { open: e.target.value })}
                                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs sm:text-sm flex-1"
                              />
                              <span className="text-gray-400 text-xs">to</span>
                              <input
                                type="time"
                                value={day.close}
                                onChange={(e) => updateDay(key, { close: e.target.value })}
                                className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs sm:text-sm flex-1"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Services Section */}
            {activeSection === 'services' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">Services Offered</h2>

                <div>
                  <label className={labelCls}>Services (comma separated)</label>
                  <textarea
                    value={formData.services}
                    onChange={(e) => setFormData({ ...formData, services: e.target.value })}
                    className={inputCls}
                    rows={6}
                    placeholder="e.g., Web Design, SEO, Digital Marketing, Social Media Management"
                  />
                </div>

                <div className="mt-6">
                  <label className={labelCls}>Service Details</label>
                  <textarea
                    value={formData.serviceDetails}
                    onChange={(e) => setFormData({ ...formData, serviceDetails: e.target.value })}
                    className={inputCls}
                    rows={4}
                    placeholder="Detailed description of your services..."
                  />
                </div>
              </div>
            )}

            {/* Products Section */}
            {activeSection === 'products' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">Products Offered</h2>

                <div>
                  <label className={labelCls}>Products (comma separated)</label>
                  <textarea
                    value={formData.products}
                    onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                    className={inputCls}
                    rows={6}
                    placeholder="e.g., Product A, Product B, Product C"
                  />
                </div>

                <div className="mt-6">
                  <label className={labelCls}>Product Details</label>
                  <textarea
                    value={formData.productDetails}
                    onChange={(e) => setFormData({ ...formData, productDetails: e.target.value })}
                    className={inputCls}
                    rows={4}
                    placeholder="Detailed description of your products..."
                  />
                </div>
              </div>
            )}

            {/* Verification Section */}
            {activeSection === 'verification' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <ShieldCheck size={22} className="text-blue-600 dark:text-blue-400" />
                  Verification Details
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Completely optional — adding these helps our team verify and badge your business faster,
                  but it won't block your registration if you skip it for now.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={labelCls}>Business Registration Number</label>
                    <input
                      type="text"
                      value={formData.registrationNumber}
                      onChange={(e) => setFormData({ ...formData, registrationNumber: e.target.value })}
                      className={inputCls}
                      placeholder="e.g., CAC/RC number"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Tax ID / TIN</label>
                    <input
                      type="text"
                      value={formData.taxId}
                      onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                      className={inputCls}
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="mt-6">
                  <label className={labelCls}>Registration Certificate / ID Document URL</label>
                  <input
                    type="url"
                    value={formData.verificationDocUrl}
                    onChange={(e) => setFormData({ ...formData, verificationDocUrl: e.target.value })}
                    className={inputCls}
                    placeholder="Link to a document (Google Drive, Dropbox, etc.)"
                  />
                </div>
              </div>
            )}

            {/* Social Media Section */}
            {activeSection === 'social' && (
              <div className="animate-fadeIn">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mb-6">Social Media Links</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className={labelCls}>Facebook</label>
                    <div className="relative">
                      <Facebook className="absolute left-3 top-3 text-gray-400" size={20} />
                      <input
                        type="url"
                        value={formData.socialMedia.facebook || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialMedia: { ...formData.socialMedia, facebook: e.target.value }
                        })}
                        className={`${inputCls} pl-10`}
                        placeholder="https://facebook.com/yourpage"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Instagram</label>
                    <div className="relative">
                      <Instagram className="absolute left-3 top-3 text-gray-400" size={20} />
                      <input
                        type="url"
                        value={formData.socialMedia.instagram || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialMedia: { ...formData.socialMedia, instagram: e.target.value }
                        })}
                        className={`${inputCls} pl-10`}
                        placeholder="https://instagram.com/yourpage"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>TikTok</label>
                    <div className="relative">
                      <Music2 className="absolute left-3 top-3 text-gray-400" size={20} />
                      <input
                        type="url"
                        value={formData.socialMedia.tiktok || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialMedia: { ...formData.socialMedia, tiktok: e.target.value }
                        })}
                        className={`${inputCls} pl-10`}
                        placeholder="https://tiktok.com/@yourhandle"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>X (Twitter)</label>
                    <div className="relative">
                      <XLogo className="absolute left-3 top-3 text-gray-400" size={20} />
                      <input
                        type="url"
                        value={formData.socialMedia.x || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialMedia: { ...formData.socialMedia, x: e.target.value }
                        })}
                        className={`${inputCls} pl-10`}
                        placeholder="https://x.com/yourpage"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>YouTube</label>
                    <div className="relative">
                      <Youtube className="absolute left-3 top-3 text-gray-400" size={20} />
                      <input
                        type="url"
                        value={formData.socialMedia.youtube || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialMedia: { ...formData.socialMedia, youtube: e.target.value }
                        })}
                        className={`${inputCls} pl-10`}
                        placeholder="https://youtube.com/yourpage"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>LinkedIn</label>
                    <div className="relative">
                      <Linkedin className="absolute left-3 top-3 text-gray-400" size={20} />
                      <input
                        type="url"
                        value={formData.socialMedia.linkedin || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          socialMedia: { ...formData.socialMedia, linkedin: e.target.value }
                        })}
                        className={`${inputCls} pl-10`}
                        placeholder="https://linkedin.com/company/yourpage"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => { setFormData(EMPTY_FORM); setActiveSection('basic'); }}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm"
              >
                Reset Form
              </button>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm disabled:opacity-50"
                >
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? 'Submitting…' : 'Submit Registration'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
