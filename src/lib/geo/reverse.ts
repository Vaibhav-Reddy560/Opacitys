import "server-only";

/**
 * Reverse geocoding for uploaded-image locations — turns a lat/lng into a
 * human label like "Bengaluru, India" for display. Nominatim
 * (OpenStreetMap's own service): free, keyless, no signup — the only
 * option that doesn't need a card, matching every other provider choice in
 * this app (see feedback-open-source-only).
 *
 * Purely cosmetic: the map draws from lat/lng directly, so a failed or slow
 * lookup here never affects anything but this one label.
 *
 * Usage policy (operations.osmfoundation.org/policies/nominatim), verified
 * before wiring this in:
 *   - Max 1 request/second. This is called once per upload from `after()`,
 *     nowhere near that ceiling — but if this is ever batched, that policy
 *     applies again and systematic/bulk reverse queries are explicitly
 *     prohibited.
 *   - A real, identifying User-Agent is REQUIRED — "stock User-Agents as
 *     set by http libraries will not do." Hence the explicit header below
 *     rather than leaving it to fetch's default.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/reverse";
// Nominatim requires a genuine identifying User-Agent naming the
// application and a contact method — not optional, and not decorative.
const USER_AGENT = "Opacitys/1.0 (design-workspace app; contact: vaibhav.reddy560@gmail.com)";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
  display_name?: string;
}

/** Resolves null on any failure — timeout, network error, malformed
 *  response, or no matching place. Never throws. */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "10"); // city-level, not street-level — this is a "where roughly" label, not an address
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as NominatimResponse;
    const a = json.address;
    if (!a) return null;

    const place = a.city ?? a.town ?? a.village ?? a.county ?? null;
    const country = a.country ?? null;

    if (place && country) return `${place}, ${country}`;
    if (place) return place;
    if (a.state && country) return `${a.state}, ${country}`;
    return country;
  } catch {
    return null;
  }
}
