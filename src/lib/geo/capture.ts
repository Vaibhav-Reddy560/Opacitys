/**
 * Client-side location capture for uploads — the browser's Geolocation API,
 * not EXIF. EXIF GPS is where a photo was TAKEN (often stripped by the OS
 * on export, and nonexistent for a screenshot or a Figma export, which is
 * this app's actual common case); this is where the person was when they
 * hit upload, which is what was asked for.
 *
 * `captureLocation` NEVER rejects. A denied permission, a timeout, a
 * non-secure origin (Geolocation is disabled outside https/localhost), or
 * no browser support are all just "no fix" — an upload must never fail or
 * stall because of location.
 */

export interface Fix {
  latitude: number;
  longitude: number;
  /** Metres, straight from `coords.accuracy`. A desktop/IP-derived fix can
   *  be tens of km off — always show this alongside the coordinates rather
   *  than implying a precision the number doesn't have. */
  accuracy: number;
}

const TIMEOUT_MS = 8000;
// A fix from within the last minute is fine to reuse instantly rather than
// re-requesting — most uploads happen in a burst from the same spot.
const MAX_AGE_MS = 60_000;

export function captureLocation(): Promise<Fix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => resolve(null), // denied, unavailable, or timed out — all the same "no fix" outcome
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  });
}

/** Appends lat/lng/accuracy to an upload's query params, or appends nothing. */
export function appendFix(params: URLSearchParams, fix: Fix | null): void {
  if (!fix) return;
  params.set("lat", String(fix.latitude));
  params.set("lng", String(fix.longitude));
  params.set("accuracy", String(fix.accuracy));
}

const STORAGE_KEY = "opacitys:tag-location";

/** "Tag location" toggle preference, remembered across sessions. Defaults
 *  to on — the toggle exists to let someone turn it OFF, not opt in. */
export function readLocationPreference(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === "1";
}

export function writeLocationPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}
