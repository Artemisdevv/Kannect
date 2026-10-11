/**
 * Best-effort device location. Resolves null when unavailable, denied or slow.
 * The browser's own `timeout` option does not count the time its permission prompt is open, so an
 * unanswered prompt would wait forever: our own timer ends the wait.
 */
export function currentLocation(timeoutMs = 8000): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const giveUp = setTimeout(() => resolve(null), timeoutMs);
    const done = (value: { lat: number; lng: number } | null) => {
      clearTimeout(giveUp);
      resolve(value);
    };
    navigator.geolocation.getCurrentPosition(
      (p) => done({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => done(null),
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
