import { User as UserIcon, MapPin, Phone, Mail, Globe, Image } from 'lucide-react';

interface ProfileCardProps {
  user: any;
  businesses: any[];
  mediaServices: any[];
  onEdit?: () => void;
}

export default function ProfileCard({ user, businesses, mediaServices, onEdit }: ProfileCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
      {/* Cover Image */}
      <div className="relative h-80 bg-gray-200 overflow-hidden">
        {user.cover_image_url ? (
          <img
            src={user.cover_image_url}
            alt={user.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
        )}

        {/* Profile Photo */}
        <div className="absolute -bottom-20 left-8">
          <div className="relative">
            <div className="w-32 h-32 bg-gray-300 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
              {user.profile_image_url ? (
                <img
                  src={user.profile_image_url}
                  alt={user.name}
                  className="w-28 h-28 rounded-full object-cover"
                />
              ) : (
                <UserIcon size={40} className="text-blue-600" />
              )}
            </div>
            {onEdit && (
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <Image size={16} className="text-white" />
              </div>
            )}
          </div>
        </div>

        {/* Edit Button */}
        {onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-4 right-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Edit Profile
          </button>
        )}
      </div>

      {/* Profile Content */}
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {user.name || user.email}
            </h1>
            <p className="text-lg text-gray-600">{user.bio || 'Creative professional on NowOpen Africa'}</p>
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
            >
              Edit Profile
            </button>
          )}
        </div>

        {/* Professional Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Professional Information</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <UserIcon size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-600">Name</p>
                  <p className="text-sm text-gray-900">{user.name || user.email}</p>
                </div>
              </div>
              {user.location && (
                <div className="flex items-start gap-3">
                  <MapPin size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Location</p>
                    <p className="text-sm text-gray-900">{user.location}</p>
                  </div>
                </div>
              )}
              {user.phone && (
                <div className="flex items-start gap-3">
                  <Phone size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Phone</p>
                    <p className="text-sm text-gray-900">{user.phone}</p>
                  </div>
                </div>
              )}
              {user.email && (
                <div className="flex items-start gap-3">
                  <Mail size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Email</p>
                    <p className="text-sm text-gray-900">{user.email}</p>
                  </div>
                </div>
              )}
              {user.website && (
                <div className="flex items-start gap-3">
                  <Globe size={20} className="text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">Website</p>
                    <p className="text-sm text-gray-900">
                      <a href={user.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">
                        {user.website}
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
              {user.skills && (
                <div>
                  <p className="text-xs font-medium text-gray-600">Skills</p>
                  <p className="text-sm text-gray-900">{user.skills}</p>
                </div>
              )}
              {user.experience && (
                <div>
                  <p className="text-xs font-medium text-gray-600">Experience</p>
                  <p className="text-sm text-gray-900">{user.experience}</p>
                </div>
              )}
              {user.education && (
                <div>
                  <p className="text-xs font-medium text-gray-600">Education</p>
                  <p className="text-sm text-gray-900">{user.education}</p>
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
      </div>
    </div>
  );
}
