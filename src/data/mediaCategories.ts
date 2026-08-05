// Shared creative/media service categories — used by the add-media-service
// form and anywhere media categories are offered as options.
//
// MEDIA_SERVICE_TYPES is the flat list forms/selects import. MEDIA_CATEGORY_GROUPS
// adds an icon + description + member set per discipline so the Create browse
// page can render a rich category gallery. Group members are drawn from the
// flat list, so filtering by a group == "service_type in group".

import {
  Camera, Palette, Clapperboard, Megaphone, Mic, Radio,
  type LucideIcon,
} from 'lucide-react';

export const MEDIA_SERVICE_TYPES: string[] = [
  'Photography',
  'Videography',
  'Video Editing',
  'Photo Editing',
  'Drone Photography',
  'Event Photography',
  'Graphic Design',
  'Branding',
  'UI/UX Design',
  'Web Design',
  'Animation',
  'Motion Graphics',
  'Content Creation',
  'Social Media Management',
  'Influencer Marketing',
  'Advertising',
  'Audio Production',
  'Voice-Over',
  'Podcast Production',
  'Live Streaming',
  'Real Estate Media',
];

export interface MediaCategoryGroup {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Accent used for the group card (tailwind color family). */
  accent: string;
  /** Service types (from MEDIA_SERVICE_TYPES) in this discipline. */
  members: string[];
}

export const MEDIA_CATEGORY_GROUPS: MediaCategoryGroup[] = [
  {
    key: 'photo-video',
    label: 'Photo & Video',
    description: 'Photography, film, drone, events and real-estate media',
    icon: Camera,
    accent: 'pink',
    members: ['Photography', 'Videography', 'Video Editing', 'Photo Editing', 'Drone Photography', 'Event Photography', 'Real Estate Media'],
  },
  {
    key: 'design',
    label: 'Design & Branding',
    description: 'Logos, brand identity, UI/UX and web design',
    icon: Palette,
    accent: 'violet',
    members: ['Graphic Design', 'Branding', 'UI/UX Design', 'Web Design'],
  },
  {
    key: 'motion',
    label: 'Animation & Motion',
    description: '2D/3D animation and motion graphics',
    icon: Clapperboard,
    accent: 'amber',
    members: ['Animation', 'Motion Graphics'],
  },
  {
    key: 'content',
    label: 'Content & Social',
    description: 'Content creation, social, influencer and ad campaigns',
    icon: Megaphone,
    accent: 'blue',
    members: ['Content Creation', 'Social Media Management', 'Influencer Marketing', 'Advertising'],
  },
  {
    key: 'audio',
    label: 'Audio & Voice',
    description: 'Music, voice-over and podcast production',
    icon: Mic,
    accent: 'emerald',
    members: ['Audio Production', 'Voice-Over', 'Podcast Production'],
  },
  {
    key: 'streaming',
    label: 'Live & Streaming',
    description: 'Multi-camera livestreams for events and launches',
    icon: Radio,
    accent: 'rose',
    members: ['Live Streaming'],
  },
];

export const DEFAULT_MEDIA_ICON: LucideIcon = Camera;

/** Find the discipline group a service type belongs to (or null). */
export function groupForMediaType(type: string | undefined | null): MediaCategoryGroup | null {
  if (!type) return null;
  return MEDIA_CATEGORY_GROUPS.find((g) => g.members.includes(type)) ?? null;
}
