import { ShoppingBag, Tag, Film } from 'lucide-react';
import { User, Business, MediaService } from '../types';
import ProfileCard from './ProfileCard';

interface ProfileSectionProps {
  user: User;
  businesses: Business[];
  mediaServices: MediaService[];
  onEdit?: () => void;
}

export default function ProfileSection({ user, businesses, mediaServices, onEdit }: ProfileSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      <ProfileCard user={user} businesses={businesses} mediaServices={mediaServices} onEdit={onEdit} />

      {/* Businesses Section */}
      {businesses.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Businesses</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses.map((business) => (
              <div
                key={business.id}
                className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  <ShoppingBag size={16} className="text-blue-600" />
                  <h3 className="font-medium text-gray-900">{business.name}</h3>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{business.description}</p>
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                  <Tag size={14} className="text-gray-500" />
                  <span>{business.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Media Services Section */}
      {mediaServices.length > 0 && (
        <div className="mt-8 border-t border-gray-200 pt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Media Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mediaServices.map((service) => (
              <div
                key={service.id}
                className="bg-gray-50 rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Film size={16} className="text-pink-600" />
                  <h3 className="font-medium text-gray-900">{service.title}</h3>
                </div>
                <p className="text-sm text-gray-600 line-clamp-2">{service.description}</p>
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                  <Tag size={14} className="text-gray-500" />
                  <span>{service.service_type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
