// Everything we draw on the map: lines, stations and train pills.
// Colours come from the Figma tokens (Light by default); sizes and opacities
// from line.config.ts.

import type mapboxgl from "mapbox-gl";
import { tubeTokens, type TubeLineId } from "../tokens/tokens";
import {
  BEAD,
  CASING,
  CORE,
  GLOW,
  GLOW_ENABLED,
  HALO,
  INTERCHANGE,
  STATION_LABEL,
  THEME,
  TRAIN,
  byZoom,
} from "./line.config";
import { clean, type Network } from "./tfl";

export type Route = { line: { id: string }; network: Network; shape: number[][][] };

// The tokens for the active theme: tubeTokens.light unless line.config.ts says dark
const T = tubeTokens[THEME];

// Our layers sit in Mapbox Standard's "middle" slot: above roads and water,
// below the base style's labels.
const SLOT = "middle";

// Pick each feature's colour from its `line` property:
// ['match', ['get','line'], 'bakerloo', '#B36305', 'central', '#E32017', ..., fallback]
// (Mapbox's types can't describe a match built in a loop, hence the cast.)
function byLine(colours: Record<string, string>, fallback = "#888888") {
  const pairs = Object.entries(colours).flat();
  return ["match", ["get", "line"], ...pairs, fallback] as unknown as string;
}
export const lineColourExpr = () => byLine(T.line);

// --- Lines ----------------------------------------------------------------
// One source for all lines, drawn in passes across ALL lines: every casing
// first, then every core. (Dark: halo, glow, core.) If we went line by line,
// one line's casing would paint over the core of a line drawn earlier.
export function addTubeLines(map: mapboxgl.Map, routes: Route[]) {
  map.addSource("tube-lines", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: routes.map(({ line, shape }) => ({
        type: "Feature",
        properties: { line: line.id },
        geometry: { type: "MultiLineString", coordinates: shape },
      })),
    },
  });

  const layout = { "line-join": "round", "line-cap": "round" } as const;
  const colour = lineColourExpr();

  if (THEME === "light") {
    // White casing, a little wider than the core, so crossing and parallel
    // lines stay apart on a light ground.
    map.addLayer({
      id: "tube-casing",
      type: "line",
      source: "tube-lines",
      slot: SLOT,
      layout,
      paint: {
        "line-color": CASING.colour,
        "line-opacity": CASING.opacity,
        "line-width": byZoom(CASING.width),
        "line-emissive-strength": 1,
      },
    });
  } else if (GLOW_ENABLED) {
    map.addLayer({
      id: "tube-halo",
      type: "line",
      source: "tube-lines",
      slot: SLOT,
      minzoom: HALO.minzoom,
      layout,
      paint: {
        "line-color": colour,
        "line-opacity": HALO.opacity,
        "line-width": byZoom(HALO.width),
        "line-blur": byZoom(HALO.blur),
        "line-emissive-strength": 1, // stays vivid whatever the light preset
      },
    });
    map.addLayer({
      id: "tube-glow",
      type: "line",
      source: "tube-lines",
      slot: SLOT,
      layout,
      paint: {
        "line-color": colour,
        "line-opacity": GLOW.opacity,
        "line-width": byZoom(GLOW.width),
        "line-blur": byZoom(GLOW.blur),
        "line-emissive-strength": 1,
      },
    });
  }
  map.addLayer({
    id: "tube-core",
    type: "line",
    source: "tube-lines",
    slot: SLOT,
    layout,
    paint: {
      "line-color": colour,
      "line-opacity": CORE.opacity,
      "line-width": byZoom(CORE.width),
      "line-emissive-strength": 1,
    },
  });
}

// --- Stations -------------------------------------------------------------
// A station served by 2+ of our lines is an interchange. We match by cleaned
// name, not ID: the same interchange can have a different ID on each line.
export function buildStations(routes: Route[]) {
  const byName = new Map<
    string,
    { name: string; lon: number; lat: number; lines: Set<string> }
  >();
  for (const { line, network } of routes) {
    for (const s of network.stations.values()) {
      const key = clean(s.name);
      const entry = byName.get(key) ?? {
        name: s.name,
        lon: s.lon,
        lat: s.lat,
        lines: new Set<string>(),
      };
      entry.lines.add(line.id);
      byName.set(key, entry);
    }
  }
  return {
    type: "FeatureCollection" as const,
    features: [...byName.values()].map((s) => ({
      type: "Feature" as const,
      // A bead belongs to one line, so it also carries that line's id
      // (for its outline colour). Interchanges have no single line.
      properties: {
        name: s.name,
        interchange: s.lines.size >= 2,
        line: s.lines.size === 1 ? [...s.lines][0] : "",
      },
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] },
    })),
  };
}

// Progressive disclosure: interchanges from z10, beads from z12, names from z14
export function addStations(map: mapboxgl.Map, routes: Route[]) {
  map.addSource("tube-stations", { type: "geojson", data: buildStations(routes) });

  const dot = (radius: number, strokeWidth: number, stroke: string) => ({
    "circle-radius": radius,
    "circle-color": T.station.fill,
    "circle-stroke-color": stroke,
    "circle-stroke-width": strokeWidth,
    "circle-emissive-strength": 1,
  });

  // Bead outline: Light = the dark shade of its own line. Dark = ground colour.
  const beadStroke =
    THEME === "light" ? byLine(T.lineDark, T.station.stroke) : T.station.stroke;

  map.addLayer({
    id: "tube-beads",
    type: "circle",
    source: "tube-stations",
    slot: SLOT,
    minzoom: BEAD.minzoom,
    filter: ["==", ["get", "interchange"], false],
    paint: dot(BEAD.radius, BEAD.strokeWidth, beadStroke),
  });
  map.addLayer({
    id: "tube-interchanges",
    type: "circle",
    source: "tube-stations",
    slot: SLOT,
    minzoom: INTERCHANGE.minzoom,
    filter: ["==", ["get", "interchange"], true],
    // Interchange ring: station/stroke (#1A1A1A in Light)
    paint: dot(INTERCHANGE.radius, INTERCHANGE.strokeWidth, T.station.stroke),
  });
  map.addLayer({
    id: "tube-station-labels",
    type: "symbol",
    source: "tube-stations",
    slot: SLOT,
    minzoom: STATION_LABEL.minzoom,
    layout: {
      "text-field": ["get", "name"],
      "text-size": STATION_LABEL.size,
      "text-anchor": "top",
      "text-offset": [0, 0.8],
    },
    paint: {
      "text-color": STATION_LABEL.colour[THEME],
      "text-halo-color": T.map.ground,
      "text-halo-width": STATION_LABEL.haloWidth,
      "text-emissive-strength": 1,
    },
  });
}

// --- Trains ---------------------------------------------------------------
// Lucide's "arrow-right" icon, as path data on its 24×24 grid
const ARROW_PATHS = ["M5 12h14", "m12 5 7 7-7 7"];

// One picture per line: a pill, a 1px outline in the line colour (outside the
// pill) and an arrow pointing right (east). Every line shares the same pill
// fill and white arrow (Figma line update); only the outline changes colour.
// Light's 80% fill opacity is in the token itself (#1A1A1ACC), so
// TRAIN.fillOpacity stays 1 for Light. Dark's 80% is applied below. The
// outline and arrow stay solid.
function drawTrainImage(id: TubeLineId) {
  const { width, height, outline, arrowSize, pixelRatio } = TRAIN;
  const colour = T.line[id];
  const fill = T.train.fill;
  const arrow = T.train.arrow;
  const w = width + outline * 2; // room for the outline outside the pill
  const h = height + outline * 2;
  const canvas = document.createElement("canvas");
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pixelRatio, pixelRatio);

  const pill = (x: number, y: number, pw: number, ph: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, ph / 2);
  };

  // Outline: a pill 1px bigger all round, in the line colour...
  pill(0, 0, w, h);
  ctx.fillStyle = colour;
  ctx.fill();
  // ...then punch out the inside, so a semi-transparent fill (Dark) shows
  // the map, not the outline colour.
  ctx.globalCompositeOperation = "destination-out";
  pill(outline, outline, width, height);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  // Fill
  pill(outline, outline, width, height);
  ctx.globalAlpha = TRAIN.fillOpacity[THEME];
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Arrow, scaled from lucide's 24px grid into a 6px box in the middle
  ctx.save();
  ctx.translate((w - arrowSize) / 2, (h - arrowSize) / 2);
  ctx.scale(arrowSize / 24, arrowSize / 24);
  ctx.strokeStyle = arrow;
  ctx.lineWidth = 3; // lucide draws at 2 on 24px; a touch heavier reads better this small
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const d of ARROW_PATHS) ctx.stroke(new Path2D(d));
  ctx.restore();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function addTrainImages(map: mapboxgl.Map) {
  for (const id of Object.keys(T.line) as TubeLineId[]) {
    map.addImage(`train-${id}`, drawTrainImage(id), {
      pixelRatio: TRAIN.pixelRatio,
    });
  }
}

export function addTrainsLayer(map: mapboxgl.Map) {
  map.addLayer({
    id: "tube-trains",
    type: "symbol",
    source: "trains",
    slot: SLOT,
    layout: {
      "icon-image": ["concat", "train-", ["get", "line"]],
      // The picture points east (90°); bearing is measured from north
      "icon-rotate": ["-", ["get", "bearing"], 90],
      "icon-rotation-alignment": "map",
      "icon-size": byZoom(TRAIN.iconSize),
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: { "icon-emissive-strength": 1 },
  });
}

// Compass bearing (0 = north, 90 = east) from one point to another.
// Longitude degrees shrink towards the poles, so scale them by cos(latitude).
export function bearingBetween(
  fromLon: number,
  fromLat: number,
  toLon: number,
  toLat: number
) {
  const dx = (toLon - fromLon) * Math.cos((fromLat * Math.PI) / 180);
  const dy = toLat - fromLat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

