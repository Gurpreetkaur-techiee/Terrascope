
"use client";

import { useEffect, useState } from "react";

type WeatherData = {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    wind_speed_10m: number;
    weather_code: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
  };
};

type Props = {
  lat: number;
  lon: number;
  name: string;
};

function getWeatherDescription(code: number) {
  if (code === 0) return "Clear sky";
  if ([1, 2, 3].includes(code)) return "Partly cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";
  return "Weather unavailable";
}

function getWeatherIcon(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function WeatherPanel({ lat, lon, name }: Props) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchWeather() {
      setLoading(true);
      setError("");
      setWeather(null);

      try {
        const response = await fetch(
          `/api/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
          { signal: controller.signal, cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("Weather service is unavailable.");
        }

        const data: WeatherData = await response.json();

        setWeather(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        setError("Unable to load weather information. Please try again.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchWeather();

    return () => controller.abort();
  }, [lat, lon]);

  return (
    <section className="border border-cyan-400/15 bg-[#061126] p-4 shadow-[0_0_25px_rgba(34,211,238,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-wider text-white">
            WEATHER INTELLIGENCE
          </h2>
          <p className="mt-1 text-[11px] text-[#6f8cb3]">
            {name}
          </p>
        </div>

        <span className="border border-green-400/20 bg-green-400/10 px-2 py-1 text-[9px] tracking-wider text-green-300">
          LIVE API
        </span>
      </div>

      {loading && (
        <div className="py-10 text-center text-sm text-cyan-300">
          Fetching weather data...
        </div>
      )}

      {error && (
        <div className="py-6 text-center text-sm text-red-300">
          {error}
        </div>
      )}

      {weather && (
        <>
          <div className="mb-4 border-b border-cyan-400/10 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-4xl font-light text-white">
                  {weather.current.temperature_2m.toFixed(1)}°
                </p>
                <p className="mt-1 text-sm text-cyan-200">
                  {getWeatherDescription(weather.current.weather_code)}
                </p>
                <p className="mt-1 text-[11px] text-[#6f8cb3]">
                  Feels like {weather.current.apparent_temperature.toFixed(1)}°C
                </p>
              </div>

              <span className="text-5xl">
                {getWeatherIcon(weather.current.weather_code)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="border border-cyan-400/10 bg-[#091a33] p-3">
              <p className="text-[10px] text-[#6f8cb3]">HUMIDITY</p>
              <p className="mt-1 text-lg text-white">
                {weather.current.relative_humidity_2m}%
              </p>
            </div>

            <div className="border border-cyan-400/10 bg-[#091a33] p-3">
              <p className="text-[10px] text-[#6f8cb3]">WIND SPEED</p>
              <p className="mt-1 text-lg text-white">
                {weather.current.wind_speed_10m} km/h
              </p>
            </div>

            <div className="border border-cyan-400/10 bg-[#091a33] p-3">
              <p className="text-[10px] text-[#6f8cb3]">RAINFALL</p>
              <p className="mt-1 text-lg text-white">
                {weather.current.precipitation} mm
              </p>
            </div>

            <div className="border border-cyan-400/10 bg-[#091a33] p-3">
              <p className="text-[10px] text-[#6f8cb3]">FEELS LIKE</p>
              <p className="mt-1 text-lg text-white">
                {weather.current.apparent_temperature.toFixed(1)}°C
              </p>
            </div>
          </div>

          <div className="mt-5">
            <h3 className="mb-3 text-xs font-semibold tracking-wider text-white">
              7-DAY FORECAST
            </h3>

            <div className="space-y-2">
              {weather.daily.time.map((date, index) => (
                <div
                  key={date}
                  className="flex items-center justify-between border-b border-cyan-400/10 py-2 text-xs"
                >
                  <span className="w-16 text-[#8fb0d8]">
                    {formatDate(date)}
                  </span>

                  <span className="text-cyan-200">
                    {weather.daily.precipitation_probability_max[index]}% rain
                  </span>

                  <span className="font-mono text-white">
                    {Math.round(weather.daily.temperature_2m_max[index])}°
                    <span className="ml-2 text-[#6f8cb3]">
                      {Math.round(weather.daily.temperature_2m_min[index])}°
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-3 text-[9px] text-[#6f8cb3]">
            Source: Open-Meteo · Forecast for selected coordinates
          </p>
        </>
      )}
    </section>
  );
}
