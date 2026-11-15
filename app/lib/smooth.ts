// Smoothing for the lines on the map.
//
// TfL gives each line as one point per station, joined by straight segments,
// so every station is a sharp corner. Real track bends gently. We can't know
// the real route, but we can draw a smooth curve through the same points: it
// looks better and still passes exactly through every station.
//
// The curve is a "centripetal Catmull-Rom spline". Plain English:
//  - Catmull-Rom: a curve that passes through every point you give it
//  - centripetal: spaces its maths by distance, so long segments and sharp
//    bends don't make it overshoot or form little loops
//
// A branching line (Northern, District...) comes as several strings that
// overlap on shared stretches. The curve between two stations depends on the
// stations either side, and at a junction different strings continue
// differently. Smoothing each string alone would draw the shared stretch twice
// with two slightly different curves (a thin double line, up to ~80 m apart).
// So all the strings are smoothed together, and each segment gets ONE agreed
// curve, whichever string it is in.

import { toLonLat, toXY } from "./track";

const SAMPLE_METRES = 40; // one drawn point about every 40 m along the curve
const MIN_STEPS = 4; // ...but at least this many points per segment
const ALPHA = 0.5; // 0.5 = "centripetal"

type XY = [number, number];

const dist = (a: XY, b: XY) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// Straight-line blend of two points: a at t=0, b at t=1
const mix = (a: XY, b: XY, t: number): XY => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
// The same station in two strings has the same coordinates; this names a point
const key = (p: XY) => `${Math.round(p[0])},${Math.round(p[1])}`;

// How straight is the path a -> b -> c? 1 = dead straight, 0 = a right angle,
// -1 = doubling back
function straightness(a: XY, b: XY, c: XY) {
  const [x1, y1] = [b[0] - a[0], b[1] - a[1]];
  const [x2, y2] = [c[0] - b[0], c[1] - b[1]];
  return (x1 * x2 + y1 * y2) / (Math.hypot(x1, y1) * Math.hypot(x2, y2) || 1);
}

// One point on the curve between p1 and p2, given the points either side
// (p0 before, p3 after). This is the "Barry-Goldman" form: blend the points
// pairwise, then blend the blends, then once more.
function curvePoint(p0: XY, p1: XY, p2: XY, p3: XY, u: number): XY {
  // "Times" at each point: the further apart two points are, the longer
  // the curve takes between them (the 0.5 power is what makes it centripetal)
  const t0 = 0;
  const t1 = t0 + Math.max(dist(p0, p1) ** ALPHA, 1e-6);
  const t2 = t1 + Math.max(dist(p1, p2) ** ALPHA, 1e-6);
  const t3 = t2 + Math.max(dist(p2, p3) ** ALPHA, 1e-6);
  const t = t1 + (t2 - t1) * u; // u runs 0..1 along p1 -> p2

  const a1 = mix(p0, p1, (t - t0) / (t1 - t0));
  const a2 = mix(p1, p2, (t - t1) / (t2 - t1));
  const a3 = mix(p2, p3, (t - t2) / (t3 - t2));
  const b1 = mix(a1, a2, (t - t0) / (t2 - t0));
  const b2 = mix(a2, a3, (t - t1) / (t3 - t1));
  return mix(b1, b2, (t - t1) / (t2 - t1));
}

// strings: lines of [lon, lat] points, as TfL gives them. Returns the same
// kind of list: each string starts and ends on the same points, with the
// curve filled in between.
export function smoothLines(strings: number[][][]): number[][][] {
  // To metres, dropping any point that repeats the one before it
  const lines: XY[][] = strings.map((string) => {
    const pts: XY[] = [];
    for (const [lon, lat] of string) {
      const p = toXY(lon, lat);
      if (pts.length === 0 || dist(p, pts[pts.length - 1]) > 0.5) pts.push(p);
    }
    return pts;
  });

  // Who sits next to whom, across ALL the strings
  const around = new Map<string, XY[]>();
  const link = (a: XY, b: XY) => {
    const list = around.get(key(a)) ?? [];
    if (!list.some((q) => key(q) === key(b))) list.push(b);
    around.set(key(a), list);
  };
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      link(pts[i - 1], pts[i]);
      link(pts[i], pts[i - 1]);
    }
  }

  // The point before p1 (heading to p2) that the curve should use: of the
  // stations next to p1 (other than p2) the one that continues straightest.
  // Same answer in every string. At the end of a line there is none: mirror p2.
  function before(p1: XY, p2: XY): XY {
    let best: XY | undefined;
    let bestScore = -Infinity;
    for (const c of around.get(key(p1)) ?? []) {
      if (key(c) === key(p2)) continue;
      const score = straightness(c, p1, p2);
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    return best ?? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]];
  }
  // The same, for the point after p2 (coming from p1)
  function after(p1: XY, p2: XY): XY {
    let best: XY | undefined;
    let bestScore = -Infinity;
    for (const c of around.get(key(p2)) ?? []) {
      if (key(c) === key(p1)) continue;
      const score = straightness(p1, p2, c);
      if (score > bestScore) [best, bestScore] = [c, score];
    }
    return best ?? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];
  }

  return lines.map((pts, n) => {
    if (pts.length < 2) return strings[n];
    const out: XY[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [p1, p2] = [pts[i - 1], pts[i]];
      const [p0, p3] = [before(p1, p2), after(p1, p2)];
      const steps = Math.max(MIN_STEPS, Math.ceil(dist(p1, p2) / SAMPLE_METRES));
      // from step 1 (not 0): the segment's start was already added last time round
      for (let s = 1; s < steps; s++) out.push(curvePoint(p0, p1, p2, p3, s / steps));
      out.push(p2); // end exactly on the station
    }
    return out.map((p) => {
      const { lon, lat } = toLonLat(p);
      return [lon, lat];
    });
  });
}
