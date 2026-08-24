import { useState } from 'react';
import toast from 'react-hot-toast';
import { BookOpen, Plus, Trash2, Send, Download, X, Star, Copy, Eye } from 'lucide-react';
import { Business } from '../../types';
import {
  Catalogue, CatalogueCategory,
  CATALOGUE_CATEGORIES, catalogueCategoryLabel,
  createCatalogue, createCatalogueItem,
  formatCataloguePrice, catalogueFullText,
  loadCatalogue, saveCatalogue,
} from '../../lib/catalogue';
import { downloadText, slugForFile, profileUrl } from '../../lib/studio';

interface Props {
  business: Business;
}

export default function DigitalCatalogue({ business }: Props) {
  const [catalogue, setCatalogue] = useState<Catalogue>(() => loadCatalogue(business.id) || createCatalogue(business));
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState(0);
  const [category, setCategory] = useState<CatalogueCategory>('products');
  const [emoji, setEmoji] = useState('📦');
  const [featured, setFeatured] = useState(false);

  const persist = (next: Catalogue) => {
    setCatalogue(next);
    saveCatalogue(business.id, next);
  };

  const addItem = () => {
    if (!name.trim()) return toast.error('Add a name first.');
    const item = createCatalogueItem({ name, description, price, category, emoji, featured });
    persist({ ...catalogue, items: [item, ...catalogue.items], updatedAt: new Date().toISOString() });
    setName(''); setDescription(''); setPrice(0); setEmoji('📦'); setFeatured(false);
    setShowForm(false);
    toast.success('Item added to catalogue');
  };

  const removeItem = (id: string) => {
    persist({ ...catalogue, items: catalogue.items.filter((i) => i.id !== id), updatedAt: new Date().toISOString() });
  };

  const toggleFeatured = (id: string) => {
    persist({ ...catalogue, items: catalogue.items.map((i) => (i.id === id ? { ...i, featured: !i.featured } : i)), updatedAt: new Date().toISOString() });
  };

  const share = () => {
    const text = catalogueFullText(catalogue, business);
    if (business.phone) {
      const digits = business.phone.replace(/[^\d]/g, '').replace(/^0/, '234');
      window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank');
    } else toast.success('Copy the catalogue and share it from your phone.');
  };

  const download = () => {
    downloadText(catalogueFullText(catalogue, business), `${slugForFile(business.name)}-catalogue.txt`);
    toast.success('Catalogue downloaded');
  };

  const copy = () => {
    navigator.clipboard?.writeText(catalogueFullText(catalogue, business)).then(() => toast.success('Catalogue copied'));
  };

  const grouped = CATALOGUE_CATEGORIES.map((c) => ({
    cat: c,
    items: catalogue.items.filter((i) => i.category === c.key),
  })).filter((g) => g.items.length > 0);
  const totalValue = catalogue.items.reduce((s, i) => s + i.price, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">{catalogue.title}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{catalogue.subtitle}</p>
            <p className="text-[11px] text-gray-400 mt-1">{catalogue.items.length} items · {formatCataloguePrice(totalValue) === 'Ask' ? 'mixed pricing' : `value ${formatCataloguePrice(totalValue)}`}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
              {showForm ? <><X size={15} /> Close</> : <><Plus size={15} /> Add item</>}
            </button>
            <button onClick={copy} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition min-h-[44px]">
              <Copy size={14} /> Copy
            </button>
            <button onClick={download} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-sm font-medium bg-gray-900 dark:bg-gray-700 text-white hover:opacity-90 transition min-h-[44px]">
              <Download size={14} /> Download
            </button>
            <button onClick={share} className="inline-flex items-center gap-1.5 px-3 .5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition min-h-[44px]">
              <Send size={14} /> Share on WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex gap-2">
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🙂" className="inline-flex items-center w-14 px-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm text-center min-h-[44px]" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name (e.g. Grill platter)"
                className="flex-1 px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px] items-center" />
            </div>
            <div className="flex gap-2">
              <input type="number" min="0" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} placeholder="Price (₦) — 0 to show 'Ask'"
                className="flex-1 px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px] items-center" />
              <select value={category} onChange={(e) => setCategory(e.target.value as CatalogueCategory)}
                className="inline-flex items-center px-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm min-h-[44px]">
                {CATALOGUE_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)"
            className="w-full min-h-[54px] px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg text-sm" />
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="accent-purple-600" />
              Mark as featured (★)
            </label>
            <button onClick={addItem} className="inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-700 transition min-h-[44px]">
              <Plus size={15} /> Add item
            </button>
          </div>
        </div>
      )}

      {/* Catalogue view */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <BookOpen size={24} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Your catalogue is empty. Add products, services or menu items to share.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grouped.flatMap((g) =>
            g.items.map((i) => (
              <div key={i.id} className={`rounded-2xl border bg-white dark:bg-gray-800 p-4 ${i.featured ? 'border-amber-300 dark:border-amber-600' : 'border-gray-200 dark:border-gray-700'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl">{i.emoji}</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${i.featured ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {i.featured && <Star size={10} />} {catalogueCategoryLabel(i.category)}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-2">{i.name}</h3>
                {i.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{i.description}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-base font-black text-purple-600 dark:text-purple-400">{formatCataloguePrice(i.price)}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => toggleFeatured(i.id)} title={i.featured ? 'Remove featured' : 'Feature'} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 transition">
                      <Star size={14} />
                    </button>
                    <button onClick={() => removeItem(i.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 transition">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )),
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 flex items-center gap-1">
        <Eye size={12} /> Readable on any phone — share the full catalogue on WhatsApp, download it as text for printing, or keep it on your profile at {profileUrl(business)}.
      </p>
    </div>
  );
}
