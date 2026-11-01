
import {
  json2satrec,
  propagate,
  gstime,
  eciToEcf,
  eciToGeodetic,
  ecfToLookAngles,
  degreesLat,
  degreesLong,
  degreesToRadians,
} from "satellite.js";

type RawSatellite = {
  OBJECT_NAME?: string;
  NORAD_CAT_ID?: number | string;
  [key: string]: unknown;
};

type SatelliteRecord = {
  record: RawSatellite;
  group: string;
};

const GROUPS = [
  { id: "resource", label: "Earth Resources" },
  { id: "sar", label: "Synthetic Aperture Radar" },
];

const CACHE_DURATION = 2 * 60 * 60 * 1000;
const MIN_ELEVATION_DEG = 10;
const HOURS_AHEAD = 24;
const LOOK_BACK_MINUTES = 120;
const STEP_MINUTES = 1;
const MAX_ALTITUDE_KM = 2000;

// Server-side cache shared by API requests handled
// by the same running server instance.
type CacheEntry = {
  records: SatelliteRecord[];
  expiresAt: number;
  retryAt: number;
  pending?: Promise<SatelliteRecord[]>;
};

const satelliteCache = new Map<string, CacheEntry>();

async function fetchGroup(
  group: (typeof GROUPS)[number],
): Promise<SatelliteRecord[]> {
  const now = Date.now();
  let entry = satelliteCache.get(group.id);

  if (entry?.records.length && now < entry.expiresAt) {
    return entry.records;
  }

  // Reuse an existing request instead of downloading twice.
  if (entry?.pending) {
    return entry.pending;
  }

  // Avoid repeatedly contacting CelesTrak after a failure.
  if (entry && now < entry.retryAt) {
    if (entry.records.length) {
      return entry.records;
    }

    throw new Error(
      `${group.label} is temporarily unavailable. Retry later.`,
    );
  }

  if (!entry) {
    entry = {
      records: [],
      expiresAt: 0,
      retryAt: 0,
    };

    satelliteCache.set(group.id, entry);
  }

  const currentEntry = entry;

  const request = (async () => {
    try {
      const url =
        `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group.id}&FORMAT=JSON`;

      const response = await fetch(url, {
        cache: "force-cache",
        next: { revalidate: 7200 },
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `${group.label} request failed: HTTP ${response.status}`,
        );
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
          `${group.label} returned no satellite records.`,
        );
      }

      const records: SatelliteRecord[] = data.map(
        (record: RawSatellite) => ({
          record,
          group: group.label,
        }),
      );

      currentEntry.records = records;
      currentEntry.expiresAt = Date.now() + CACHE_DURATION;
      currentEntry.retryAt = 0;

      return records;
    } catch (error) {
      console.error(
        `CelesTrak ${group.label} error:`,
        error,
      );

      // Wait two hours before attempting another download.
      currentEntry.retryAt = Date.now() + CACHE_DURATION;

      // If old data exists, use it instead of failing.
      if (currentEntry.records.length > 0) {
        return currentEntry.records;
      }

      throw error;
    } finally {
      currentEntry.pending = undefined;
    }
  })();

  currentEntry.pending = request;

  return request;
}

function interpolateCrossingTime(
  previousTime: number,
  currentTime: number,
  previousElevation: number,
  currentElevation: number,
  threshold: number,
) {
  const difference = currentElevation - previousElevation;

  if (difference === 0) return currentTime;

  const fraction =
    (threshold - previousElevation) / difference;

  return previousTime + fraction * (currentTime - previousTime);
}

function getSatellitePosition(
  satrec: ReturnType<typeof json2satrec>,
  date: Date,
  observer: {
    latitude: number;
    longitude: number;
    height: number;
  },
) {
  const propagated = propagate(satrec, date);

  if (!propagated) return null;

  const position = propagated.position;

  if (!position || typeof position === "boolean") {
    return null;
  }

  const gmst = gstime(date);
  const ecf = eciToEcf(position, gmst);
  const geodetic = eciToGeodetic(position, gmst);
  const lookAngles = ecfToLookAngles(observer, ecf);

  return {
    latitude: degreesLat(geodetic.latitude),
    longitude: degreesLong(geodetic.longitude),
    altitudeKm: geodetic.height,
    elevationDeg: (lookAngles.elevation * 180) / Math.PI,
    azimuthDeg: (lookAngles.azimuth * 180) / Math.PI,
    rangeKm: lookAngles.rangeSat,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const latitude = Number(
      url.searchParams.get("lat") ?? 30.9,
    );

    const longitude = Number(
      url.searchParams.get("lon") ?? 75.85,
    );

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return Response.json(
        { error: "Invalid latitude or longitude." },
        { status: 400 },
      );
    }

    // Fetch both groups independently.
    const groupResults = await Promise.allSettled(
      GROUPS.map((group) => fetchGroup(group)),
    );

    const records = groupResults
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<SatelliteRecord[]> =>
          result.status === "fulfilled",
      )
      .flatMap((result) => result.value);

    if (records.length === 0) {
      const failures = groupResults
        .filter(
          (
            result,
          ): result is PromiseRejectedResult =>
            result.status === "rejected",
        )
        .map((result) =>
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown CelesTrak error",
        );

      return Response.json(
        {
          error: "Satellite data is temporarily unavailable.",
          details: failures.join("; "),
          retryAfterSeconds: 7200,
        },
        {
          status: 503,
          headers: {
            "Retry-After": "7200",
          },
        },
      );
    }

    // Remove duplicate satellite IDs.
    const uniqueRecords = new Map<string, SatelliteRecord>();

    for (const item of records) {
      const id = String(item.record.NORAD_CAT_ID ?? "");

      if (id && !uniqueRecords.has(id)) {
        uniqueRecords.set(id, item);
      }
    }

    const observer = {
      latitude: degreesToRadians(latitude),
      longitude: degreesToRadians(longitude),
      height: 0,
    };

    const now = Date.now();

    const startTime =
      now - LOOK_BACK_MINUTES * 60000;

    const endTime =
      now + HOURS_AHEAD * 3600000;

    const totalSteps =
      (LOOK_BACK_MINUTES + HOURS_AHEAD * 60) /
      STEP_MINUTES;

    const passes: Array<{
      id: string;
      name: string;
      group: string;
      riseTime: string | null;
      setTime: string | null;
      maxElevationDeg: number;
      status: "upcoming" | "ongoing";
      continuesBeyondWindow: boolean;
    }> = [];

    let satelliteCount = 0;

    for (const item of uniqueRecords.values()) {
      const record = item.record;

      const id = String(record.NORAD_CAT_ID ?? "");

      const name = String(
        record.OBJECT_NAME ?? "Unknown satellite",
      );

      if (!id) continue;

      let satrec: ReturnType<typeof json2satrec>;

      try {
        satrec = json2satrec(record as never);
      } catch {
        continue;
      }

      const currentPosition = getSatellitePosition(
        satrec,
        new Date(now),
        observer,
      );

      if (
        !currentPosition ||
        currentPosition.altitudeKm < 120 ||
        currentPosition.altitudeKm > MAX_ALTITUDE_KM
      ) {
        continue;
      }

      satelliteCount++;

      let previousElevation: number | null = null;
      let previousTime = startTime;
      let passStart: number | null = null;
      let passWasVisibleAtStart = false;
      let maxElevation = 0;

      for (let step = 0; step <= totalSteps; step++) {
        const sampleTime =
          startTime + step * STEP_MINUTES * 60000;

        if (sampleTime > endTime) break;

        const position = getSatellitePosition(
          satrec,
          new Date(sampleTime),
          observer,
        );

        if (!position) {
          previousElevation = null;
          previousTime = sampleTime;
          continue;
        }

        const elevation = position.elevationDeg;

        const visible =
          elevation >= MIN_ELEVATION_DEG;

        if (step === 0 && visible) {
          passWasVisibleAtStart = true;
          maxElevation = elevation;
        } else if (
          previousElevation !== null &&
          previousElevation < MIN_ELEVATION_DEG &&
          visible
        ) {
          passStart = interpolateCrossingTime(
            previousTime,
            sampleTime,
            previousElevation,
            elevation,
            MIN_ELEVATION_DEG,
          );

          passWasVisibleAtStart = false;
          maxElevation = elevation;
        } else if (visible) {
          maxElevation = Math.max(
            maxElevation,
            elevation,
          );
        }

        if (
          previousElevation !== null &&
          previousElevation >= MIN_ELEVATION_DEG &&
          !visible
        ) {
          const setTime = interpolateCrossingTime(
            previousTime,
            sampleTime,
            previousElevation,
            elevation,
            MIN_ELEVATION_DEG,
          );

          const riseTime = passWasVisibleAtStart
            ? null
            : passStart;

          if (setTime >= now) {
            passes.push({
              id: `${id}-${Math.round(
                (riseTime ?? startTime) / 60000,
              )}`,
              name,
              group: item.group,
              riseTime:
                riseTime === null
                  ? null
                  : new Date(riseTime).toISOString(),
              setTime: new Date(setTime).toISOString(),
              maxElevationDeg: Number(
                maxElevation.toFixed(1),
              ),
              status:
                riseTime === null || riseTime < now
                  ? "ongoing"
                  : "upcoming",
              continuesBeyondWindow: false,
            });
          }

          passStart = null;
          passWasVisibleAtStart = false;
          maxElevation = 0;
        }

        previousElevation = elevation;
        previousTime = sampleTime;
      }

      // Pass continues beyond the forecast window.
      if (passStart !== null || passWasVisibleAtStart) {
        const riseTime = passWasVisibleAtStart
          ? null
          : passStart;

        passes.push({
          id: `${id}-${Math.round(
            (riseTime ?? startTime) / 60000,
          )}`,
          name,
          group: item.group,
          riseTime:
            riseTime === null
              ? null
              : new Date(riseTime).toISOString(),
          setTime: null,
          maxElevationDeg: Number(
            maxElevation.toFixed(1),
          ),
          status:
            riseTime === null || riseTime < now
              ? "ongoing"
              : "upcoming",
          continuesBeyondWindow: true,
        });
      }
    }

    passes.sort((a, b) => {
      const aTime = a.riseTime
        ? new Date(a.riseTime).getTime()
        : now;

      const bTime = b.riseTime
        ? new Date(b.riseTime).getTime()
        : now;

      return aTime - bTime;
    });

    const shortPasses = passes.slice(0, 20);

    return Response.json({
      location: {
        latitude,
        longitude,
      },
      generatedAt: new Date(now).toISOString(),
      orbitalDataSource: "CelesTrak GP / OMM",
      minimumElevationDeg: MIN_ELEVATION_DEG,
      forecastHours: HOURS_AHEAD,
      satelliteCount,
      passCount: passes.length,
      passesReturned: shortPasses.length,
      passes: shortPasses,
    });
  } catch (error) {
    console.error("Satellite pass API error:", error);

    return Response.json(
      {
        error: "Could not calculate satellite passes.",
        details:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
