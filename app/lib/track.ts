// Track geometry: lets trains follow the drawn line instead of cutting
// straight from station to station.
//
// Idea: every point on a line can be described by "how many metres from the
// start of this line". A train between two stations is then simply somewhere
// between two such distances, and walking along the line gives its position.
//
// London is small enough to treat as flat: we turn [lon, lat] into x/y metres
// with a fixed scale. Error is well under 1% across Greater London.

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((51.5 * Math.PI) / 180);

// A station further than this from every track line can't be pinned to the
// track; we fall back to the old straight-line way.
const MAX_OFF_TRACK_M = 300;

type XY = [number, number];

type TrackLine = {
  pts: XY[]; // points in metres
  cum: number[]; // metres from the start of the line at each point
};

export type Track = TrackLine[];

// Where a train runs: on which track line, between which two distances.
// `dir` is +1 if travelling towards higher distances, -1 if lower.
export type Anchor = { line: number; fromDist: number; toDist: number; dir: 1 | -1 };

export const toXY = (lon: number, lat: number): XY => [lon * M_PER_DEG_LON, lat * M_PER_DEG_LAT];
export const toLonLat = ([x, y]: XY) => ({ lon: x / M_PER_DEG_LON, lat: y / M_PER_DEG_LAT });

// shape = what fetchRoute gives us: a list of lines, each a list of [lon, lat]
export function buildTrack(shape: number[][][]): Track {
  return shape.map((coords) => {
    const pts = coords.map(([lon, lat]) => toXY(lon, lat));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return { pts, cum };
  });
}

// The point on a track line closest to [lon, lat]: how far along the line it
// is (`dist`) and how far away from the line the original point was (`off`).
function project(line: TrackLine, lon: number, lat: number) {
  const [px, py] = toXY(lon, lat);
  let best = { dist: 0, off: Infinity };
  for (let i = 1; i < line.pts.length; i++) {
    const [ax, ay] = line.pts[i - 1];
    const [bx, by] = line.pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // How far along this little piece the closest point is (0 = start, 1 = end)
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const off = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (off < best.off) best = { dist: line.cum[i - 1] + t * Math.sqrt(len2), off };
  }
  return best;
}

type LonLat = { lon: number; lat: number };

// Pin a stretch of track between `from` and `to`. Picks the track line that
// passes closest to both. `prefer` = the line used last time: keep it if it
// still fits, so a train doesn't hop between overlapping copies of the track.
// For a train standing at a station, pass the same point twice and give
// `ahead` (the station it goes to next) so we know which way it faces.
export function anchorBetween(
  track: Track,
  from: LonLat,
  to: LonLat,
  ahead?: LonLat,
  prefer?: number
): Anchor | null {
  const standing = from.lon === to.lon && from.lat === to.lat;
  const target = standing ? ahead : to;

  let best: Anchor | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < track.length; i++) {
    const a = project(track[i], from.lon, from.lat);
    const b = target ? project(track[i], target.lon, target.lat) : { dist: a.dist, off: 0 };
    if (a.off > MAX_OFF_TRACK_M || b.off > MAX_OFF_TRACK_M) continue;
    // Small bonus for the line used last time
    const score = a.off + b.off - (i === prefer ? 50 : 0);
    if (score >= bestScore) continue;
    bestScore = score;
    const dir = b.dist >= a.dist ? 1 : -1;
    best = { line: i, fromDist: a.dist, toDist: standing ? a.dist : b.dist, dir };
  }
  return best;
}

// Walk `dist` metres along a track line: where are we, and which way does the
// track point there (compass bearing, 0 = north, 90 = east, towards higher dist)?
export function pointAt(track: Track, lineIndex: number, dist: number) {
  const { pts, cum } = track[lineIndex];
  const d = Math.max(0, Math.min(cum[cum.length - 1], dist));
  // Find the little piece of line that contains `d` (binary search)
  let lo = 1;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < d) lo = mid + 1;
    else hi = mid;
  }
  const [ax, ay] = pts[lo - 1];
  const [bx, by] = pts[lo];
  const len = cum[lo] - cum[lo - 1];
  const t = len === 0 ? 0 : (d - cum[lo - 1]) / len;
  const { lon, lat } = toLonLat([ax + t * (bx - ax), ay + t * (by - ay)]);
  const bearing = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI;
  return { lon, lat, bearing };
}
