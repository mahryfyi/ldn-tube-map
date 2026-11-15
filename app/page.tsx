"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MAP_LINES } from "./lib/lines";
import { createCallout } from "./lib/callout";
import {
    computeTrains,
    fetchArrivals,
    fetchRoute,
    fetchStatuses,
    positionAt,
    type LineStatus,
    type Train,
} from "./lib/tfl";
import {
    addStations,
    addTrainImages,
    addTrainsLayer,
    addTubeLines,
    bearingBetween,
} from "./lib/map-layers";
import { MAP_STYLE, THEME } from "./lib/line.config";
import {
    anchorBetween,
    buildTrack,
    pointAt,
    type Anchor,
    type Track,
} from "./lib/track";
import { StatusPanel } from "./components/molecules/StatusPanel";
import { LiveIndicator } from "./components/atoms/live-indicator";
import { MobileNotice } from "./components/sections/MobileNotice";
import { TABLET_UP, useMediaQuery } from "./lib/use-media-query";

const TRAIN_POLL_MS = 30_000; // ask TfL for train positions every 30 seconds
const STATUS_POLL_MS = 60_000; // line status changes slowly: every minute
const GLIDE_MS = 1500; // a small correction slides over at least this long...
const GLIDE_MAX_MS = 6000; // ...a big one takes longer, but never more than this
const GLIDE_M_PER_S = 500; // speed limit for corrections: 0.5 km per second
const DEG_TO_M = 111_320; // rough metres per degree, for off-track gaps
const FRAME_MS = 50; // redraw the trains at most every 50ms (~20 times a second)
// No good update for this long = the trains are stale (two missed polls). Measured
// from when WE last fetched, not from TfL's timestamps: those are already 1-2 min old.
const STALE_MS = 60_000;
const STALE_OPACITY = 0.4; // stale pills are dimmed, so they don't pose as live
const DEBUG_TRAINS = false; // log each update's biggest gaps to the console (see bugs.md)

// One train, plus what we need to animate it smoothly
type Tracked = {
    train: Train; // as of the last TfL update
    receivedAt: number; // when that update arrived (ms, from performance.now())
    // Its stretch of track (null if the stations couldn't be pinned to it;
    // then the train falls back to a straight line between stations)
    anchor: Anchor | null;
    // How far the pill was from its new true spot at that moment. We slide this
    // gap down to zero, so the pill glides instead of jumping. On track, the gap
    // is metres along the track; off track, a plain lon/lat difference.
    offsetDist: number;
    offsetLon: number;
    offsetLat: number;
    glideMs: number; // how long that slide takes (longer for bigger gaps)
    // The pill is never drawn behind this point on its stretch of track, so
    // a worse-looking new guess can't push it backwards.
    minProgress: number;
    bearing: number; // heading used when off track (0 = north, 90 = east)
};

// A train as drawn right now
type Placed = {
    train: Train;
    bearing: number; // which way the arrow points
    dist: number | null; // metres along its track line (null = off track)
};

// Each train is identified by its line + vehicle number
const trainKey = (t: Train) => `${t.line}:${t.vehicleId}`;

// Does the visitor's system ask for less motion?
const reducedMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Where should this train be drawn at time `now`?
function placeTrain(
    t: Tracked,
    now: number,
    track: Track | undefined,
    reduce = false,
): Placed {
    // Reduced motion: no creeping, no gliding. Show the latest estimate as is,
    // so the pill snaps to its new spot once per update.
    const sinceUpdate = reduce ? 0 : now - t.receivedAt;
    // creeping: carry on towards the next station
    const pos = positionAt(t.train, sinceUpdate / 1000, t.minProgress);
    // gliding: the leftover gap shrinks from 1 (all of it) to 0 (none) at a
    // constant speed (linear), so the motion never speeds up or slows down
    const gapLeft = reduce ? 0 : 1 - Math.min(1, sinceUpdate / t.glideMs);

    const a = t.anchor;
    if (a && track) {
        // On track: progress 0..1 becomes metres between the two stations,
        // and walking that far along the track gives position and heading
        const dist =
            a.fromDist +
            (a.toDist - a.fromDist) * pos.progress +
            t.offsetDist * gapLeft;
        const p = pointAt(track, a.line, dist);
        // Heading: read the track 1m further on in the direction of travel.
        // At a station the track bends, and we want the way out, not the way in.
        const h = pointAt(track, a.line, dist + a.dir);
        return {
            train: {
                ...t.train,
                progress: pos.progress,
                lon: p.lon,
                lat: p.lat,
            },
            // the track's direction, flipped if the train runs the other way
            bearing: a.dir === 1 ? h.bearing : h.bearing + 180,
            dist,
        };
    }

    // Off track: the old straight line between stations
    return {
        train: {
            ...t.train,
            progress: pos.progress,
            lon: pos.lon + t.offsetLon * gapLeft,
            lat: pos.lat + t.offsetLat * gapLeft,
        },
        bearing: t.bearing,
        dist: null,
    };
}

// Trains -> GeoJSON points. Careful: GeoJSON wants [lon, lat].
// Each point carries its line (to pick the right pill picture) and bearing.
function trainsToGeoJSON(trains: Placed[]) {
    return {
        type: "FeatureCollection" as const,
        features: trains.map(({ train: t, bearing }) => ({
            type: "Feature" as const,
            properties: { key: trainKey(t), line: t.line, bearing },
            geometry: { type: "Point" as const, coordinates: [t.lon, t.lat] },
        })),
    };
}

export default function Home() {
    const mapContainer = useRef<HTMLDivElement>(null);
    // Tablet and up gets the map; phones get the status list instead. Below the
    // breakpoint the map is never created, so no Mapbox load and no train polling.
    const showMap = useMediaQuery(TABLET_UP);
    const [statuses, setStatuses] = useState<Record<string, LineStatus>>({});
    const [statusAt, setStatusAt] = useState<number | null>(null); // when they last loaded
    // How fresh the train data is, for the indicator (lastOkAt is Date.now() ms)
    const [feed, setFeed] = useState<{ lastOkAt: number | null; failed: boolean }>({
        lastOkAt: null,
        failed: false,
    });

    // The map and the trains (re-runs when the window crosses the breakpoint:
    // the cleanup at the bottom removes the map, the next run builds a new one)
    useEffect(() => {
        if (!showMap || !mapContainer.current) return;

        mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

        const map = new mapboxgl.Map({
            container: mapContainer.current,
            style: MAP_STYLE[THEME].url, // Light: Mapbox Standard, or your Studio style
            center: [-0.1276, 51.5072], // [lon, lat], central London
            zoom: 10,
        });

        // Our style imports Mapbox Standard. Standard has switches for its own
        // extras: set the lighting and theme for the active mode, and hide its
        // POIs, transit labels and 3D buildings (they'd fight our lines).
        map.on("style.load", () => {
            const base = map.getStyle()?.imports?.[0]?.id;
            if (!base) {
                console.warn(
                    "Map style has no Standard import: slots and config won't apply",
                );
                return;
            }
            const style = MAP_STYLE[THEME];
            map.setConfigProperty(base, "lightPreset", style.lightPreset);
            map.setConfigProperty(base, "theme", style.theme);
            map.setConfigProperty(base, "showPointOfInterestLabels", false);
            map.setConfigProperty(base, "showTransitLabels", false);
            map.setConfigProperty(base, "show3dObjects", false);
        });

        let cancelled = false;
        let timer: ReturnType<typeof setInterval> | undefined;
        let frame = 0; // the animation loop's current request, so we can cancel it
        let onVisible: (() => void) | undefined; // tab-visible listener, removed on cleanup

        map.on("load", async () => {
            // Fetch every line's stations and shape (in parallel)
            const routes = await Promise.all(
                MAP_LINES.map(async (line) => ({
                    line,
                    ...(await fetchRoute(line.id)),
                })),
            );
            if (cancelled) return;

            // Each line's track, measured once, so trains can follow it
            const tracks = new Map(
                routes.map((r) => [r.line.id, buildTrack(r.shape)]),
            );

            // Bottom to top: casings, cores, stations, trains
            addTubeLines(map, routes);
            addStations(map, routes);

            // One shared source for all trains, drawn as pill pictures
            map.addSource("trains", {
                type: "geojson",
                data: trainsToGeoJSON([]),
            });
            addTrainImages(map);
            addTrainsLayer(map);

            // Tooltip: a small label that appears while the mouse is over a train
            const popup = new mapboxgl.Popup({
                closeButton: false,
                offset: 12,
                className: "train-popup", // our dark styling hooks on to this (globals.css)
                maxWidth: "none", // Mapbox wraps at 240px by default; our rows are short
            });

            // The train under the mouse (if any). The animation loop below keeps
            // its label pinned to the pill as the pill moves.
            let hoveredKey: string | null = null;

            // The open callout belongs to one train. We build it once when the
            // mouse reaches a train, then update it in place every frame.
            let callout: ReturnType<typeof createCallout> | null = null;
            let calloutKey: string | null = null;
            let closedAt = 0; // when the last callout closed (ms)

            // ageSeconds: how long ago TfL's data for this train arrived
            function showPopup(t: Train, ageSeconds: number) {
                const key = trainKey(t);
                if (!callout || calloutKey !== key) {
                    callout = createCallout();
                    calloutKey = key;
                    popup.setDOMContent(callout.el);
                }
                callout.update(t, ageSeconds);
                popup.setLngLat([t.lon, t.lat]);
                if (!popup.isOpen()) {
                    // Sliding from one train straight to the next: skip the
                    // entrance animation, like tooltips do (see globals.css)
                    const quick = performance.now() - closedAt < 400;
                    if (quick) popup.addClassName("train-popup-quick");
                    else popup.removeClassName("train-popup-quick");
                    popup.addTo(map);
                }
            }

            function closePopup() {
                if (!popup.isOpen()) return;
                popup.remove();
                calloutKey = null;
                closedAt = performance.now();
            }

            map.on("mousemove", "tube-trains", (e) => {
                // Mapbox's types don't spell out a feature's contents, so we describe them
                const feature = e.features?.[0] as unknown as
                    | { properties: { key: string } }
                    | undefined;
                if (!feature) return;
                map.getCanvas().style.cursor = "pointer";
                hoveredKey = feature.properties.key;
            });

            map.on("mouseleave", "tube-trains", () => {
                map.getCanvas().style.cursor = "";
                hoveredKey = null;
                closePopup();
            });

            // All trains we currently know about, by key
            const tracked = new Map<string, Tracked>();

            // When we last got good train data (performance.now() ms; null = never)
            // and whether the pills are currently dimmed for being stale
            let lastOk: number | null = null;
            let dimmed = false;

            // The animation loop: about 20 times a second, work out where every
            // train should be right now and hand the new positions to the map.
            let lastDraw = 0;
            function draw() {
                frame = requestAnimationFrame(draw); // ask to be called again
                const now = performance.now();
                if (now - lastDraw < FRAME_MS) return; // too soon, skip this one
                lastDraw = now;

                // Dim the pills while the data is stale (and bring them back once fresh)
                const stale = lastOk !== null && now - lastOk > STALE_MS;
                if (stale !== dimmed) {
                    dimmed = stale;
                    map.setPaintProperty(
                        "tube-trains",
                        "icon-opacity",
                        stale ? STALE_OPACITY : 1,
                    );
                }

                const reduce = reducedMotion();
                const placed = [...tracked.values()].map((t) =>
                    placeTrain(t, now, tracks.get(t.train.line), reduce),
                );
                const source = map.getSource(
                    "trains",
                ) as mapboxgl.GeoJSONSource;
                source.setData(trainsToGeoJSON(placed));

                if (hoveredKey) {
                    const hovered = placed.find(
                        (p) => trainKey(p.train) === hoveredKey,
                    );
                    const info = tracked.get(hoveredKey);
                    if (hovered && info)
                        showPopup(hovered.train, (now - info.receivedAt) / 1000);
                    else closePopup(); // that train has left the data
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
                // Every line failed: keep the trains we have (the loop dims them
                // once they go stale) instead of wiping the map, and say so
                if (results.every((r) => r.status === "rejected")) {
                    setFeed((f) => ({ ...f, failed: true }));
                    return;
                }
                const trains = results.flatMap((r) =>
                    r.status === "fulfilled" ? r.value : [],
                );

                // Don't draw anything here: just record the news. The loop draws.
                const now = performance.now();
                const reduce = reducedMotion();
                // After a long gap (a hidden tab, an outage) our old guesses are far
                // from the truth. Forget them: the pills appear in the right place
                // instead of gliding there at 500 m/s.
                const snap = lastOk !== null && now - lastOk > STALE_MS;
                lastOk = now;
                setFeed({ lastOkAt: Date.now(), failed: false });
                const previous = snap
                    ? new Map<string, Tracked>()
                    : new Map(tracked);
                tracked.clear();
                const rows: Record<string, string | number | boolean>[] = []; // debug log
                for (const fresh of trains) {
                    const key = trainKey(fresh);
                    const old = previous.get(key);
                    const track = tracks.get(fresh.line);
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
                        minProgress = placeTrain(old, now, track, reduce).train
                            .progress;
                        // 2. Blend: average the new "seconds to go" with what we'd
                        //    already projected, so one noisy guess can't yank the pill
                        // (may be negative: it was due that long ago)
                        const projected =
                            old.train.secondsToNext -
                            (now - old.receivedAt) / 1000;
                        train = {
                            ...fresh,
                            secondsToNext:
                                (fresh.secondsToNext + projected) / 2,
                        };
                    }

                    // Pin this stretch to the track (keep last time's track line
                    // if it still fits, so the train doesn't hop between copies)
                    const ahead =
                        train.aheadLon !== undefined &&
                        train.aheadLat !== undefined
                            ? { lon: train.aheadLon, lat: train.aheadLat }
                            : undefined;
                    const anchor = track
                        ? anchorBetween(
                              track,
                              { lon: train.fromLon, lat: train.fromLat },
                              { lon: train.toLon, lat: train.toLat },
                              ahead,
                              old?.anchor?.line,
                          )
                        : null;

                    // Heading for when we can't use the track: station behind →
                    // station ahead; standing trains face the stop after this one.
                    const moving =
                        train.fromLon !== train.toLon ||
                        train.fromLat !== train.toLat;
                    const bearing = moving
                        ? bearingBetween(
                              train.fromLon,
                              train.fromLat,
                              train.toLon,
                              train.toLat,
                          )
                        : ahead
                          ? bearingBetween(
                                train.toLon,
                                train.toLat,
                                ahead.lon,
                                ahead.lat,
                            )
                          : (old?.bearing ?? 0);

                    const next: Tracked = {
                        train,
                        receivedAt: now,
                        anchor,
                        offsetDist: 0,
                        offsetLon: 0,
                        offsetLat: 0,
                        glideMs: GLIDE_MS,
                        minProgress,
                        bearing,
                    };

                    // Where the pill is being drawn right now, versus where it should
                    // be: the difference is the gap to glide across.
                    const target = placeTrain(next, now, track);
                    const shown = old
                        ? placeTrain(old, now, track, reduce)
                        : target;
                    let gapM: number;
                    let slid = false; // debug: did the off-track straight slide run?
                    if (
                        shown.dist !== null &&
                        target.dist !== null &&
                        old?.anchor?.line === anchor?.line
                    ) {
                        // Both on the same track line: glide along it
                        next.offsetDist = shown.dist - target.dist;
                        gapM = Math.abs(next.offsetDist);
                    } else {
                        // Otherwise a straight slide (rare: off-track stretches)
                        slid = true;
                        next.offsetLon = shown.train.lon - target.train.lon;
                        next.offsetLat = shown.train.lat - target.train.lat;
                        gapM =
                            Math.hypot(next.offsetLon, next.offsetLat) *
                            DEG_TO_M;
                    }

                    // 3. Speed limit: the bigger the gap, the longer the slide
                    next.glideMs = Math.min(
                        GLIDE_MAX_MS,
                        Math.max(GLIDE_MS, (gapM / GLIDE_M_PER_S) * 1000),
                    );

                    tracked.set(key, next);

                    if (DEBUG_TRAINS) {
                        const sameStretch =
                            old &&
                            old.train.from === fresh.from &&
                            old.train.to === fresh.to;
                        rows.push({
                            key,
                            gapM: Math.round(gapM),
                            secToNext: Math.round(fresh.secondsToNext),
                            seg: Math.round(fresh.segmentSeconds), // estimated stretch time
                            // stations before and after this update, to see what 'other' is
                            oFrom: old?.train.from ?? "",
                            oTo: old?.train.to ?? "",
                            nFrom: fresh.from,
                            nTo: fresh.to,
                            // standing in a station (no stretch behind it)?
                            stand:
                                fresh.fromLon === fresh.toLon &&
                                fresh.fromLat === fresh.toLat,
                            // drawn progress just before this update (>1 = overshoot)
                            oldProg: old ? +shown.train.progress.toFixed(2) : -1,
                            stretch: !old
                                ? "new"
                                : sameStretch
                                  ? "same"
                                  : old.train.to === fresh.from
                                    ? "advanced"
                                    : "other",
                            slid,
                        });
                    }
                }

                if (DEBUG_TRAINS) {
                    // keep every update's full rows, so we can tally them from the console
                    const w = window as unknown as { __trainLog?: unknown[] };
                    (w.__trainLog ??= []).push(rows);
                    const dropped = [...previous.keys()].filter(
                        (k) => !tracked.has(k),
                    );
                    const big = rows
                        .filter((r) => (r.gapM as number) > 50)
                        .sort((a, b) => (b.gapM as number) - (a.gapM as number));
                    console.log(
                        `[trains] ${rows.length} trains, ${rows.filter((r) => r.stretch === "new").length} new, ${dropped.length} dropped, ${big.length} gaps over 50 m`,
                    );
                    if (big.length) console.table(big.slice(0, 10));
                }
            }

            // One update at a time: the tab coming back can land just before a poll
            let updating = false;
            async function refresh() {
                if (updating) return;
                updating = true;
                try {
                    await updateTrains();
                } finally {
                    updating = false;
                }
            }

            await refresh(); // once straight away...
            timer = setInterval(refresh, TRAIN_POLL_MS); // ...then every 30s

            // Coming back to the tab: don't wait up to 30s for the next poll
            onVisible = () => {
                if (document.visibilityState === "visible") refresh();
            };
            document.addEventListener("visibilitychange", onVisible);
        });

        return () => {
            cancelled = true;
            clearInterval(timer);
            cancelAnimationFrame(frame);
            if (onVisible) document.removeEventListener("visibilitychange", onVisible);
            map.remove();
        };
    }, [showMap]);

    // The status panel
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const s = await fetchStatuses();
                if (!cancelled) {
                    setStatuses(s);
                    setStatusAt(Date.now());
                }
            } catch (err) {
                console.error("Could not load line status", err);
            }
        }
        load();
        const timer = setInterval(load, STATUS_POLL_MS);
        // Coming back to the tab: refresh straight away too
        const onVisible = () => {
            if (document.visibilityState === "visible") load();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    // Phones: the status list. (The server always renders this one, because it
    // can't know the window width; on a wide screen it's replaced as soon as the
    // browser takes over.)
    if (!showMap) {
        return <MobileNotice statuses={statuses} updatedAt={statusAt} />;
    }

    return (
        <div className="relative h-screen w-screen">
            <div ref={mapContainer} className="h-full w-full" />
            <StatusPanel
                statuses={statuses}
                updatedAt={statusAt}
                className="absolute top-4 left-4 w-[348px] shadow-md"
            />
            <LiveIndicator
                lastOkAt={feed.lastOkAt}
                failed={feed.failed}
                staleAfterMs={STALE_MS}
            />
        </div>
    );
}
