import { Loader2, Video } from 'lucide-react';

import { quickSources, activeSource, type CameraSource } from '../../lib/cameraSources';

/**
 * Pick which camera is going out, mid-stream.
 *
 * Numbered buttons rather than a dropdown. This gets used while somebody is
 * live and talking — often one-handed, often looking at the room rather than
 * the screen — and a menu that has to be opened, read and closed is the wrong
 * shape for that. "Camera 2" is a target you can hit without reading.
 *
 * The switch itself never interrupts the broadcast: the hook swaps the track
 * through replaceTrack, so viewers see the picture change without a
 * reconnection or a black frame.
 *
 * Only the first four get buttons. A row long enough to scroll is unusable at
 * the moment it is needed, and four is already more angles than most shops
 * have. The full list stays available underneath when there are more.
 */
export default function CameraSwitcher({
  sources,
  activeDeviceId,
  switching,
  onPick,
}: {
  sources: CameraSource[];
  activeDeviceId: string | null;
  switching: boolean;
  onPick: (deviceId: string) => void;
}) {
  // One camera needs no chooser.
  if (sources.length < 2) return null;

  const quick = quickSources(sources);
  const active = activeSource(sources, activeDeviceId);
  const overflow = sources.slice(quick.length);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Camera source">
        {quick.map((s) => {
          const on = s.deviceId === activeDeviceId;
          return (
            <button
              key={s.deviceId}
              type="button"
              onClick={(e) => { e.stopPropagation(); onPick(s.deviceId); }}
              disabled={switching || on}
              aria-pressed={on}
              // The full device name in the tooltip; the button stays a number.
              title={s.deviceLabel ? `${s.label}` : `Camera ${s.index}`}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-2.5 rounded-lg text-xs font-bold transition disabled:opacity-100 ${
                on
                  ? 'bg-red-600 text-white'
                  : 'bg-black/55 text-white hover:bg-black/75 disabled:opacity-40'
              }`}
            >
              {switching && !on ? <Loader2 size={12} className="animate-spin" /> : <Video size={12} />}
              {s.index}
            </button>
          );
        })}
      </div>

      {/* Which camera is live, spelled out — a number alone does not tell
          somebody whether they are on the counter cam or the phone. */}
      {active?.deviceLabel && (
        <span className="text-[10px] text-white/80 truncate max-w-[190px]">{active.deviceLabel}</span>
      )}

      {overflow.length > 0 && (
        <select
          value={activeDeviceId ?? ''}
          onChange={(e) => onPick(e.target.value)}
          disabled={switching}
          aria-label="All cameras"
          className="max-w-[190px] px-2 min-h-[32px] rounded-lg bg-black/55 text-white text-[11px] border border-white/20"
        >
          {sources.map((s) => (
            <option key={s.deviceId} value={s.deviceId} className="text-gray-900">
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
