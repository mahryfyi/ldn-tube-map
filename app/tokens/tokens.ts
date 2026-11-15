// Tube Map tokens. Source: Figma Playground, variable collection "Tube Map".
// Keep in sync with tokens.json and tokens.css.
// The map reads these (Mapbox can't read CSS variables); the UI reads tokens.css.
// Naming: Figma line/bakerloo ↔ CSS --tube-line-bakerloo ↔ tubeTokens.light.line.bakerloo

const status = {
  good: { bg: "#1E7B45", fg: "#FFFFFF" },
  minor: { bg: "#E48F11", fg: "#FFFFFF" },
  severe: { bg: "#C9302A", fg: "#FFFFFF" },
} as const;

// The dark shade of each line. Light: bead outline and train pill fill.
// Dark never uses these, so both modes share one set.
const lineDark = {
  bakerloo: "#493012",
  central: "#491512",
  district: "#124926",
  jubilee: "#2C2E30",
  northern: "#000000",
  piccadilly: "#003688",
  victoria: "#123A49",
  "waterloo-city": "#1D3E33",
} as const;

// Light (default): the official TfL colours
const light = {
  line: {
    bakerloo: "#B36305",
    central: "#E32017",
    district: "#00782A",
    jubilee: "#A0A5A9",
    northern: "#000000",
    piccadilly: "#003688",
    victoria: "#0098D4",
    "waterloo-city": "#95CDBA",
  },
  lineDark,
  map: { ground: "#F3F1EC" },
  station: { fill: "#FFFFFF", stroke: "#1A1A1A" },
  // fill is the fallback; each line's pill uses lineDark (see line.config.ts)
  // fill is 92% opaque (EB), from Figma
  train: { fill: "#1A1A1AEB", arrow: "#FFFFFF" },
  status,
} as const;

// Dark (later): the same lines, lifted for the dark ground
const dark = {
  line: {
    bakerloo: "#E08A1E",
    central: "#FF4A3D",
    district: "#1FBF5B",
    jubilee: "#8E959C",
    northern: "#F2F2F2",
    piccadilly: "#3D7BFF",
    victoria: "#29B8F5",
    "waterloo-city": "#95CDBA",
  },
  lineDark,
  map: { ground: "#0C0E12" },
  station: { fill: "#FFFFFF", stroke: "#0C0E12" },
  train: { fill: "#0C0E12", arrow: "#FFFFFF" },
  status,
} as const;

export const tubeTokens = { light, dark } as const;

export type TubeTheme = keyof typeof tubeTokens;
export type TubeLineId = keyof typeof light.line;
export type StatusLevel = keyof typeof status;

export function isTokenLine(id: string): id is TubeLineId {
  return id in light.line;
}
