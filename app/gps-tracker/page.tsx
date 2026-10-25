export default function GPSTrackerPage() {
  return (
    <main className="min-h-screen w-full bg-slate-950">
      <iframe
        src="/gps-tracker/index.html"
        title="Terrascope Live GPS Tracker"
        className="block h-screen w-full border-0"
        allow="geolocation"
      />
    </main>
  );
}