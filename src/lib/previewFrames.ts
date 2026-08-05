// Device mockup options for the Creative Studio live preview. Purely visual
// frames drawn around the design node — exports always capture the raw design.

export type PreviewFrameKind = 'none' | 'phone' | 'feed' | 'tablet' | 'billboard' | 'led' | 'laptop';

export const PREVIEW_FRAME_OPTIONS: { key: PreviewFrameKind; label: string }[] = [
  { key: 'none', label: 'Plain' },
  { key: 'phone', label: 'Phone' },
  { key: 'feed', label: 'Feed' },
  { key: 'tablet', label: 'Tablet' },
  { key: 'billboard', label: 'Billboard' },
  { key: 'led', label: 'LED' },
  { key: 'laptop', label: 'Laptop' },
];
