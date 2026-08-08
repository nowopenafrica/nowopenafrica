import {
  LayoutDashboard, PenTool, Clapperboard, Video, Instagram, Rocket, FileText, MessageCircle,
  Boxes, Newspaper, Users, Bot, TrendingUp, Radar, Braces, LayoutTemplate, Component,
  BookOpen, Crown, type LucideIcon,
} from 'lucide-react';

// Sidebar / module icons keyed by section id, shared by the shell and the
// per-section pages so a section always shows the same mark everywhere.

export const SECTION_ICONS: Record<string, LucideIcon> = {
  command: LayoutDashboard,
  'analytics-war-room': TrendingUp,
  founder: Crown,
  creative: PenTool,
  motion: Clapperboard,
  'video-studio': Video,
  'video-templates': LayoutTemplate,
  'design-system': Component,
  'prompt-library': Braces,
  social: Instagram,
  'campaign-factory': Rocket,
  'content-factory': FileText,
  community: MessageCircle,
  'brand-assets': Boxes,
  'press-room': Newspaper,
  partners: Users,
  'brand-director': Bot,
  trends: Radar,
  launch: Rocket,
  knowledge: BookOpen,
};
