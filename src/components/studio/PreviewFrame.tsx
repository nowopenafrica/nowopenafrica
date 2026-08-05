import { ReactNode } from 'react';
import { PreviewFrameKind } from '../../lib/previewFrames';

// Decorative device mockups around the live preview. Purely visual — the design
// node itself (children) is untouched, so exports still capture exactly what the
// editor shows.
export default function PreviewFrame({
  kind,
  w,
  h,
  scale,
  label,
  children,
}: {
  kind: PreviewFrameKind;
  w: number;
  h: number;
  scale: number;
  label?: string;
  children: ReactNode;
}) {
  const screen = { width: w * scale, height: h * scale };

  if (kind === 'none') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div style={screen} className="rounded-lg overflow-hidden shadow-xl">{children}</div>
        {label && <p className="text-[10px] text-gray-400">{label}</p>}
      </div>
    );
  }

  if (kind === 'phone') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="rounded-[2.2rem] bg-gray-900 dark:bg-black p-2 shadow-2xl ring-1 ring-black/60 relative">
          <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-[3px] h-14 rounded-full bg-gray-800 dark:bg-gray-700" />
          <div className="absolute right-0.5 top-1/2 -translate-y-1/2 w-[3px] h-10 rounded-full bg-gray-800 dark:bg-gray-700" />
          <div className="relative rounded-[1.6rem] overflow-hidden">
            <div style={screen}>{children}</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full" />
          </div>
        </div>
        {label && <p className="text-[10px] text-gray-400">{label}</p>}
      </div>
    );
  }

  if (kind === 'feed') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="rounded-xl bg-gray-900 p-1.5 shadow-2xl">
          <div style={screen} className="rounded-lg overflow-hidden">{children}</div>
        </div>
        <div className="w-4/5 rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 flex items-center gap-2 shadow">
          <span className="w-4 h-4 rounded-full bg-purple-500 shrink-0" />
          <span className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600" />
          <span className="w-6 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600" />
          <span className="w-6 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600" />
        </div>
        {label && <p className="text-[10px] text-gray-400">{label}</p>}
      </div>
    );
  }

  if (kind === 'tablet') {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="rounded-3xl bg-gray-800 dark:bg-black p-2 shadow-2xl ring-1 ring-black/40 relative">
          <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-600" />
          <div className="relative rounded-2xl overflow-hidden">
            <div style={screen}>{children}</div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-6 h-1.5 rounded-full bg-black/40" />
          </div>
        </div>
        {label && <p className="text-[10px] text-gray-400">{label}</p>}
      </div>
    );
  }

  if (kind === 'billboard') {
    return (
      <div className="flex flex-col items-center gap-0">
        <div className="rounded-md bg-gray-300 dark:bg-gray-600 p-2 shadow-xl ring-1 ring-black/30">
          <div style={screen} className="rounded-sm overflow-hidden shadow-inner">{children}</div>
        </div>
        <div className="flex items-start justify-center gap-3">
          <div className="w-2 h-6 bg-gray-400 dark:bg-gray-600 rounded-b" />
          <div className="w-2 h-6 bg-gray-400 dark:bg-gray-600 rounded-b" />
        </div>
        {label && <p className="text-[10px] text-gray-400 mt-1">{label}</p>}
      </div>
    );
  }

  if (kind === 'led') {
    return (
      <div className="flex flex-col items-center gap-0">
        <div className="rounded-md bg-gray-700 dark:bg-gray-900 p-1.5 shadow-xl ring-1 ring-black/50 relative">
          <div style={screen} className="rounded-sm overflow-hidden">{children}</div>
        </div>
        <div className="w-1.5 h-5 bg-gray-600 dark:bg-gray-700" />
        <div className="w-24 h-1 rounded-full bg-gray-500 dark:bg-gray-600" />
        {label && <p className="text-[10px] text-gray-400 mt-1">{label}</p>}
      </div>
    );
  }

  // laptop
  return (
    <div className="flex flex-col items-center gap-0">
      <div className="rounded-t-lg bg-gray-900 p-2 pb-3 shadow-2xl">
        <div style={screen} className="rounded-sm overflow-hidden ring-1 ring-black/40">{children}</div>
        <div className="w-2 h-2 rounded-full bg-gray-700 mx-auto -mb-2 mt-1" />
      </div>
      <div className="w-[115%] h-3 rounded-b-xl bg-gray-200 dark:bg-gray-600 shadow ring-1 ring-black/20 relative">
        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-gray-300 dark:bg-gray-700 rounded-full" />
      </div>
      {label && <p className="text-[10px] text-gray-400 mt-1">{label}</p>}
    </div>
  );
}
