import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  X, Plus, Trash2, Loader2, Upload, Tag, Package, Image as ImageIcon, Star, Inbox, Mail, Phone,
  Check, Ban, CalendarClock, ShoppingCart, Camera, Play,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getActiveFeatures } from '../../data/categoryFeatures';
import { getTabLabel } from '../../data/categoryTabLabels';
import { compressImage } from '../../lib/imageCompression';
import BusReelCapture from './BusReelCapture';

interface BusinessContentManagerProps {
  businessId: string;
  businessName: string;
  category: string;
  enabledModules?: string[] | null;
  onClose: () => void;
}

// Base tab ids are fixed; module tab ids are dynamic (a module's `key`, e.g.
// 'reservations' / 'orders' / 'rooms') — a category can have more than one.
type ContentTab = 'enquiries' | 'services' | 'products' | 'gallery' | 'reviews' | (string & {});

const BASE_TAB_DEFS = [
  { id: 'enquiries' as const, defaultLabel: 'Enquiries', icon: Inbox, labelKey: 'enquiries' as const },
  { id: 'services' as const, defaultLabel: 'Services', icon: Tag, labelKey: 'services' as const },
  { id: 'products' as const, defaultLabel: 'Products', icon: Package, labelKey: 'products' as const },
  { id: 'gallery' as const, defaultLabel: 'Gallery', icon: ImageIcon, labelKey: 'gallery' as const },
  { id: 'reviews' as const, defaultLabel: 'Reviews', icon: Star, labelKey: undefined },
];

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  confirmed: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  declined: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  cancelled: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};

export default function BusinessContentManager({ businessId, businessName, category, enabledModules, onClose }: BusinessContentManagerProps) {
  const { user } = useAuth();
  const features = getActiveFeatures(category, enabledModules);
  // Real Estate turns the Products tab into a property manager with extra fields.
  const isRealEstate = category === 'Real Estate';
  // Food categories turn the Products tab into a menu manager.
  const isMenu = ['Restaurant', 'Fast Food', 'Café & Bakery', 'Bar & Lounge', 'Local Food Vendor', 'Food Truck', 'Suya & Grill', 'Shawarma & Kebab', 'Bakery & Pastry'].includes(category);
  const MENU_CATEGORY_OPTIONS = ['Starters', 'Mains', 'Sides', 'Drinks', 'Desserts'];
  // Hotels turn the Services tab into a room manager (photo + capacity + amenities).
  const isHotel = ['Hotel & Lodging', 'Guesthouse & Short-let / B&B'].includes(category);
  // Gyms turn the Services tab into a membership + class manager.
  const isFitness = category === 'Fitness & Gym';
  // Salons/spas turn the Services tab into a treatment price-list manager.
  const isBeauty = ['Salon / Barber', 'Spa & Beauty'].includes(category);
  const BEAUTY_CATEGORY_OPTIONS = ['Hair', 'Nails', 'Makeup', 'Spa', 'Barber'];
  // Clinics/hospitals turn the Services tab into a doctors + departments manager.
  const isHealth = ['Hospital & Clinic', 'Dental Care', 'Veterinary Services'].includes(category);
  // Schools/tutors turn the Services tab into a programmes + teachers manager.
  const isEducation = ['School & Education', 'Training & Tutoring'].includes(category);
  // Photo/video studios turn the Services tab into a packages + portfolio manager.
  const isPhoto = category === 'Photography & Video';
  const PHOTO_GENRE_OPTIONS = ['Wedding', 'Portrait', 'Product', 'Events', 'Fashion'];
  // Transport operators turn the Services tab into a routes + schedules manager.
  const isTransport = category === 'Logistics & Transport';
  const TRANSPORT_TYPE_OPTIONS = ['Interstate', 'City Ride', 'Airport', 'Cargo'];
  // Event companies turn the Services tab into a vendors manager.
  const isEvents = category === 'Event Planning';
  const EVENT_VENDOR_OPTIONS = ['Decoration', 'Catering', 'MC', 'DJ', 'Photography', 'Venue'];
  // Law firms, home-service providers and finance firms group services by
  // area/type (they all just need a service_category on each service).
  const isLegal = category === 'Legal Services';
  const isServiceProvider = category === 'Cleaning Services';
  const isFinance = category === 'Financial Services';
  const isConstruction = category === 'Construction';
  const isTravel = category === 'Travel & Tourism';
  const isAutomotive = category === 'Automotive';
  const isChildcare = category === 'Childcare';
  const isMusic = category === 'Music & Nightlife';
  const isDesign = category === 'Art & Design';
  const isInsurance = category === 'Insurance';
  const isAccounting = category === 'Accounting & Tax';
  const isMarketing = category === 'Digital Marketing';
  const isMoney = category === 'Money Transfer / Mobile Money Agent';
  const isSoftware = category === 'Software & IT';
  const isRepair = category === 'Gadget & Device Repair';
  const isServiceCategoryOnly = isLegal || isServiceProvider || isFinance || isConstruction || isAutomotive || isChildcare || isMusic || isDesign || isInsurance || isAccounting || isMarketing || isMoney || isSoftware || isRepair;
  // Car dealerships turn the Products tab into a vehicle inventory manager.
  const isCarDealer = category === 'Car Dealership';
  // Pharmacies turn the Products tab into a medicine catalogue manager.
  const isPharmacy = category === 'Pharmacy';
  // Fashion brands turn the Products tab into a catalogue manager.
  const isFashion = category === 'Fashion & Apparel';
  const FASHION_CATEGORY_OPTIONS = ['Women', 'Men', 'Kids', 'Accessories'];
  // Retail (meat shops, markets, supermarkets…) and farms share a
  // product_category + unit catalogue on the Products tab.
  const isRetail = ['Retail Store', 'Supermarket', 'Grocery / Mini-Mart', 'Electronics', 'Jewelry & Accessories', 'Furniture & Home', 'Online Store / E-commerce', 'Frozen Food Store', 'Meat & Poultry Shop', 'Produce / Fruit & Veg Market', 'Boutique', 'Phone & Gadget Store', 'Bookstore & Stationery', 'Cosmetics & Beauty Supply', 'Gift & Souvenir Shop', 'Spare Parts Store'].includes(category);
  const isAgriculture = category === 'Agriculture';
  const isManufacturing = category === 'Manufacturing';
  const isCatalogue = isRetail || isAgriculture || isManufacturing;
  const tabs = useMemo(() => {
    const base = BASE_TAB_DEFS.map(t => ({
      id: t.id as ContentTab,
      label: t.labelKey ? getTabLabel(category, t.labelKey, t.defaultLabel) : t.defaultLabel,
      icon: t.icon,
    }));
    const moduleTabs = getActiveFeatures(category, enabledModules).map(f => ({
      id: f.key as ContentTab,
      label: f.tabLabel,
      icon: f.cart ? ShoppingCart : CalendarClock,
    }));
    return [...base, ...moduleTabs];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, enabledModules]);
  const [tab, setTab] = useState<ContentTab>('enquiries');
  const activeModule = features.find(f => f.key === tab);
  const [services, setServices] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [showCamera, setShowCamera] = useState(false);

  // Add-form state (shared across tabs; reset on tab switch)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [stock, setStock] = useState('');
  // Real Estate property attributes (Products tab only)
  const [listingType, setListingType] = useState('sale');
  const [propertyType, setPropertyType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [areaSqm, setAreaSqm] = useState('');
  const [propertyLocation, setPropertyLocation] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  // Restaurant menu attributes (Products tab only)
  const [menuCategory, setMenuCategory] = useState('');
  const [isSpecial, setIsSpecial] = useState(false);
  const [isRecommended, setIsRecommended] = useState(false);
  // Hotel room attributes (Services tab only)
  const [roomCapacity, setRoomCapacity] = useState('');
  const [roomAmenities, setRoomAmenities] = useState('');
  // Car dealership vehicle attributes (Products tab only)
  const [vMake, setVMake] = useState('');
  const [vModel, setVModel] = useState('');
  const [vYear, setVYear] = useState('');
  const [vMileage, setVMileage] = useState('');
  const [vFuel, setVFuel] = useState('Petrol');
  const [vTransmission, setVTransmission] = useState('Automatic');
  const [vVin, setVVin] = useState('');
  const [vCondition, setVCondition] = useState('Foreign Used');
  // Pharmacy medicine attributes (Products tab only)
  const [medCategory, setMedCategory] = useState('');
  const [requiresRx, setRequiresRx] = useState(false);
  const [packSize, setPackSize] = useState('');
  // Fashion attributes (Products tab only)
  const [fashionCategory, setFashionCategory] = useState('');
  const [fashionSizes, setFashionSizes] = useState('');
  const [fashionFabric, setFashionFabric] = useState('');
  // Fitness class/membership attributes (Services tab only)
  const [sessionKind, setSessionKind] = useState('class');
  const [classLevel, setClassLevel] = useState('All levels');
  const [classSchedule, setClassSchedule] = useState('');
  const [instructor, setInstructor] = useState('');
  const [durationMin, setDurationMin] = useState('');
  // Beauty treatment attributes (Services tab only)
  const [beautyCategory, setBeautyCategory] = useState('');
  const [homeService, setHomeService] = useState(false);
  // Health doctor/consultation attributes (Services tab only)
  const [healthDepartment, setHealthDepartment] = useState('');
  const [isTelemedicine, setIsTelemedicine] = useState(false);
  // Education programme/course attributes (Services tab only)
  const [eduProgramme, setEduProgramme] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  // Photography package attributes (Services tab only)
  const [photoGenre, setPhotoGenre] = useState('');
  // Transport route attributes (Services tab only)
  const [transportType, setTransportType] = useState('');
  // Event vendor attributes (Services tab only)
  const [eventVendorType, setEventVendorType] = useState('');
  // Retail / agriculture catalogue attributes (Products tab only)
  const [productCategory, setProductCategory] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  // Legal practice area / service-provider job type (Services tab only)
  const [svcCategory, setSvcCategory] = useState('');

  const resetForm = () => {
    setName(''); setDescription(''); setPrice(''); setImageUrl(''); setCaption(''); setStock('');
    setListingType('sale'); setPropertyType(''); setBedrooms(''); setBathrooms('');
    setAreaSqm(''); setPropertyLocation(''); setIsFeatured(false);
    setMenuCategory(''); setIsSpecial(false); setIsRecommended(false);
    setRoomCapacity(''); setRoomAmenities('');
    setVMake(''); setVModel(''); setVYear(''); setVMileage(''); setVFuel('Petrol');
    setVTransmission('Automatic'); setVVin(''); setVCondition('Foreign Used');
    setMedCategory(''); setRequiresRx(false); setPackSize('');
    setSessionKind('class'); setClassLevel('All levels'); setClassSchedule(''); setInstructor(''); setDurationMin('');
    setBeautyCategory(''); setHomeService(false);
    setHealthDepartment(''); setIsTelemedicine(false);
    setFashionCategory(''); setFashionSizes(''); setFashionFabric('');
    setEduProgramme(''); setIsOnline(false);
    setPhotoGenre('');
    setTransportType('');
    setEventVendorType('');
    setProductCategory(''); setUnitLabel('');
    setSvcCategory('');
  };

  const fetchAll = useCallback(async () => {
    try {
      const [svc, prod, gal, rev, enq, bkg] = await Promise.all([
        supabase.from('business_services').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('business_products').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('business_gallery').select('*').eq('business_id', businessId).order('created_at'),
        supabase.from('business_reviews').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('business_enquiries').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
        supabase.from('business_bookings').select('*').eq('business_id', businessId).order('created_at', { ascending: false }),
      ]);
      const failed = [svc, prod, gal, rev, enq, bkg].find(r => r.error);
      if (failed?.error) throw failed.error;
      setServices(svc.data ?? []);
      setProducts(prod.data ?? []);
      setGallery(gal.data ?? []);
      setReviews(rev.data ?? []);
      setEnquiries(enq.data ?? []);
      setBookings(bkg.data ?? []);
    } catch (err: any) {
      console.error('Could not load business content:', err);
      toast.error(
        `Could not load content: ${err.message || 'unknown error'}. ` +
        'If this mentions a missing table, run scripts/sql/apply_all_migrations.sql in Supabase.'
      );
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { toast.error('Please choose an image or video file'); return; }
    if (isImage && file.size > 5 * 1024 * 1024) { toast.error('Image is too large — max 5 MB'); return; }
    if (isVideo && file.size > 50 * 1024 * 1024) { toast.error('Video is too large — max 50 MB'); return; }

    setUploading(true);
    try {
      let uploadFile: File | Blob;
      let ext: string;
      let contentType: string;

      if (isImage) {
        uploadFile = await compressImage(file);
        ext = (uploadFile as File).name.split('.').pop()?.toLowerCase() || 'jpg';
        contentType = 'image/jpeg';
      } else {
        uploadFile = file;
        ext = file.name.split('.').pop()?.toLowerCase() || 'webm';
        contentType = file.type;
      }

      const path = `${user.id}/content-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('business-images')
        .upload(path, uploadFile, { cacheControl: '3600', upsert: false, contentType });
      if (error) throw error;
      const { data } = supabase.storage.from('business-images').getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success(isImage ? 'Image uploaded' : 'Video uploaded');
    } catch (err: any) {
      console.error('Upload failed:', err);
      toast.error(`Upload failed: ${err.message || 'unknown error'}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let error;
      if (tab === 'services') {
        ({ error } = await supabase.from('business_services').insert([{
          business_id: businessId,
          name: name.trim(),
          description: description.trim() || null,
          price: price.trim() || null,
          ...(isHotel ? {
            image_url: imageUrl.trim() || null,
            capacity: roomCapacity.trim() ? parseInt(roomCapacity, 10) : null,
            amenities: roomAmenities.trim() || null,
          } : {}),
          ...(isFitness ? {
            image_url: imageUrl.trim() || null,
            session_kind: sessionKind || null,
            // memberships store their perks in amenities; classes use the schedule fields
            amenities: sessionKind === 'membership' ? (roomAmenities.trim() || null) : null,
            class_level: sessionKind === 'class' ? (classLevel || null) : null,
            class_schedule: sessionKind === 'class' ? (classSchedule.trim() || null) : null,
            instructor: sessionKind === 'class' ? (instructor.trim() || null) : null,
            duration_min: sessionKind === 'class' && durationMin.trim() ? parseInt(durationMin, 10) : null,
          } : {}),
          ...(isBeauty ? {
            image_url: imageUrl.trim() || null,
            service_category: beautyCategory.trim() || null,
            duration_min: durationMin.trim() ? parseInt(durationMin, 10) : null,
            home_service: homeService,
          } : {}),
          ...(isHealth ? {
            image_url: imageUrl.trim() || null,
            service_category: healthDepartment.trim() || null,   // department
            duration_min: durationMin.trim() ? parseInt(durationMin, 10) : null,
            is_telemedicine: isTelemedicine,
          } : {}),
          ...(isEducation ? {
            image_url: imageUrl.trim() || null,
            service_category: eduProgramme.trim() || null,       // programme / level
            instructor: instructor.trim() || null,               // teacher
            class_schedule: classSchedule.trim() || null,
            duration_min: durationMin.trim() ? parseInt(durationMin, 10) : null,
            is_online: isOnline,
          } : {}),
          ...(isPhoto ? {
            image_url: imageUrl.trim() || null,
            service_category: photoGenre.trim() || null,         // genre
            duration_min: durationMin.trim() ? parseInt(durationMin, 10) : null,
          } : {}),
          ...(isTransport ? {
            service_category: transportType.trim() || null,      // route type
            class_schedule: classSchedule.trim() || null,        // departures
            capacity: roomCapacity.trim() ? parseInt(roomCapacity, 10) : null,   // seats
            duration_min: durationMin.trim() ? parseInt(durationMin, 10) : null, // trip time
          } : {}),
          ...(isEvents ? {
            image_url: imageUrl.trim() || null,
            service_category: eventVendorType.trim() || null,    // vendor type
          } : {}),
          ...(isServiceCategoryOnly ? {
            service_category: svcCategory.trim() || null,        // practice area / job / product type
          } : {}),
          ...(isTravel ? {
            image_url: imageUrl.trim() || null,
            service_category: svcCategory.trim() || null,        // package type
          } : {}),
        }]));
      } else if (tab === 'products') {
        ({ error } = await supabase.from('business_products').insert([{
          business_id: businessId,
          name: name.trim(),
          description: description.trim() || null,
          price: price.trim() || null,
          image_url: imageUrl.trim() || null,
          stock_quantity: !isRealEstate && !isMenu && stock.trim() ? parseInt(stock, 10) : null,
          ...(isRealEstate ? {
            listing_type: listingType || null,
            property_type: propertyType.trim() || null,
            bedrooms: bedrooms.trim() ? parseInt(bedrooms, 10) : null,
            bathrooms: bathrooms.trim() ? parseInt(bathrooms, 10) : null,
            area_sqm: areaSqm.trim() ? parseFloat(areaSqm) : null,
            property_location: propertyLocation.trim() || null,
            is_featured: isFeatured,
          } : {}),
          ...(isMenu ? {
            menu_category: menuCategory.trim() || null,
            is_special: isSpecial,
            is_recommended: isRecommended,
          } : {}),
          ...(isCarDealer ? {
            image_url: imageUrl.trim() || null,
            vehicle_make: vMake.trim() || null,
            vehicle_model: vModel.trim() || null,
            vehicle_year: vYear.trim() ? parseInt(vYear, 10) : null,
            mileage_km: vMileage.trim() ? parseInt(vMileage, 10) : null,
            fuel_type: vFuel || null,
            transmission: vTransmission || null,
            vin: vVin.trim() || null,
            vehicle_condition: vCondition || null,
          } : {}),
          ...(isPharmacy ? {
            med_category: medCategory.trim() || null,
            requires_prescription: requiresRx,
            pack_size: packSize.trim() || null,
          } : {}),
          ...(isFashion ? {
            fashion_category: fashionCategory.trim() || null,
            sizes: fashionSizes.trim() || null,
            fabric: fashionFabric.trim() || null,
            is_featured: isFeatured,
          } : {}),
          ...(isCatalogue ? {
            product_category: productCategory.trim() || null,
            unit: unitLabel.trim() || null,
            is_featured: isFeatured,
          } : {}),
        }]));
      } else {
        if (!imageUrl.trim()) { toast.error('Upload a photo or paste an image URL first'); setSaving(false); return; }
        ({ error } = await supabase.from('business_gallery').insert([{
          business_id: businessId,
          image_url: imageUrl.trim(),
          caption: caption.trim() || null,
        }]));
      }
      if (error) throw error;
      toast.success('Added');
      resetForm();
      fetchAll();
    } catch (err: any) {
      console.error('Add failed:', err);
      toast.error(`Could not add: ${err.message || 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (table: string, id: string, label: string) => {
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    const { data, error } = await supabase.from(table).delete().eq('id', id).select();
    if (error) {
      toast.error(`Could not delete: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      toast.error('Nothing was deleted — please refresh and try again. If it persists, the database policies need updating (scripts/sql/apply_all_migrations.sql).');
      return;
    }
    toast.success('Deleted');
    fetchAll();
  };

  const handleBookingStatus = async (id: string, status: 'confirmed' | 'declined') => {
    const { error } = await supabase.from('business_bookings').update({ status }).eq('id', id);
    if (error) {
      toast.error(`Could not update: ${error.message}`);
      return;
    }
    toast.success(status === 'confirmed' ? 'Booking confirmed' : 'Booking declined');
    fetchAll();
  };

  const handleStockUpdate = async (id: string, value: string) => {
    const trimmed = value.trim();
    const stock_quantity = trimmed === '' ? null : parseInt(trimmed, 10);
    if (trimmed !== '' && Number.isNaN(stock_quantity as number)) return;
    const { error } = await supabase.from('business_products').update({ stock_quantity }).eq('id', id);
    if (error) { toast.error(`Could not update stock: ${error.message}`); return; }
    fetchAll();
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm';

  const handleCameraCapture = (url: string, _type: 'photo' | 'video') => {
    setImageUrl(url);
    setShowCamera(false);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-bold text-gray-900 dark:text-white truncate">
          Profile content — {businessName}
        </h3>
        <button onClick={onClose} aria-label="Close content manager" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex-shrink-0 ml-3">
          <X size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); resetForm(); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition ${
              tab === t.id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            <span className="text-xs text-gray-400">
              ({t.id === 'enquiries' ? enquiries.length
                : t.id === 'services' ? services.length
                : t.id === 'products' ? products.length
                : t.id === 'gallery' ? gallery.length
                : t.id === 'reviews' ? reviews.length
                : bookings.filter(b => b.module_key === t.id).length})
            </span>
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 py-6 text-center">Loading content…</p>
        ) : (
          <>
            {/* Existing items */}
            {tab === 'enquiries' && (
              enquiries.length === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">
                    No enquiries yet. Messages from the "Send Enquiry" and product "Enquire" buttons on your public profile land here — only you can see them.
                  </p>
                : <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {enquiries.map(e => (
                      <li key={e.id} className="py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{e.name}</span>
                          <a href={`mailto:${e.email}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{e.email}</a>
                          {e.phone && (
                            <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                              <Phone size={11} />
                              {e.phone}
                            </a>
                          )}
                          {e.context && (
                            <span className="text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded-full">
                              {e.context}
                            </span>
                          )}
                          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                            {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{e.message}</p>
                        <a
                          href={`mailto:${e.email}?subject=${encodeURIComponent(`Re: your enquiry to ${businessName} on NowOpen Africa`)}`}
                          className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <Mail size={12} />
                          Reply by email
                        </a>
                      </li>
                    ))}
                  </ul>
            )}

            {activeModule && (() => {
              const moduleBookings = bookings.filter(b => b.module_key === activeModule.key);
              return moduleBookings.length === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">
                    No {activeModule.tabLabel.toLowerCase()} requests yet. Requests from your public profile land here — only you can see them.
                  </p>
                : <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {moduleBookings.map(b => (
                      <li key={b.id} className="py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{b.customer_name}</span>
                          <a href={`mailto:${b.customer_email}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{b.customer_email}</a>
                          {b.customer_phone && (
                            <a href={`tel:${b.customer_phone}`} className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                              <Phone size={11} />
                              {b.customer_phone}
                            </a>
                          )}
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${STATUS_STYLES[b.status] ?? STATUS_STYLES.pending}`}>
                            {b.status}
                          </span>
                          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                            {b.created_at ? new Date(b.created_at).toLocaleString() : ''}
                          </span>
                        </div>
                        {Array.isArray(b.items) && b.items.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {b.items.map((li: any, idx: number) => (
                              <li key={idx} className="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-300">
                                <span>{li.name} × {li.quantity}</span>
                                {li.price && <span className="text-gray-500 dark:text-gray-400">{li.price}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-600 dark:text-gray-400">
                          {b.item_name && <span>{b.item_name}{b.item_price ? ` · ${b.item_price}` : ''}</span>}
                          {b.requested_date && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock size={12} />
                              {new Date(b.requested_date).toLocaleDateString()}
                              {b.requested_date_end ? ` → ${new Date(b.requested_date_end).toLocaleDateString()}` : ''}
                              {b.requested_time ? ` at ${b.requested_time}` : ''}
                            </span>
                          )}
                          {b.quantity != null && <span>Qty/Guests: {b.quantity}</span>}
                        </div>
                        {b.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{b.notes}</p>}
                        {b.status === 'pending' && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleBookingStatus(b.id, 'confirmed')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition"
                            >
                              <Check size={12} /> Confirm
                            </button>
                            <button
                              onClick={() => handleBookingStatus(b.id, 'declined')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                            >
                              <Ban size={12} /> Decline
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>;
            })()}

            {tab === 'services' && (
              services.length === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">No services yet — add your first below. They appear on your public profile's Services tab.</p>
                : <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {services.map(s => (
                      <li key={s.id} className="flex items-center gap-3 py-2.5">
                        <Tag size={15} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.name}</p>
                          {s.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{s.description}</p>}
                        </div>
                        {s.price && <span className="text-sm text-blue-600 dark:text-blue-400 flex-shrink-0">{s.price}</span>}
                        <button onClick={() => handleDelete('business_services', s.id, s.name)} aria-label={`Delete ${s.name}`} className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex-shrink-0">
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
            )}

            {tab === 'products' && (
              products.length === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">No products yet — add your first below. Visitors can enquire about each product directly.</p>
                : <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {products.map(p => (
                      <li key={p.id} className="flex items-center gap-3 p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg">
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded object-cover flex-shrink-0" />
                          : <div className="w-12 h-12 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0"><Package size={18} className="text-gray-400" /></div>}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.name}</p>
                          {p.price && <p className="text-xs text-blue-600 dark:text-blue-400">{p.price}</p>}
                          <label className="flex items-center gap-1.5 mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                            Stock
                            <input
                              type="number"
                              min={0}
                              defaultValue={p.stock_quantity ?? ''}
                              onBlur={e => handleStockUpdate(p.id, e.target.value)}
                              placeholder="—"
                              className="w-16 px-1.5 py-0.5 border border-gray-200 dark:border-gray-600 rounded text-xs text-gray-700 dark:text-gray-300 bg-transparent"
                            />
                          </label>
                        </div>
                        <button onClick={() => handleDelete('business_products', p.id, p.name)} aria-label={`Delete ${p.name}`} className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded flex-shrink-0">
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
            )}

            {tab === 'gallery' && (
              gallery.length === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">No reels yet — upload or capture your first BusReel below. They appear on your profile's Gallery tab.</p>
                : <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {gallery.map(g => {
                      const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(g.image_url);
                      return (
                        <li key={g.id} className="relative group">
                          {isVideo ? (
                            <>
                              <video src={g.image_url} className="w-full h-20 object-cover rounded-lg" muted preload="metadata" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                                <Play size={18} className="text-white fill-white" />
                              </div>
                            </>
                          ) : (
                            <img src={g.image_url} alt={g.caption || 'Gallery photo'} className="w-full h-20 object-cover rounded-lg" />
                          )}
                          <button
                            onClick={() => handleDelete('business_gallery', g.id, g.caption || 'this reel')}
                            aria-label="Delete reel"
                            className="absolute top-1 right-1 p-1 bg-black/60 text-white rounded opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
            )}

            {tab === 'reviews' && (
              reviews.length === 0
                ? <p className="text-sm text-gray-500 dark:text-gray-400">No reviews yet. Signed-in customers can leave one on your public profile — reviews can't be written or edited by the business.</p>
                : <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {reviews.map(r => (
                      <li key={r.id} className="py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{r.author_name}</span>
                          <span className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star key={star} size={12} className={star <= r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'} />
                            ))}
                          </span>
                          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                            {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                        {r.comment && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{r.comment}</p>}
                      </li>
                    ))}
                  </ul>
            )}

            {/* Add form (enquiries, module tabs, and reviews are read-only for owners) */}
            {!activeModule && tab !== 'reviews' && tab !== 'enquiries' && (
              <form onSubmit={handleAdd} className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Add {tab === 'services' ? (isHotel ? 'a room' : isFitness ? 'a class or plan' : isBeauty ? 'a treatment' : isHealth ? 'a doctor' : isEducation ? 'a programme' : isPhoto ? 'a package' : isTransport ? 'a route' : isEvents ? 'a vendor' : isLegal ? 'a practice area' : isFinance ? 'a product' : 'a service') : tab === 'products' ? (isRealEstate ? 'a property' : isMenu ? 'a menu item' : isCarDealer ? 'a vehicle' : isPharmacy ? 'a medicine' : isFashion ? 'an item' : isAgriculture ? 'produce' : isRetail ? 'a product' : 'a product') : 'a BusReel'}
                </p>

                {tab !== 'gallery' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text" required value={name} onChange={e => setName(e.target.value)}
                      placeholder={tab === 'services' ? (isHotel ? 'Room name, e.g. Deluxe King Room' : isFitness ? 'Name, e.g. Spin Cycle or Monthly Membership' : isBeauty ? 'Treatment, e.g. Gel Manicure' : isHealth ? 'Doctor / consultation, e.g. Dr. Amina Bello' : isEducation ? 'Programme / course, e.g. Primary School' : isPhoto ? 'Package name, e.g. Full Wedding Coverage' : isTransport ? 'Route, e.g. Lagos → Abuja' : isEvents ? 'Vendor service, e.g. Luxury Hall Decoration' : isLegal ? 'Service, e.g. Contract Drafting' : isServiceProvider ? 'Service, e.g. Plumbing Repair' : isFinance ? 'Product, e.g. SME Business Loan' : isConstruction ? 'Service, e.g. Residential Building' : 'Service name, e.g. Event Catering') : isRealEstate ? 'Property title, e.g. 3-Bed Apartment in Lekki' : isMenu ? 'Dish name, e.g. Jollof Rice & Chicken' : isCarDealer ? 'Listing title, e.g. Toyota Camry 2020' : isPharmacy ? 'Medicine name, e.g. Paracetamol 500mg' : isFashion ? 'Item name, e.g. Ankara Maxi Dress' : isAgriculture ? 'Produce, e.g. Paddy Rice' : isRetail ? 'Product, e.g. Fresh Beef (Boneless)' : 'Product name, e.g. Chicken Shawarma'}
                      className={inputCls}
                    />
                    <input
                      type="text" value={price} onChange={e => setPrice(e.target.value)}
                      placeholder='Price, e.g. "₦5,000", "From $200", "Contact us"'
                      className={inputCls}
                    />
                  </div>
                )}
                {tab === 'products' && !isRealEstate && !isMenu && !isCarDealer && (
                  <input
                    type="number" min={0} value={stock} onChange={e => setStock(e.target.value)}
                    placeholder="Stock quantity (optional)"
                    className={inputCls}
                  />
                )}
                {tab === 'products' && isCarDealer && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <input type="text" value={vMake} onChange={e => setVMake(e.target.value)} placeholder="Make, e.g. Toyota" className={inputCls} />
                      <input type="text" value={vModel} onChange={e => setVModel(e.target.value)} placeholder="Model, e.g. Camry" className={inputCls} />
                      <input type="number" min={1950} value={vYear} onChange={e => setVYear(e.target.value)} placeholder="Year" className={inputCls} />
                      <input type="number" min={0} value={vMileage} onChange={e => setVMileage(e.target.value)} placeholder="Mileage (km)" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <select value={vFuel} onChange={e => setVFuel(e.target.value)} className={inputCls}>
                        {['Petrol', 'Diesel', 'Hybrid', 'Electric'].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <select value={vTransmission} onChange={e => setVTransmission(e.target.value)} className={inputCls}>
                        {['Automatic', 'Manual'].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <select value={vCondition} onChange={e => setVCondition(e.target.value)} className={inputCls}>
                        {['New', 'Foreign Used', 'Nigerian Used'].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <input type="text" value={vVin} onChange={e => setVVin(e.target.value)} placeholder="VIN (optional)" className={inputCls} />
                  </div>
                )}
                {tab === 'products' && isPharmacy && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={medCategory} onChange={e => setMedCategory(e.target.value)} placeholder="Category, e.g. Pain & Fever" className={inputCls} />
                      <input type="text" value={packSize} onChange={e => setPackSize(e.target.value)} placeholder="Pack size, e.g. Pack of 20 tablets" className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={requiresRx} onChange={e => setRequiresRx(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Requires a prescription (Rx)
                    </label>
                  </div>
                )}
                {tab === 'products' && isMenu && (
                  <div className="space-y-2">
                    <input
                      type="text" list="menu-category-options" value={menuCategory} onChange={e => setMenuCategory(e.target.value)}
                      placeholder="Menu section, e.g. Mains / Drinks"
                      className={inputCls}
                    />
                    <datalist id="menu-category-options">
                      {MENU_CATEGORY_OPTIONS.map(o => <option key={o} value={o} />)}
                    </datalist>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                        <input type="checkbox" checked={isSpecial} onChange={e => setIsSpecial(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        Today’s special
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                        <input type="checkbox" checked={isRecommended} onChange={e => setIsRecommended(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        Popular / recommended
                      </label>
                    </div>
                  </div>
                )}
                {tab === 'products' && isCatalogue && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={productCategory} onChange={e => setProductCategory(e.target.value)} placeholder={isAgriculture ? 'Produce type, e.g. Grains / Vegetables' : isManufacturing ? 'Product line, e.g. Beverages / Snacks' : 'Category, e.g. Beef / Poultry'} className={inputCls} />
                      <input type="text" value={unitLabel} onChange={e => setUnitLabel(e.target.value)} placeholder={isManufacturing ? 'Unit / MOQ, e.g. per carton · MOQ 20' : 'Unit, e.g. per kg / each / per bag'} className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      {isAgriculture ? 'In season / featured' : isManufacturing ? 'Bestseller / featured' : 'Fresh / flash sale'}
                    </label>
                  </div>
                )}
                {tab === 'products' && isFashion && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input type="text" list="fashion-category-options" value={fashionCategory} onChange={e => setFashionCategory(e.target.value)} placeholder="Category, e.g. Women / Men" className={inputCls} />
                      <input type="text" value={fashionSizes} onChange={e => setFashionSizes(e.target.value)} placeholder="Sizes, e.g. S,M,L,XL" className={inputCls} />
                      <input type="text" value={fashionFabric} onChange={e => setFashionFabric(e.target.value)} placeholder="Fabric, e.g. Ankara cotton" className={inputCls} />
                    </div>
                    <datalist id="fashion-category-options">
                      {FASHION_CATEGORY_OPTIONS.map(o => <option key={o} value={o} />)}
                    </datalist>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Mark as new collection
                    </label>
                  </div>
                )}
                {tab === 'products' && isRealEstate && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <select value={listingType} onChange={e => setListingType(e.target.value)} className={inputCls}>
                        <option value="sale">For Sale</option>
                        <option value="rent">For Rent</option>
                        <option value="shortlet">Short-let</option>
                      </select>
                      <input type="text" value={propertyType} onChange={e => setPropertyType(e.target.value)} placeholder="Type, e.g. Apartment" className={inputCls} />
                      <input type="number" min={0} value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="Beds" className={inputCls} />
                      <input type="number" min={0} value={bathrooms} onChange={e => setBathrooms(e.target.value)} placeholder="Baths" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="number" min={0} value={areaSqm} onChange={e => setAreaSqm(e.target.value)} placeholder="Area (m²)" className={inputCls} />
                      <input type="text" value={propertyLocation} onChange={e => setPropertyLocation(e.target.value)} placeholder="Location, e.g. Lekki, Lagos" className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Feature this property at the top of the portal
                    </label>
                  </div>
                )}
                {tab === 'services' && isHotel && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="number" min={0} value={roomCapacity} onChange={e => setRoomCapacity(e.target.value)} placeholder="Sleeps (guests)" className={inputCls} />
                    <input type="text" value={roomAmenities} onChange={e => setRoomAmenities(e.target.value)} placeholder="Amenities, e.g. AC, Wi-Fi, Breakfast" className={inputCls} />
                  </div>
                )}
                {tab === 'services' && isServiceCategoryOnly && (
                  <input type="text" value={svcCategory} onChange={e => setSvcCategory(e.target.value)} placeholder={isLegal ? 'Practice area, e.g. Property / Litigation' : isFinance ? 'Product type, e.g. Loans / Savings / Insurance' : isConstruction ? 'Service type, e.g. Residential / Civil Works' : isAutomotive ? 'Job type, e.g. Repairs / Diagnostics / Bodywork' : isChildcare ? 'Age group, e.g. Toddlers (1–2) / Pre-school' : isMusic ? 'Act type, e.g. DJ / Live Band / MC' : isDesign ? 'Discipline, e.g. Branding / UI/UX / Motion' : isInsurance ? 'Policy class, e.g. Motor / Health / Life' : isAccounting ? 'Service line, e.g. Tax / Payroll / Audit' : isMarketing ? 'Channel, e.g. SEO / Social / Paid Ads' : isMoney ? 'Service type, e.g. Cash-out / Transfer / Bills' : isSoftware ? 'Practice, e.g. Web / Mobile / Cloud / Security' : isRepair ? 'Device type, e.g. Phones / Laptops / Cameras' : 'Job type, e.g. Plumbing / Electrical'} className={inputCls} />
                )}
                {tab === 'services' && isTravel && (
                  <input type="text" value={svcCategory} onChange={e => setSvcCategory(e.target.value)} placeholder="Package type, e.g. Beach / Safari / Pilgrimage" className={inputCls} />
                )}
                {tab === 'services' && isEvents && (
                  <div>
                    <input type="text" list="event-vendor-options" value={eventVendorType} onChange={e => setEventVendorType(e.target.value)} placeholder="Vendor type, e.g. Catering / DJ / Venue" className={inputCls} />
                    <datalist id="event-vendor-options">
                      {EVENT_VENDOR_OPTIONS.map(o => <option key={o} value={o} />)}
                    </datalist>
                  </div>
                )}
                {tab === 'services' && isTransport && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" list="transport-type-options" value={transportType} onChange={e => setTransportType(e.target.value)} placeholder="Type, e.g. Interstate / City Ride" className={inputCls} />
                      <input type="text" value={classSchedule} onChange={e => setClassSchedule(e.target.value)} placeholder="Departures, e.g. Daily · 6AM, 4PM" className={inputCls} />
                    </div>
                    <datalist id="transport-type-options">
                      {TRANSPORT_TYPE_OPTIONS.map(o => <option key={o} value={o} />)}
                    </datalist>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="number" min={0} value={roomCapacity} onChange={e => setRoomCapacity(e.target.value)} placeholder="Seats (optional)" className={inputCls} />
                      <input type="number" min={0} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Trip time (min, optional)" className={inputCls} />
                    </div>
                  </div>
                )}
                {tab === 'services' && isPhoto && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="text" list="photo-genre-options" value={photoGenre} onChange={e => setPhotoGenre(e.target.value)} placeholder="Genre, e.g. Wedding / Portrait" className={inputCls} />
                    <input type="number" min={0} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Session length (min, optional)" className={inputCls} />
                    <datalist id="photo-genre-options">
                      {PHOTO_GENRE_OPTIONS.map(o => <option key={o} value={o} />)}
                    </datalist>
                  </div>
                )}
                {tab === 'services' && isEducation && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={eduProgramme} onChange={e => setEduProgramme(e.target.value)} placeholder="Programme / level, e.g. Primary" className={inputCls} />
                      <input type="text" value={instructor} onChange={e => setInstructor(e.target.value)} placeholder="Teacher / tutor" className={inputCls} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={classSchedule} onChange={e => setClassSchedule(e.target.value)} placeholder="Schedule, e.g. Mon–Fri · 8AM–3PM" className={inputCls} />
                      <input type="number" min={0} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Session length (min, optional)" className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={isOnline} onChange={e => setIsOnline(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Available online
                    </label>
                  </div>
                )}
                {tab === 'services' && isHealth && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" value={healthDepartment} onChange={e => setHealthDepartment(e.target.value)} placeholder="Department, e.g. Cardiology" className={inputCls} />
                      <input type="number" min={0} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Consult duration (min)" className={inputCls} />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={isTelemedicine} onChange={e => setIsTelemedicine(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Offers video consultation (telemedicine)
                    </label>
                  </div>
                )}
                {tab === 'services' && isBeauty && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input type="text" list="beauty-category-options" value={beautyCategory} onChange={e => setBeautyCategory(e.target.value)} placeholder="Category, e.g. Hair / Nails / Makeup" className={inputCls} />
                      <input type="number" min={0} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Duration (min)" className={inputCls} />
                    </div>
                    <datalist id="beauty-category-options">
                      {BEAUTY_CATEGORY_OPTIONS.map(o => <option key={o} value={o} />)}
                    </datalist>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 select-none">
                      <input type="checkbox" checked={homeService} onChange={e => setHomeService(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Available as home service
                    </label>
                  </div>
                )}
                {tab === 'services' && isFitness && (
                  <div className="space-y-3">
                    <select value={sessionKind} onChange={e => setSessionKind(e.target.value)} className={inputCls}>
                      <option value="class">Class (scheduled session)</option>
                      <option value="membership">Membership plan</option>
                    </select>
                    {sessionKind === 'membership' ? (
                      <input type="text" value={roomAmenities} onChange={e => setRoomAmenities(e.target.value)} placeholder="Perks, e.g. Gym floor, Sauna, Unlimited classes" className={inputCls} />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <select value={classLevel} onChange={e => setClassLevel(e.target.value)} className={inputCls}>
                            {['All levels', 'Beginner', 'Intermediate', 'Advanced'].map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          <input type="number" min={0} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="Duration (min)" className={inputCls} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input type="text" value={classSchedule} onChange={e => setClassSchedule(e.target.value)} placeholder="Schedule, e.g. Mon, Wed, Fri · 6 PM" className={inputCls} />
                          <input type="text" value={instructor} onChange={e => setInstructor(e.target.value)} placeholder="Instructor, e.g. Coach Ada" className={inputCls} />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {tab !== 'gallery' && (
                  <textarea
                    rows={2} value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Short description (optional)"
                    className={inputCls}
                  />
                )}

                {(tab === 'products' || tab === 'gallery' || (tab === 'services' && (isHotel || isFitness || isBeauty || isHealth || isEducation || isPhoto || isEvents || isTravel))) && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input ref={fileRef} type="file" accept="image/*,video/*" onChange={handleUpload} className="hidden" />
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm disabled:opacity-50 flex-shrink-0"
                    >
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploading ? 'Uploading…' : imageUrl ? 'Replace File' : 'Upload Photo/Video'}
                    </button>
                    {tab === 'gallery' && user && (
                      <button
                        type="button"
                        onClick={() => setShowCamera(true)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition text-sm flex-shrink-0"
                      >
                        <Camera size={14} /> BusReel Camera
                      </button>
                    )}
                    <input
                      type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                      placeholder="…or paste an image/video URL"
                      className={inputCls}
                    />
                  </div>
                )}
                {tab === 'gallery' && (
                  <input
                    type="text" value={caption} onChange={e => setCaption(e.target.value)}
                    placeholder="Caption (optional)"
                    className={inputCls}
                  />
                )}

                <button
                  type="submit"
                  disabled={saving || uploading}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {saving ? 'Adding…' : `Add ${tab === 'services' ? 'Service' : tab === 'products' ? 'Product' : 'BusReel'}`}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {showCamera && user && (
        <BusReelCapture
          userId={user.id}
          onCaptured={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
