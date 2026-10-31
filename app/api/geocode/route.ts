
/**
 * GET /api/geocode?lat=47.77&lon=131.87
 *
 * Reverse geocoding using OpenStreetMap Nominatim.
 * Converts fire hotspot coordinates into geographical names.
 */

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  municipality?: string;
  suburb?: string;
  county?: string;
  state_district?: string;
  state?: string;
  region?: string;
  country?: string;
};

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));

  if (
    !params.has("lat") ||
    !params.has("lon") ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return json(
      { error: "Invalid latitude or longitude." },
      400
    );
  }

  // Round coordinates to improve cache reuse.
  const roundedLat = Number(lat.toFixed(3));
  const roundedLon = Number(lon.toFixed(3));

  const url = new URL(
    "https://nominatim.openstreetmap.org/reverse"
  );

  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(roundedLat));
  url.searchParams.set("lon", String(roundedLon));
  url.searchParams.set("zoom", "10");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "TerraScope/1.0",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(15000),
      next: {
        revalidate: 86400,
      },
    });

    if (!response.ok) {
      return json(
        { error: "Location service unavailable." },
        502
      );
    }

    const data = await response.json();

    const address: NominatimAddress =
      data.address ?? {};

    const location =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.municipality ||
      address.suburb ||
      address.county ||
      address.state_district ||
      address.state ||
      address.region ||
      "Unknown area";

    const district =
      address.county ||
      address.state_district ||
      "";

    const state =
      address.state ||
      address.region ||
      "";

    const region = [
      ...new Set(
        [district, state].filter(
          (value) => value && value !== location
        )
      ),
    ].join(", ") || null;

    return json({
      location,
      region,
      country: address.country ?? null,
    });
  } catch (error) {
    console.error("Reverse geocoding error:", error);

    return json(
      { error: "Unable to retrieve geographical location." },
      502
    );
  }
}
