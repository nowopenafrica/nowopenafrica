// Browser geolocation → a human place name. Requests the OS/browser location
// permission (the prompt appears on the first call), gets the coordinates, then
// reverse-geocodes them to "City, Country" via BigDataCloud's free, no-key,
// CORS-enabled client endpoint. Every failure path throws a clear, friendly
// message so callers can surface it directly.

export interface DetectedLocation {
  latitude: number;
  longitude: number;
  city?: string;
  region?: string;
  country?: string;
  /** Best-effort "City, Country" (falls back to coordinates). */
  label: string;
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

async function reverseGeocode(lat: number, lon: number): Promise<Partial<DetectedLocation>> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
    );
    if (!res.ok) return {};
    const d = await res.json();
    return {
      city: d.city || d.locality || undefined,
      region: d.principalSubdivision || undefined,
      country: d.countryName || undefined,
    };
  } catch {
    return {};
  }
}

export async function detectLocation(): Promise<DetectedLocation> {
  if (!isGeolocationSupported()) {
    throw new Error('Location isn’t supported on this device.');
  }

  const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  }).catch((err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) {
      throw new Error('Location permission was denied. Allow location access in your browser to use this.');
    }
    if (err.code === err.POSITION_UNAVAILABLE) {
      throw new Error('Your location is currently unavailable. Please try again.');
    }
    if (err.code === err.TIMEOUT) {
      throw new Error('Getting your location timed out. Please try again.');
    }
    throw new Error('Could not get your location.');
  });

  const { latitude, longitude } = pos.coords;
  const geo = await reverseGeocode(latitude, longitude);
  const label = [geo.city, geo.country].filter(Boolean).join(', ') || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  return { latitude, longitude, ...geo, label };
}
