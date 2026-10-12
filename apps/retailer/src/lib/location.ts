// Read the phone's position. One failed reading must not mean "no location": indoors or far from
// the usual spot the fast network fix can time out, so fall back to a slower GPS fix.
export type Point = { lat: number; lng: number; accuracy: number };
export type LocationFailure = "unsupported" | "denied" | "unavailable" | "timeout";

export class LocationError extends Error {
  constructor(public reason: LocationFailure) {
    super(reason);
  }
}

function reading(options: PositionOptions, giveUpMs: number): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new LocationError("unsupported"));
    // the browser's own timeout does not count the time its permission prompt is open
    const timer = setTimeout(() => reject(new LocationError("timeout")), giveUpMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      (err) => {
        clearTimeout(timer);
        reject(new LocationError(err.code === 1 ? "denied" : err.code === 3 ? "timeout" : "unavailable"));
      },
      options,
    );
  });
}

export async function getCurrentPoint(): Promise<Point> {
  let fast: Point | null = null;
  try {
    fast = await reading({ enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }, 10_000);
    if (fast.accuracy <= 150) return fast;
  } catch (e) {
    if (e instanceof LocationError && (e.reason === "denied" || e.reason === "unsupported")) throw e;
  }
  try {
    const precise = await reading({ enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }, 22_000);
    return !fast || precise.accuracy <= fast.accuracy ? precise : fast;
  } catch (e) {
    if (fast) return fast; // a rough position beats none
    throw e;
  }
}

export function locationMessage(reason: LocationFailure): string {
  switch (reason) {
    case "denied":
      return "Location permission is off. Allow location for this app in your phone settings and try again.";
    case "unsupported":
      return "This device cannot share its location.";
    case "timeout":
      return "Could not get your location in time. Go near a window or outdoors and try again.";
    default:
      return "Your phone could not find its location. Turn on location (GPS) and try again.";
  }
}
