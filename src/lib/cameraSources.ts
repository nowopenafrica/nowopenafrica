/**
 * Every camera the machine can see, named so a person can pick one mid-stream.
 *
 * Front/back covers a phone. It does not cover the setup this is actually for:
 * a laptop with its built-in camera, a USB webcam on the counter, a capture
 * card carrying a real camera, a phone acting as a second angle. Those are all
 * `videoinput` devices with nothing but a label to tell them apart, so the job
 * here is turning that list into something switchable.
 *
 * Pure on purpose — the browser hands over a plain array, and every rule below
 * (naming, ordering, de-duplication, how many to offer) is worth testing
 * without a camera plugged in.
 */

export interface DeviceLike {
  deviceId: string;
  kind: string;
  label?: string;
  groupId?: string;
}

export type SourceKind = 'front' | 'back' | 'external' | 'unknown';

export interface CameraSource {
  deviceId: string;
  /** 1-based, so the UI can say "Camera 2" and mean the second one. */
  index: number;
  /** What to show: "Camera 2 · Logitech C920". */
  label: string;
  /** The device's own name, when the browser gave one. */
  deviceLabel: string;
  kind: SourceKind;
}

/**
 * How many to offer.
 *
 * Four, because that is what a person can hold in their head and reach without
 * a menu — and because a switcher long enough to scroll stops being usable
 * live, which is the only time it gets touched. Anything beyond the fourth is
 * still selectable from the full list; it just does not get a numbered button.
 */
export const MAX_QUICK_SOURCES = 4;

const FRONT = /front|user|selfie|face/i;
const BACK = /back|rear|environment|world/i;
/** Words that only appear on a capture device or an add-on camera. */
const EXTERNAL = /usb|webcam|capture|hdmi|elgato|logitech|razer|obs|virtual|continuity|iriun|droidcam|epoccam/i;

/** What sort of camera this is, as far as its label admits. */
export function sourceKind(label: string | undefined): SourceKind {
  const l = (label ?? '').trim();
  if (!l) return 'unknown';
  // External first: "USB Camera (front)" is an external device, not a selfie
  // camera, and the phone-camera words show up inside longer product names.
  if (EXTERNAL.test(l)) return 'external';
  if (FRONT.test(l)) return 'front';
  if (BACK.test(l)) return 'back';
  return 'unknown';
}

/** Strip the "(04f2:b6d9)" hardware ids browsers append to device labels. */
export function cleanLabel(label: string | undefined): string {
  return (label ?? '')
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
    .trim();
}

const KIND_NOTE: Record<SourceKind, string> = {
  front: 'Front',
  back: 'Back',
  external: 'External',
  unknown: '',
};

/**
 * The camera list, numbered and named.
 *
 * Ordered as the browser reported them rather than sorted: on every platform
 * tested the first entry is the default camera, and re-ordering would move the
 * one somebody is already looking at.
 *
 * A device with no label — which is what you get before permission is granted —
 * still gets a slot, because it is still selectable. It is simply called
 * "Camera 2" until the browser is willing to say more.
 */
export function cameraSources(devices: DeviceLike[] | null | undefined): CameraSource[] {
  if (!Array.isArray(devices)) return [];
  const seen = new Set<string>();
  const out: CameraSource[] = [];

  for (const d of devices) {
    if (d?.kind !== 'videoinput') continue;
    const id = typeof d.deviceId === 'string' ? d.deviceId : '';
    // Firefox reports a '' deviceId for the default device, and some browsers
    // list the same camera twice across groups. Either way, one entry each.
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const deviceLabel = cleanLabel(d.label);
    const kind = sourceKind(d.label);
    const index = out.length + 1;
    const note = deviceLabel || KIND_NOTE[kind];
    out.push({
      deviceId: id,
      index,
      deviceLabel,
      kind,
      label: note ? `Camera ${index} · ${note}` : `Camera ${index}`,
    });
  }
  return out;
}

/** Worth showing a switcher at all? One camera needs no chooser. */
export function hasMultipleSources(sources: CameraSource[]): boolean {
  return sources.length > 1;
}

/** The numbered buttons; the rest stay reachable in the full list. */
export function quickSources(sources: CameraSource[]): CameraSource[] {
  return sources.slice(0, MAX_QUICK_SOURCES);
}

/** Which entry is live, matched on the id the track reports. */
export function activeSource(
  sources: CameraSource[],
  deviceId: string | null | undefined,
): CameraSource | null {
  if (!deviceId) return null;
  return sources.find((s) => s.deviceId === deviceId) ?? null;
}

/**
 * The next camera round the loop, for a one-tap "switch" with no menu.
 *
 * Wraps, so the last camera goes back to the first — the control is meant to
 * be pressed repeatedly while pointing at something, not navigated.
 */
export function nextSource(
  sources: CameraSource[],
  currentDeviceId: string | null | undefined,
): CameraSource | null {
  if (sources.length === 0) return null;
  const at = sources.findIndex((s) => s.deviceId === currentDeviceId);
  if (at === -1) return sources[0];
  return sources[(at + 1) % sources.length];
}

/**
 * Constraints for a specific camera.
 *
 * `exact` on the deviceId, deliberately: an `ideal` deviceId lets the browser
 * quietly hand back a different camera when the requested one is busy, and a
 * switcher that sometimes does nothing is worse than one that reports it could
 * not switch.
 */
export function constraintsForDevice(
  deviceId: string,
  width = 1280,
  height = 720,
  frameRate = 30,
): MediaTrackConstraints {
  return {
    deviceId: { exact: deviceId },
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: frameRate, max: frameRate },
  };
}

/** The device id a live track is actually coming from. */
export function deviceIdOfTrack(
  track: { getSettings?: () => { deviceId?: string } } | null | undefined,
): string | null {
  try {
    return track?.getSettings?.().deviceId ?? null;
  } catch {
    return null;
  }
}
