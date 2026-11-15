"use client";

import { useReducedMotion } from "../lib/use-media-query";
import { cn } from "../lib/utils";

// The strip at the top of the phone screen (Figma: mobile, 87:485 → illustration-strip).
// A stand-in for the map: three lines, a few stations, five train pills.
// Drawn as one SVG so the whole thing scales with the screen (viewBox 362 x 120).
//
// MOTION. Purpose: explanation (it shows what the desktop map does), seen once
// per visit, so ambient drift is fine. Tool: SVG <animateMotion>, which moves
// each pill along its line and turns it to face the way it's going. I chose it
// over CSS offset-path because it works on every iPhone and scales with the SVG.
// Speed is constant (linear: a train doesn't ease in and out of a loop), and
// each pill has its own duration, so they never move in lockstep. Paths run
// 44px past each edge, so a pill leaves the strip completely before it loops.
// Reduced motion: no animation, the pills sit where Figma puts them.

type Line = "district" | "victoria" | "piccadilly";

// Line shapes, read from the Figma paths (x, y in the 362 x 120 strip)
const LINE_D: Record<Line, string> = {
    district: "M-4 28C116 18 216 70 366 40",
    victoria: "M-3.7 98C106.3 92 231.3 26 366.3 62",
    piccadilly: "M-3.9 62C126.1 60 256.1 106 366.1 98",
};

// The same curves with a straight run-out at each end, going left→right (fwd)
// and right→left (rev). Pills move along these.
const TRACK_D: Record<Line, { fwd: string; rev: string }> = {
    district: {
        fwd: "M-47.8 31.7L-4 28C116 18 216 70 366 40L409.1 31.4",
        rev: "M409.1 31.4L366 40C216 70 116 18 -4 28L-47.8 31.7",
    },
    victoria: {
        fwd: "M-47.6 100.4L-3.7 98C106.3 92 231.3 26 366.3 62L408.8 73.3",
        rev: "M408.8 73.3L366.3 62C231.3 26 106.3 92 -3.7 98L-47.6 100.4",
    },
    piccadilly: {
        fwd: "M-47.9 62.7L-3.9 62C126.1 60 256.1 106 366.1 98L410 94.8",
        rev: "M410 94.8L366.1 98C256.1 106 126.1 60 -3.9 62L-47.9 62.7",
    },
};

// Each line's stroke colour as a Tailwind class. Written out in full (never
// built from a template like `stroke-line-${line}`): Tailwind only creates the
// classes and colour variables it can find spelled out in the code.
const STROKE: Record<Line, string> = {
    district: "stroke-line-district",
    victoria: "stroke-line-victoria",
    piccadilly: "stroke-line-piccadilly",
};

// Each pill: where Figma puts it (x, y, angle), and how far round its loop it
// starts (0..1), so the first frame matches the design.
const TRAINS: {
    line: Line;
    dir: "fwd" | "rev";
    x: number;
    y: number;
    angle: number;
    start: number;
    seconds: number;
}[] = [
    { line: "district", dir: "fwd", x: 107.3, y: 32.7, angle: 7.5, start: 0.338, seconds: 36 },
    { line: "district", dir: "rev", x: 299.7, y: 48.6, angle: -3.2, start: 0.241, seconds: 44 },
    { line: "victoria", dir: "rev", x: 62.8, y: 88.7, angle: -11.3, start: 0.76, seconds: 40 },
    { line: "victoria", dir: "fwd", x: 239.4, y: 53.5, angle: -5.9, start: 0.629, seconds: 34 },
    { line: "piccadilly", dir: "fwd", x: 181, y: 81, angle: 9.3, start: 0.5, seconds: 42 },
];

// Station beads (centres), and the one interchange ring
const BEADS: [number, number][] = [
    [22, 26.8],
    [56, 27.6],
    [157.2, 39.8],
    [190.9, 44.2],
    [21.9, 95.6],
    [22, 62.2],
    [224.2, 88],
    [257.9, 92.8],
    [291.7, 96.6],
    [325.6, 98.7],
];
const INTERCHANGE: [number, number] = [131.5, 73.2];

// Figma's "arrow_forward" icon, 18 x 18
const ARROW =
    "M12.1313 9.74999H3.75C3.5375 9.74999 3.35938 9.67812 3.21562 9.53437C3.07187 9.39062 3 9.21249 3 8.99999C3 8.78749 3.07187 8.60937 3.21562 8.46562C3.35938 8.32187 3.5375 8.24999 3.75 8.24999H12.1313L8.45625 4.57499C8.30625 4.42499 8.23438 4.24999 8.24063 4.04999C8.24688 3.84999 8.325 3.67499 8.475 3.52499C8.625 3.38749 8.8 3.31562 9 3.30937C9.2 3.30312 9.375 3.37499 9.525 3.52499L14.475 8.47499C14.55 8.54999 14.6031 8.63124 14.6344 8.71874C14.6656 8.80624 14.6812 8.89999 14.6812 8.99999C14.6812 9.09999 14.6656 9.19374 14.6344 9.28124C14.6031 9.36874 14.55 9.44999 14.475 9.52499L9.525 14.475C9.3875 14.6125 9.21562 14.6812 9.00937 14.6812C8.80312 14.6812 8.625 14.6125 8.475 14.475C8.325 14.325 8.25 14.1469 8.25 13.9406C8.25 13.7344 8.325 13.5562 8.475 13.4062L12.1313 9.74999Z";

export function TrainIllustration({ className }: { className?: string }) {
    const reduce = useReducedMotion();

    return (
        <div
            className={cn("overflow-hidden rounded-xl bg-map-ground", className)}
        >
            {/* Decorative: the status list below says everything this says */}
            <svg
                viewBox="0 0 362 120"
                className="block h-auto w-full"
                aria-hidden="true"
                focusable="false"
            >
                {/* Lines, bottom to top (Piccadilly over Victoria over District) */}
                {(Object.keys(LINE_D) as Line[]).map((line) => (
                    <path
                        key={line}
                        d={LINE_D[line]}
                        fill="none"
                        strokeWidth={12}
                        strokeLinejoin="round"
                        className={STROKE[line]}
                    />
                ))}

                {/* Stations */}
                {BEADS.map(([cx, cy]) => (
                    <circle
                        key={`${cx},${cy}`}
                        cx={cx}
                        cy={cy}
                        r={3.75}
                        strokeWidth={1.5}
                        className="fill-station-fill stroke-station-stroke"
                    />
                ))}
                <circle
                    cx={INTERCHANGE[0]}
                    cy={INTERCHANGE[1]}
                    r={7.875}
                    strokeWidth={2.25}
                    className="fill-station-fill stroke-station-stroke"
                />

                {/* Trains: a near-black pill with a line-coloured outline and an
                    arrow. Every pill is drawn pointing right; the motion path
                    (or the static angle) turns it to face its way. */}
                {TRAINS.map((t, i) => {
                    // Static pose (reduced motion). Pills going right-to-left
                    // are turned half a circle so the arrow points left.
                    const staticTransform = `translate(${t.x} ${t.y}) rotate(${t.angle + (t.dir === "rev" ? 180 : 0)})`;
                    return (
                        <g
                            key={i}
                            transform={reduce ? staticTransform : undefined}
                        >
                            <rect
                                x={-25.5}
                                y={-9}
                                width={51}
                                height={18}
                                rx={9}
                                strokeWidth={3}
                                className={cn("fill-train-fill", STROKE[t.line])}
                            />
                            <path
                                d={ARROW}
                                transform="translate(-9 -9)"
                                className="fill-train-arrow"
                            />
                            {!reduce && (
                                <animateMotion
                                    path={TRACK_D[t.line][t.dir]}
                                    dur={`${t.seconds}s`}
                                    // a negative start = "already this far in"
                                    begin={`${-(t.start * t.seconds).toFixed(2)}s`}
                                    repeatCount="indefinite"
                                    rotate="auto"
                                />
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}
