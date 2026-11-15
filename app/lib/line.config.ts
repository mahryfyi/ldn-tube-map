// Look-and-feel constants for the map: opacity, width, blur, sizes, zoom levels.
// These are code, not design tokens: retune them here on the live map.
// Light values come from the Figma handoff ("Frame 1", 41:1377);
// Dark values from "Beads dark - all lines" (24:2).

import type { TubeTheme } from "../tokens/tokens";

// Which theme the map draws. Light is the default; Dark is designed but its
// Studio style isn't made yet, so switching needs NEXT_PUBLIC_MAPBOX_STYLE_URL.
export const THEME: TubeTheme = "light";

// A value that changes with zoom: [zoom, value, zoom, value, ...]
type Stops = number[];
export const byZoom = (stops: Stops) =>
  ["interpolate", ["linear"], ["zoom"], ...stops] as unknown as number;

// --- Base map -------------------------------------------------------------
// Light uses Mapbox Standard (day, Faded). To use your own Studio style, set
// NEXT_PUBLIC_MAPBOX_STYLE_URL_LIGHT in .env.local. Dark has no fallback.
export const MAP_STYLE = {
  light: {
    url:
      process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL_LIGHT ??
      "mapbox://styles/mapbox/standard",
    lightPreset: "day",
    theme: "monochrome", // "faded" is the other option, but it is more colourful
  },
  dark: {
    url: process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL!,
    lightPreset: "night",
    theme: "default",
  },
} as const;

// --- Lines (Light): two passes across all lines, all casings then all cores
// The white casing separates crossing and parallel lines on a light ground.
export const CASING = {
  colour: "#FFFFFF",
  opacity: 0.9,
  width: [8, 4.5, 16, 11], // z8 → 4.5px, z16 → 11px: 1.5px of white each side of the core
};

export const CORE = {
  opacity: 1,
  width: [8, 2.5, 16, 8], // z16 → 8px, the track height in Figma
};

// --- Lines (Dark, later): three passes, halo, glow, core. Off for now.
export const GLOW_ENABLED = false;

export const HALO = {
  opacity: 0.1,
  width: [8, 8, 16, 36],
  blur: [8, 4, 12, 12],
  minzoom: 11, // off when zoomed out: lines overlap and turn to mud
};

export const GLOW = {
  opacity: 0.25,
  width: [8, 4, 16, 14],
  blur: [8, 1.5, 16, 5],
};

// --- Stations
export const INTERCHANGE = {
  radius: 6, // 12px ring
  strokeWidth: 1.5,
  minzoom: 10,
};

export const BEAD = {
  radius: 2.5, // 5px dot
  strokeWidth: 1,
  minzoom: 12,
};

export const STATION_LABEL = {
  minzoom: 14,
  size: 11,
  colour: { light: "#1A1A1A", dark: "#E6E8EB" },
  haloWidth: 1.5,
};

// --- Trains
export const TRAIN = {
  width: 16, // pill size in Figma px, drawn once per line as an image
  height: 6,
  arrowSize: 6,
  outline: 1, // in the line colour, outside the pill
  // Light is 1 because the token already carries 80% (#1A1A1ACC); applying it
  // twice would fade the pill too much. Dark: 80%, or 90% if beads show through.
  fillOpacity: { light: 1, dark: 0.8 },
  pixelRatio: 4, // draw the image 4× so it stays crisp when scaled up
  // Icon scale by zoom. Big on purpose: the direction arrow has to stay
  // readable, so pills are bigger than the line (Figma 1:1 is 1).
  iconSize: [8, 0.8, 12, 1.4, 16, 2.2],
};
