
"use client";

import { useEffect, useMemo, useState } from "react";
import { locations } from "@/lib/terrascope-data";

type SatellitePass = {
  id: string;
  name: string;
  group: string;
  riseTime: string | null;
  setTime: string | null;
  maxElevationDeg: number;
  status: "upcoming" | "ongoing";
  continuesBeyondWindow: boolean;
};

type SatellitePassResponse = {
  location: {
    latitude: number;
    longitude: number;
  };
  generatedAt: string;
  orbitalDataSource: string;
  minimumElevationDeg: number;
  forecastHours: number;
  satelliteCount: number;
  passCount: number;
  passesReturned: number;
  passes: SatellitePass[];
  error?: string;
  details?: string;
};

function formatUtc(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function hoursFromNow(dateString: string, currentTime: number) {
  return (new Date(dateString).getTime() - currentTime) / 3600000;
}

function satelliteColor(name: string) {
  const colors = [
    "#38e8ff",
    "#fbbf24",
    "#a78bfa",
    "#34d399",
    "#fb7185",
    "#60a5fa",
  ];

  let hash = 0;

  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

export default function Timeline({
  locationId,
}: {
  locationId: string;
}) {
  const [data, setData] = useState<SatellitePassResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  // IMPORTANT: Do not initialize with new Date().
  // The current time is initialized inside useEffect.
  const [now, setNow] = useState<Date | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);

  const location = locations.find(
    (item) => item.id === locationId
  );

  // Initialize and update the clock in the browser only.
  useEffect(() => {
    const tick = () => {
      setNow(new Date());
    };

    tick();

    const timer = window.setInterval(tick, 30000);

    return () => window.clearInterval(timer);
  }, []);

  // Fetch satellite data for the selected location.
  useEffect(() => {
    if (!location) {
      setError("Selected location could not be found.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadPasses() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/satellite-passes?lat=${location!.lat}&lon=${location!.lon}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        const result =
          (await response.json()) as SatellitePassResponse;

        if (!response.ok) {
          throw new Error(
            result.details ||
              result.error ||
              "Unable to load satellite passes."
          );
        }

        setData(result);
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === "AbortError"
        ) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load satellite passes."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadPasses();

    return () => controller.abort();
  }, [locationId, location, refreshKey]);

  // Refresh orbital predictions every 5 minutes.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshKey((previous) => previous + 1);
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Apply filters.
  const passes = useMemo(() => {
    const allPasses = data?.passes ?? [];

    if (filter === "ongoing") {
      return allPasses.filter(
        (pass) => pass.status === "ongoing"
      );
    }

    if (filter === "upcoming") {
      return allPasses.filter(
        (pass) => pass.status === "upcoming"
      );
    }

    return allPasses;
  }, [data, filter]);

  const timelineHours = [0, 4, 8, 12, 16, 20, 24];

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs text-[#8fb0d8]">
            Real orbital data · CelesTrak
          </p>

          <p className="mt-1 text-[11px] text-[#58779e]">
            {location?.name ?? "Selected location"}
            {data
              ? ` · ${data.satelliteCount} satellites tracked`
              : ""}
          </p>
        </div>

        <button
          onClick={() => setRefreshKey((previous) => previous + 1)}
          disabled={loading}
          className="border border-cyan-400/20 px-3 py-1.5 text-xs text-cyan-300 transition hover:bg-cyan-400/10 disabled:opacity-50"
        >
          {loading ? "Loading..." : "↻ Refresh"}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { id: "all", label: "All passes" },
          { id: "ongoing", label: "Ongoing" },
          { id: "upcoming", label: "Upcoming" },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={`border px-3 py-1 text-xs transition ${
              filter === item.id
                ? "border-cyan-300/60 bg-cyan-400/10 text-white"
                : "border-cyan-400/15 text-[#8fb0d8] hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="py-8 text-center text-sm text-cyan-300">
          Calculating real satellite passes...
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Timeline content */}
      {data && now && (
        <>
          <div className="mb-2 flex justify-between text-[10px] text-[#6f8cb3]">
            <span>Next 24 hours · UTC</span>
            <span>{formatUtc(now)} now</span>
          </div>

          {/* Timeline visualization */}
          <div className="overflow-x-auto pb-2">
            <div className="relative h-28 min-w-[640px] border border-cyan-400/15 bg-[#040b1d]">
              {timelineHours.map((hour) => {
                const labelDate = new Date(
                  now.getTime() + hour * 3600000
                );

                return (
                  <div
                    key={hour}
                    className="absolute inset-y-0 border-l border-cyan-400/10"
                    style={{
                      left: `${(hour / 24) * 100}%`,
                    }}
                  >
                    <span className="absolute bottom-1 left-1 font-mono text-[10px] text-[#4d6a91]">
                      {formatUtc(labelDate)}
                    </span>
                  </div>
                );
              })}

              {passes.map((pass, index) => {
                const color = satelliteColor(pass.name);

                const start = pass.riseTime
                  ? hoursFromNow(
                      pass.riseTime,
                      now.getTime()
                    )
                  : 0;

                const end = pass.setTime
                  ? hoursFromNow(
                      pass.setTime,
                      now.getTime()
                    )
                  : 24;

                if (end < 0 || start > 24) {
                  return null;
                }

                const visibleStart = Math.max(0, start);
                const visibleEnd = Math.min(24, end);
                const width = Math.max(
                  visibleEnd - visibleStart,
                  0.15
                );

                return (
                  <div
                    key={pass.id}
                    title={`${pass.name} · ${pass.status} · Maximum elevation ${pass.maxElevationDeg}°`}
                    className="absolute h-3 rounded-full"
                    style={{
                      left: `${(visibleStart / 24) * 100}%`,
                      width: `${(width / 24) * 100}%`,
                      top: 8 + (index % 4) * 17,
                      background: color,
                      boxShadow: `0 0 10px ${color}`,
                      opacity:
                        pass.status === "ongoing" ? 1 : 0.7,
                    }}
                  />
                );
              })}

              {/* Current time marker */}
              <div
                className="absolute inset-y-0 left-0 w-px bg-white shadow-[0_0_8px_#fff]"
                title="Current UTC time"
              />
            </div>
          </div>

          <p className="mt-1 text-[10px] text-[#6f8cb3]">
            Each bar represents a satellite visibility window.
            The timeline begins at the current UTC time.
          </p>

          {/* Pass details */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-semibold text-[#cfe8ff]">
              Satellite pass details
            </p>

            <p className="text-[10px] text-[#6f8cb3]">
              {passes.length} shown
            </p>
          </div>

          {passes.length === 0 ? (
            <p className="py-5 text-center text-xs text-[#6f8cb3]">
              No passes found for this filter in the forecast.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-cyan-400/10">
              {passes.map((pass) => {
                const color = satelliteColor(pass.name);

                return (
                  <li
                    key={pass.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: color }}
                        />

                        <span className="truncate text-xs text-[#cfe8ff]">
                          {pass.name}
                        </span>
                      </div>

                      <p className="mt-1 pl-4 text-[10px] text-[#6f8cb3]">
                        {pass.group}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-mono text-[11px] text-[#8fb0d8]">
                        {pass.riseTime
                          ? `${formatUtc(new Date(pass.riseTime))} UTC`
                          : "Already visible"}

                        {" – "}

                        {pass.setTime
                          ? `${formatUtc(new Date(pass.setTime))} UTC`
                          : "Beyond forecast"}
                      </p>

                      <p className="mt-1 text-[10px]">
                        <span
                          className={
                            pass.status === "ongoing"
                              ? "text-emerald-300"
                              : "text-cyan-300"
                          }
                        >
                          {pass.status === "ongoing"
                            ? "ONGOING"
                            : "UPCOMING"}
                        </span>

                        <span className="ml-2 text-[#8fb0d8]">
                          Max elevation: {pass.maxElevationDeg}°
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-[10px] text-[#58779e]">
            Orbital data: CelesTrak GP / OMM · Minimum elevation:{" "}
            {data.minimumElevationDeg}° · Forecast:{" "}
            {data.forecastHours} hours
          </p>
        </>
      )}
    </div>
  );
}
