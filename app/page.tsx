"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { LINES, MAP_LINES, colourOf, nameOf } from "./lib/lines";
import {
    computeTrains,
    fetchArrivals,
    fetchRoute,
    fetchStatuses,
    positionAt,
    type LineStatus,
    type Train,
} from "./lib/tfl";

const TRAIN_POLL_MS = 30_000; // ask TfL for train positions every 30 seconds
const STATUS_POLL_MS = 60_000; // line status changes slowly: every minute
const GLIDE_MS = 1500; // a small correction slides over at least this long...
const GLIDE_MAX_MS = 6000; // ...a big one takes longer, but never more than this
const GLIDE_DEG_PER_S = 0.005; // speed limit for corrections (~0.5 km per second)
const FRAME_MS = 50; // redraw the dots at most every 50ms (~20 times a second)

// One train, plus what we need to animate it smoothly
type Tracked = {
    train: Train; // as of the last TfL update
    receivedAt: number; // when that update arrived (ms, from performance.now())
    // How far the dot was from its new true spot at that moment. We slide this
    // gap down to zero, so the dot glides instead of jumping.
    offsetLon: number;
    offsetLat: number;
    glideMs: number; // how long that slide takes (longer for bigger gaps)
    // The dot is never drawn behind this point on its stretch of track, so
    // a worse-looking new guess can't push it backwards.
    minProgress: number;
};

// Each train is identified by its line + vehicle number
const trainKey = (t: Train) => `${t.line}:${t.vehicleId}`;

// Where should this train be drawn at time `now`?
function placeTrain(t: Tracked, now: number): Train {
    const sinceUpdate = now - t.receivedAt;
    // creeping: carry on towards the next station
    const pos = positionAt(t.train, sinceUpdate / 1000, t.minProgress);
    // easing: the leftover gap shrinks from 1 (all of it) to 0 (none), gently
    const k = Math.min(1, sinceUpdate / t.glideMs);
    const gapLeft = 1 - k * k * (3 - 2 * k);
    return {
        ...t.train,
        progress: pos.progress,
        lon: pos.lon + t.offsetLon * gapLeft,
        lat: pos.lat + t.offsetLat * gapLeft,
    };
}

// Trains -> GeoJSON points. Careful: GeoJSON wants [lon, lat].
// Each dot carries its line's colour, and the map reads it from there.
function trainsToGeoJSON(trains: Train[]) {
    return {
        type: "FeatureCollection" as const,
        features: trains.map((t) => ({
            type: "Feature" as const,
            properties: {
                key: trainKey(t),
                colour: colourOf(t.line),
            },
            geometry: { type: "Point" as const, coordinates: [t.lon, t.lat] },
        })),
    };
}

// Green = good, amber = minor delays, grey = planned closure, red = the rest
function badgeColour(severity: number) {
    if (severity === 10) return "#1e8e3e";
    if (severity === 9) return "#e8a100";
    if (severity === 4) return "#80868b";
    return "#d93025";
}

export default function Home() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const [statuses, setStatuses] = useState<Record<string, LineStatus>>({});

    // The map and the trains
    useEffect(() => {
        if (!mapContainer.current) return;

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: "mapbox://styles/mahry/cmwe21icb00gr01s8699d9w13", // made in Mapbox Studio
            center: [-0.1276, 51.5072], // [lon, lat], central London
            zoom: 10,
        });

        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | undefined;
        let frame = 0; // the animation loop's current request, so we can cancel it

        map.on("load", async () => {
            // Fetch every line's stations and shape (in parallel)
            const routes = await Promise.all(
                MAP_LINES.map(async (line) => ({
                    line,
                    ...(await fetchRoute(line.id)),
                })),
            );
            if (cancelled) return;

            // One coloured line per Tube line
            for (const { line, shape } of routes) {
                map.addSource(`${line.id}-line`, {
                    type: "geojson",
                    data: {
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "MultiLineString",
                            coordinates: shape,
                        },
                    },
                });
                map.addLayer({
                    id: `${line.id}-line`,
                    type: "line",
                    source: `${line.id}-line`,
                    paint: { "line-color": line.colour, "line-width": 4 },
                });
            }

            // One shared source for all train dots, drawn on top of the lines.
            // "circle-stroke-color": ["get", "colour"] means: each dot's outline
            // takes the colour stored in its own data.
            map.addSource("trains", {
                type: "geojson",
                data: trainsToGeoJSON([]),
            });
            map.addLayer({
                id: "trains-dots",
                type: "circle",
                source: "trains",
                paint: {
                    "circle-radius": 6,
                    "circle-color": "#ffffff",
                    "circle-stroke-color": ["get", "colour"],
                    "circle-stroke-width": 3,
                },
            });

            // Tooltip: a small label that appears while the mouse is over a dot
            const popup = new mapboxgl.Popup({
                closeButton: false,
                offset: 12,
            });

            // The train under the mouse (if any). The animation loop below keeps
            // its label pinned to the dot as the dot moves.
            let hoveredKey: string | null = null;

            function showPopup(t: Train) {
                const box = document.createElement("div");
                box.style.cssText = "font: 12px sans-serif; color: #1a1a1a;";
                const title = document.createElement("strong");
                title.textContent = `${nameOf(t.line)} line · train ${t.vehicleId}`;
                const detail = document.createElement("div");
                detail.textContent =
                    t.from === t.to
                        ? `At ${t.to}`
                        : `${t.from} → ${t.to} (${Math.round(t.progress * 100)}% of the way)`;
                box.append(title, detail);
                popup.setLngLat([t.lon, t.lat]).setDOMContent(box).addTo(map);
            }

            map.on("mousemove", "trains-dots", (e) => {
                // Mapbox's types don't spell out a dot's contents, so we describe them
                const feature = e.features?.[0] as unknown as
                    | { properties: { key: string } }
                    | undefined;
                if (!feature) return;
                map.getCanvas().style.cursor = "pointer";
                hoveredKey = feature.properties.key;
            });

            map.on("mouseleave", "trains-dots", () => {
                map.getCanvas().style.cursor = "";
                hoveredKey = null;
                popup.remove();
            });

            // All trains we currently know about, by key
            const tracked = new Map<string, Tracked>();

            // The animation loop: about 20 times a second, work out where every
            // dot should be right now and hand the new positions to the map.
            let lastDraw = 0;
            function draw() {
                frame = requestAnimationFrame(draw); // ask to be called again
                const now = performance.now();
                if (now - lastDraw < FRAME_MS) return; // too soon, skip this one
                lastDraw = now;

                const placed = [...tracked.values()].map((t) =>
                    placeTrain(t, now),
                );
                const source = map.getSource(
                    "trains",
                ) as mapboxgl.GeoJSONSource;
                source.setData(trainsToGeoJSON(placed));

                if (hoveredKey) {
                    const hovered = placed.find(
                        (t) => trainKey(t) === hoveredKey,
                    );
                    if (hovered) showPopup(hovered);
                    else popup.remove(); // that train has left the data
                }
            }
            frame = requestAnimationFrame(draw);

            async function updateTrains() {
                // allSettled: if one line's request fails, the other lines still update
                const results = await Promise.allSettled(
                    routes.map(async ({ line, network }) =>
                        computeTrains(
                            line.id,
                            network,
                            await fetchArrivals(line.id),
                        ),
                    ),
                );
                if (cancelled) return;
                // Never fail silently: say in the console which line went wrong
                results.forEach((r, i) => {
                    if (r.status === "rejected") {
                        console.error(
                            `Trains for ${routes[i].line.id} failed:`,
                            r.reason,
                        );
                    }
                });
                const trains = results.flatMap((r) =>
                    r.status === "fulfilled" ? r.value : [],
                );

                // Don't draw anything here: just record the news. The loop draws.
                const now = performance.now();
                const previous = new Map(tracked);
                tracked.clear();
                for (const fresh of trains) {
                    const key = trainKey(fresh);
                    const old = previous.get(key);
                    let train = fresh;
                    let minProgress = 0;

                    // Smoothing only applies if it's the same train on the same stretch
                    // of track as last time (otherwise it has genuinely moved on).
                    if (
                        old &&
                        old.train.from === fresh.from &&
                        old.train.to === fresh.to
                    ) {
                        // 1. Never backwards: don't let it fall behind where it's drawn
                        minProgress = placeTrain(old, now).progress;
                        // 2. Blend: average the new "seconds to go" with what we'd
                        //    already projected, so one noisy guess can't yank the dot
                        const projected = Math.max(
                            0,
                            old.train.secondsToNext -
                                (now - old.receivedAt) / 1000,
                        );
                        train = {
                            ...fresh,
                            secondsToNext:
                                (fresh.secondsToNext + projected) / 2,
                        };
                    }

                    // Where the dot is being drawn right now, versus where it should
                    // be: the difference is the gap to glide across.
                    const target = positionAt(train, 0, minProgress);
                    const shown = old ? placeTrain(old, now) : target;
                    const offsetLon = shown.lon - target.lon;
                    const offsetLat = shown.lat - target.lat;

                    // 3. Speed limit: the bigger the gap, the longer the slide
                    const gap = Math.hypot(offsetLon, offsetLat);
                    const glideMs = Math.min(
                        GLIDE_MAX_MS,
                        Math.max(GLIDE_MS, (gap / GLIDE_DEG_PER_S) * 1000),
                    );

                    tracked.set(key, {
                        train,
                        receivedAt: now,
                        offsetLon,
                        offsetLat,
                        glideMs,
                        minProgress,
                    });
                }
            }

            await updateTrains(); // once straight away...
            timer = setInterval(updateTrains, TRAIN_POLL_MS); // ...then every 30s
        });

        return () => {
            cancelled = true;
            clearInterval(timer);
            cancelAnimationFrame(frame);
            map.remove();
        };
    }, []);

    // The status panel
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const s = await fetchStatuses();
                if (!cancelled) setStatuses(s);
            } catch (err) {
                console.error("Could not load line status", err);
            }
        }
        load();
        const timer = setInterval(load, STATUS_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    return (
        <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
            <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />

            <div
                style={{
                    position: "absolute",
                    top: 16,
                    left: 16,
                    background: "white",
                    borderRadius: 8,
                    padding: "10px 12px",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.25)",
                    fontFamily: "sans-serif",
                    fontSize: 13,
                    color: "#1a1a1a",
                    minWidth: 230,
                }}
            >
                {LINES.map((line) => {
                    const status = statuses[line.id];
                    return (
                        <div
                            key={line.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "3px 0",
                                opacity: line.onMap ? 1 : 0.45, // dimmed = not on the map yet
                            }}
                        >
                            <span
                                style={{
                                    width: 14,
                                    height: 6,
                                    borderRadius: 3,
                                    background: line.colour,
                                    flexShrink: 0,
                                }}
                            />
                            <span style={{ flex: 1 }}>{line.name}</span>
                            {status && (
                                <span
                                    style={{
                                        background: badgeColour(
                                            status.severity,
                                        ),
                                        color: "white",
                                        borderRadius: 10,
                                        padding: "1px 8px",
                                        fontSize: 11,
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {status.description}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
