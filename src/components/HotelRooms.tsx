import {
  BedDouble, Users, CalendarCheck, MessageCircle, Wifi, Waves, Dumbbell,
  Sparkles, UtensilsCrossed, Presentation, Plane, Car, ShieldCheck, Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface Room {
  id: string | number;
  name: string;
  description?: string;
  price?: string;
  image?: string;
  capacity?: number | null;
  amenities?: string | null;
}

interface Props {
  rooms: Room[];
  bookLabel: string;
  facilities?: string[];
  hasPhone?: boolean;
  onBookRoom: (id: string) => void;
  onWhatsApp: (room: Room) => void;
  onEnquire: (context: string) => void;
}

// Map a facility/amenity name to an icon (best-effort keyword match).
const FACILITY_ICON: { match: RegExp; icon: LucideIcon }[] = [
  { match: /wi-?fi/i, icon: Wifi },
  { match: /pool|swim/i, icon: Waves },
  { match: /gym|fitness/i, icon: Dumbbell },
  { match: /spa/i, icon: Sparkles },
  { match: /restaurant|breakfast|kitchen|bar|dining/i, icon: UtensilsCrossed },
  { match: /conference|meeting|workspace/i, icon: Presentation },
  { match: /airport|shuttle/i, icon: Plane },
  { match: /parking|car/i, icon: Car },
  { match: /security|safe/i, icon: ShieldCheck },
];

function facilityIcon(name: string): LucideIcon {
  return FACILITY_ICON.find((f) => f.match.test(name))?.icon ?? Check;
}

export default function HotelRooms({
  rooms, bookLabel, facilities = [], hasPhone, onBookRoom, onWhatsApp, onEnquire,
}: Props) {
  return (
    <div className="animate-fadeIn space-y-8">
      {/* Facilities */}
      {facilities.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Hotel facilities</h3>
          <div className="flex flex-wrap gap-2">
            {facilities.map((f) => {
              const Icon = facilityIcon(f);
              return (
                <span key={f} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 text-sm">
                  <Icon size={14} className="text-blue-600 dark:text-blue-400" /> {f}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Rooms */}
      <section>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">Rooms &amp; rates</h3>
        {rooms.length === 0 ? (
          <div className="text-center py-12">
            <BedDouble size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No rooms are listed yet.</p>
            <button onClick={() => onEnquire('room availability')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition text-sm">
              Ask about availability
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rooms.map((room) => {
              const amenities = (room.amenities ?? '').split(',').map((a) => a.trim()).filter(Boolean);
              return (
                <div key={room.id} className="flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  {room.image ? (
                    <img src={room.image} alt={room.name} className="w-full h-44 object-cover" />
                  ) : (
                    <div className="w-full h-44 bg-gradient-to-br from-teal-100 to-cyan-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                      <BedDouble size={36} className="text-teal-500 dark:text-gray-400" />
                    </div>
                  )}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-gray-900 dark:text-white">{room.name}</h4>
                      {room.capacity != null && room.capacity > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          <Users size={13} /> {room.capacity}
                        </span>
                      )}
                    </div>
                    {room.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{room.description}</p>}
                    {amenities.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {amenities.slice(0, 5).map((a) => {
                          const Icon = facilityIcon(a);
                          return (
                            <span key={a} className="inline-flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/60 rounded px-1.5 py-0.5">
                              <Icon size={11} className="text-blue-500 dark:text-blue-400" /> {a}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-between gap-2 pt-1">
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{room.price}</span>
                      <div className="flex items-center gap-1.5">
                        {hasPhone && (
                          <button onClick={() => onWhatsApp(room)} aria-label={`Enquire about ${room.name} on WhatsApp`} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
                            <MessageCircle size={15} />
                          </button>
                        )}
                        <button onClick={() => onBookRoom(String(room.id))} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                          <CalendarCheck size={15} /> {bookLabel}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
