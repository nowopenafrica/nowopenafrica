import { Download, Image as ImageIcon, FolderOpen, Cloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { Business } from '../../types';
import { downloadRemoteUrl, slugForFile } from '../../lib/studio';

// A lightweight media library for now: the assets already on the business
// profile. These are the same files Studio uses as flyer/poster backgrounds,
// card covers and QR lockup logos — so what you see here is what prints.
export default function MediaLibrary({ business }: { business: Business }) {
  const items: { key: string; label: string; url: string }[] = [];
  if (business.logo_url) items.push({ key: 'logo', label: 'Logo', url: business.logo_url });
  if (business.image_url) items.push({ key: 'cover', label: 'Cover photo', url: business.image_url });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <div className="flex items-center gap-2 mb-1">
          <FolderOpen size={18} className="text-purple-600 dark:text-purple-400" />
          <h2 className="font-bold text-gray-900 dark:text-white">Brand Files</h2>
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
            <Cloud size={10} /> Cloud synced
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Your profile logo and cover photo, ready for any Studio export. Upload more from your dashboard.
        </p>

        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            <ImageIcon size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
            No images yet. Add a logo and cover photo to your business profile and they will appear here automatically.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {items.map((item) => (
              <div key={item.key} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="h-32 bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                  <img src={item.url} alt={item.label} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.label}</p>
                  <button
                    onClick={async () => { await downloadRemoteUrl(item.url, `${slugForFile(business.name)}-${item.key}.png`); toast.success(`${item.label} downloaded`); }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    <Download size={12} /> Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Soon: folders, video, documents, templates and brand files with drag-and-drop upload.
      </p>
    </div>
  );
}
