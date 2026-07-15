import { Phone, Mail, Globe, MapPin } from 'lucide-react';

interface ContactInfoProps {
  business: any;
}

export default function ContactInfo({ business }: ContactInfoProps) {
  return (
    <div className="space-y-3">
      {business.phone && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Phone size={16} className="text-blue-500" />
          <a href={`tel:${business.phone}`} className="hover:text-blue-600">
            {business.phone}
          </a>
        </div>
      )}
      {business.email && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Mail size={16} className="text-blue-500" />
          <a href={`mailto:${business.email}`} className="hover:text-blue-600">
            {business.email}
          </a>
        </div>
      )}
      {business.website && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Globe size={16} className="text-blue-500" />
          <a href={business.website} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600">
            {business.website}
          </a>
        </div>
      )}
      {business.location && (
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <MapPin size={16} className="text-blue-500" />
          <span>{business.location}</span>
        </div>
      )}
    </div>
  );
}
