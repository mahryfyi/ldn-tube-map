// Tube Map tokens for code that can't read CSS variables (Mapbox).
// Mirrors tokens.css: `palette` = colours/primitive.css, `light` / `dark` =
// colours/semantic.css. Change a value in both places.
// Naming: Figma line/bakerloo ↔ CSS --color-line-bakerloo ↔ tubeTokens.light.line.bakerloo

// --- Primitives: raw colours ------------------------------------------------
export const palette = {
    // Official TfL line colours, all 11 lines
    tfl: {
        bakerloo: "#B36305",
        central: "#E32017",
        circle: "#FFD300",
        district: "#00782A",
        "hammersmith-city": "#F3A9BB",
        jubilee: "#A0A5A9",
        metropolitan: "#9B0056",
        northern: "#000000",
        piccadilly: "#003688",
        victoria: "#0098D4",
        "waterloo-city": "#95CDBA",
    },
    // Dark shade of each line (Northern and Piccadilly use their official colour)
    shade: {
        bakerloo: "#493012",
        central: "#491512",
        district: "#124926",
        jubilee: "#2C2E30",
        victoria: "#123A49",
        "waterloo-city": "#1D3E33",
    },
    // Lifted for a dark ground (Waterloo & City is light enough as it is)
    lifted: {
        bakerloo: "#E08A1E",
        central: "#FF4A3D",
        district: "#1FBF5B",
        jubilee: "#8E959C", // mid-grey, to separate it from Northern
        northern: "#F2F2F2", // light, because black can't glow
        piccadilly: "#3D7BFF",
        victoria: "#29B8F5",
    },
    white: "#FFFFFF",
    paper: "#F3F1EC", // light map ground
    night: "#0C0E12", // dark map ground
    ink: "#1A1A1A",
    ink92: "#1A1A1AEB", // ink at 92% opacity
    signal: { green: "#1E7B45", amber: "#E48F11", red: "#C9302A" },
} as const;

const p = palette;

// --- Semantic roles -----------------------------------------------------------
const status = {
    good: { bg: p.signal.green, fg: p.white },
    minor: { bg: p.signal.amber, fg: p.white },
    severe: { bg: p.signal.red, fg: p.white },
} as const;

// Station outline and train pill fill. Light only; both modes share one set.
const lineDark = {
    bakerloo: p.shade.bakerloo,
    central: p.shade.central,
    district: p.shade.district,
    jubilee: p.shade.jubilee,
    northern: p.tfl.northern,
    piccadilly: p.tfl.piccadilly,
    victoria: p.shade.victoria,
    "waterloo-city": p.shade["waterloo-city"],
} as const;

// Light (default): the official TfL colours
const light = {
    line: {
        bakerloo: p.tfl.bakerloo,
        central: p.tfl.central,
        district: p.tfl.district,
        jubilee: p.tfl.jubilee,
        northern: p.tfl.northern,
        piccadilly: p.tfl.piccadilly,
        victoria: p.tfl.victoria,
        "waterloo-city": p.tfl["waterloo-city"],
    },
    lineDark,
    map: { ground: p.paper },
    station: { fill: p.white, stroke: p.ink },
    // fill is the fallback; each line's pill uses lineDark (see map-layers.ts)
    train: { fill: p.ink92, arrow: p.white },
    status,
} as const;

// Dark (later): the same lines, lifted for the dark ground
const dark = {
    line: {
        bakerloo: p.lifted.bakerloo,
        central: p.lifted.central,
        district: p.lifted.district,
        jubilee: p.lifted.jubilee,
        northern: p.lifted.northern,
        piccadilly: p.lifted.piccadilly,
        victoria: p.lifted.victoria,
        "waterloo-city": p.tfl["waterloo-city"],
    },
    lineDark,
    map: { ground: p.night },
    station: { fill: p.white, stroke: p.night },
    train: { fill: p.night, arrow: p.white }, // drawn at 80% opacity (line.config.ts)
    status,
} as const;

export const tubeTokens = { light, dark } as const;

export type TubeTheme = keyof typeof tubeTokens;
export type TubeLineId = keyof typeof light.line;
export type StatusLevel = keyof typeof status;
