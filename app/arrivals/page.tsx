"use client";

import { useEffect, useState } from "react";
import { MAP_LINES } from "../lib/lines";
import { computeTrains, fetchArrivals, fetchRoute, type Train } from "../lib/tfl";

// A plain-text view of where every train is, handy for checking the maths.
export default function Arrivals() {
  const [trains, setTrains] = useState<Train[]>([]);

  useEffect(() => {
    Promise.all(
      MAP_LINES.map(async (l) => {
        const { network } = await fetchRoute(l.id);
        return computeTrains(l.id, network, await fetchArrivals(l.id));
      })
    ).then((perLine) => setTrains(perLine.flat()));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Trains on the map lines</h1>
      <p>{trains.length} trains</p>
      <ul>
        {trains.map((t) => (
          <li key={t.line + t.vehicleId}>
            {t.line} {t.vehicleId}: {Math.round(t.progress * 100)}% of the way
            from {t.from} to {t.to}
          </li>
        ))}
      </ul>
    </main>
  );
}
