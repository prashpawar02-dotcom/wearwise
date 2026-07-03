// =====================================================================
// WearWise — weather context (V1, Open-Meteo)
// A small, honest abstraction. Returns null when weather can't be resolved
// (no city, geocoding fails, fetch fails, or malformed response) so the whole
// app degrades gracefully.
//
// Provider: Open-Meteo — free, NO API key / signup required. We send ONLY the
// user's city to geocoding, then ONLY latitude/longitude to the forecast API.
// We never send wardrobe items, outfit data, photos, name, or email.
//
// TODO: Review Open-Meteo attribution and commercial-use terms before public
// paid launch.
// =====================================================================

export type WeatherCategory =
  | "hot"
  | "warm"
  | "mild"
  | "cool"
  | "cold"
  | "rainy"
  | "humid"
  | "windy";

export interface WeatherContext {
  tempC: number;
  /** Short label shown next to the temperature, e.g. "Humid", "Rain likely". */
  summary: string;
  category: WeatherCategory;
  /** Short, practical clothing advice — clothing language only. */
  advice: string;
}

// Clothing-only advice. No alarms, no medical/health claims, no fake precision.
const ADVICE: Record<WeatherCategory, string> = {
  hot: "Choose breathable, light pieces.",
  warm: "Light layers should work well.",
  mild: "Most everyday outfits will work.",
  cool: "Add a light layer.",
  cold: "Layer up today.",
  rainy: "Choose covered shoes and a weather-ready layer.",
  humid: "Avoid heavy fabrics if possible.",
  windy: "Add a secure outer layer.",
};

export function weatherAdviceFor(category: WeatherCategory): string {
  return ADVICE[category];
}

export interface RawWeather {
  tempC: number;
  humidity?: number | null;
  windKph?: number | null;
  rain?: boolean;
}

/**
 * Map raw weather into one wardrobe advice category + a short label.
 * Priority: precipitation → wind → humidity → temperature bands.
 */
export function classifyWeather(raw: RawWeather): { category: WeatherCategory; summary: string } {
  const { tempC, humidity, windKph, rain } = raw;
  if (rain) return { category: "rainy", summary: "Rain likely" };
  if (windKph != null && windKph >= 30) return { category: "windy", summary: "Windy" };
  if (humidity != null && humidity >= 70 && tempC >= 24) return { category: "humid", summary: "Humid" };
  if (tempC >= 32) return { category: "hot", summary: "Hot" };
  if (tempC >= 26) return { category: "warm", summary: "Warm" };
  if (tempC >= 18) return { category: "mild", summary: "Mild" };
  if (tempC >= 10) return { category: "cool", summary: "Cool" };
  return { category: "cold", summary: "Cold" };
}

function toContext(raw: RawWeather): WeatherContext {
  const { category, summary } = classifyWeather(raw);
  return { tempC: Math.round(raw.tempC), summary, category, advice: ADVICE[category] };
}

// Cache upstream responses for 30 min (Next.js fetch option). Typed locally so
// it doesn't depend on Next's global fetch augmentation during a type-check.
type CachedInit = RequestInit & { next?: { revalidate?: number } };
const CACHE_30_MIN: CachedInit = { next: { revalidate: 1800 } };

/** WMO weather codes that mean active precipitation (drizzle/rain/snow/showers/thunder). */
function isWetCode(code: unknown): boolean {
  if (typeof code !== "number") return false;
  return (
    (code >= 51 && code <= 67) || // drizzle + rain (incl. freezing)
    (code >= 71 && code <= 77) || // snow
    (code >= 80 && code <= 86) || // rain/snow showers
    (code >= 95 && code <= 99) //   thunderstorm
  );
}

interface GeoResult {
  latitude: number;
  longitude: number;
}

async function geocodeCity(city: string): Promise<GeoResult | null> {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(city) +
    "&count=1&language=en&format=json";
  const res = await fetch(url, CACHE_30_MIN);
  if (!res.ok) return null;
  const j = (await res.json()) as { results?: Array<{ latitude?: number; longitude?: number }> };
  const first = j?.results?.[0];
  if (typeof first?.latitude !== "number" || typeof first?.longitude !== "number") return null;
  return { latitude: first.latitude, longitude: first.longitude };
}

/**
 * Resolve current weather for a city via Open-Meteo. Returns null (unavailable)
 * when the city can't be geocoded or the forecast can't be read — never throws,
 * never fabricates. Cached server-side (~30 min).
 */
export async function getWeatherContext(city?: string | null): Promise<WeatherContext | null> {
  const place = city?.trim();
  if (!place) return null;

  try {
    const geo = await geocodeCity(place);
    if (!geo) return null;

    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" +
      geo.latitude +
      "&longitude=" +
      geo.longitude +
      "&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m&timezone=auto";
    const res = await fetch(url, CACHE_30_MIN);
    if (!res.ok) return null;

    const j = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        relative_humidity_2m?: number;
        precipitation?: number;
        rain?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const c = j?.current;
    const tempC = c?.temperature_2m;
    if (typeof tempC !== "number" || !Number.isFinite(tempC)) return null;

    const humidity = typeof c?.relative_humidity_2m === "number" ? c.relative_humidity_2m : null;
    // Open-Meteo returns wind_speed_10m in km/h by default.
    const windKph = typeof c?.wind_speed_10m === "number" ? Math.round(c.wind_speed_10m) : null;
    const rain =
      (typeof c?.rain === "number" && c.rain > 0) ||
      (typeof c?.precipitation === "number" && c.precipitation > 0) ||
      isWetCode(c?.weather_code);

    return toContext({ tempC, humidity, windKph, rain });
  } catch {
    return null;
  }
}
