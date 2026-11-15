// Helpers for getting TfL data (via our own /api routes) and working out
// where trains are. The browser never talks to TfL directly.

import { smoothLines } from "./smooth";

// How long (seconds) we assume a gap between two stations takes when we can't
// measure it (no neighbouring station known). Normally segmentSeconds() is used.
const SEGMENT_SECONDS = 120;

// Estimated travel time for a stretch, from its length: cruising pace plus a
// fixed allowance for pulling away and braking. Both numbers are guesses.
const CRUISE_M_PER_S = 12;
const START_STOP_SECONDS = 10;
const MIN_SEGMENT_SECONDS = 30;
const MAX_SEGMENT_SECONDS = 240;

// Rough straight-line distance in metres between two points
function metresBetween(aLon: number, aLat: number, bLon: number, bLat: number) {
  const M_PER_DEG = 111_320;
  const dx = (bLon - aLon) * Math.cos((aLat * Math.PI) / 180) * M_PER_DEG;
  const dy = (bLat - aLat) * M_PER_DEG;
  return Math.hypot(dx, dy);
}

function segmentSeconds(metres: number) {
  if (metres <= 0) return SEGMENT_SECONDS;
  return Math.min(
    MAX_SEGMENT_SECONDS,
    Math.max(MIN_SEGMENT_SECONDS, metres / CRUISE_M_PER_S + START_STOP_SECONDS)
  );
}

// After a train reaches its next station we keep guessing instead of freezing
// it there: it stands for DWELL_SECONDS (real trains do), then sets off
// towards the stop after. We never guess more than MAX_OVERSHOOT of a
// stretch past the station, because by then fresh news is overdue.
// Real trains stand ~20-30 s, but this must stay well under TRAIN_POLL_MS (30 s)
// or the pill is still "standing" when the next update arrives (measured: no effect).
const DWELL_SECONDS = 10;
const MAX_OVERSHOOT = 0.6;

export type Station = {
  id: string; // Naptan ID, e.g. "940GZZLUVIC" (matches the arrivals data)
  name: string;
  lon: number;
  lat: number;
};

// A line as a "web" of stations: who sits next to whom.
// (A plain list can't describe a line that splits into branches.)
export type Network = {
  stations: Map<string, Station>; // look a station up by its ID
  neighbours: Map<string, string[]>; // station ID -> IDs of the stations next to it
};

export type Prediction = {
  id: string;
  vehicleId: string;
  naptanId: string;
  timeToStation: number; // seconds, counted from `timestamp` (NOT from now!)
  currentLocation?: string; // free text, e.g. "Between Brixton and Stockwell"
  // Where the train is heading. destinationName is empty on about 1 in 5
  // predictions; `towards` is shorter ("Wimbledon") but is sometimes the
  // useless "Check Front of Train".
  destinationName?: string; // e.g. "Wimbledon Underground Station"
  towards?: string;
  // When TfL made the prediction (it's already 50-110 s old when we get it),
  // and the arrival time it implies. The latter is absolute, so it stays true
  // however old the data is.
  timestamp?: string;
  expectedArrival?: string;
};

// A prediction plus its countdown measured from the moment we're looking
type Timed = Prediction & { secs: number };

// Seconds from `nowMs` until the train is due (negative = already due).
// Uses the absolute arrival time; falls back to TfL's countdown if it's missing.
function secondsUntil(p: Prediction, nowMs: number) {
  const due = p.expectedArrival ? Date.parse(p.expectedArrival) : NaN;
  return Number.isFinite(due) ? (due - nowMs) / 1000 : p.timeToStation;
}

export type Train = {
  line: string;
  vehicleId: string;
  from: string; // previous station name
  to: string; // next station name
  progress: number; // 0 = at previous station, 1 = at next station
  lon: number;
  lat: number;
  // What we need to keep the dot creeping forward between updates:
  fromLon: number;
  fromLat: number;
  toLon: number;
  toLat: number;
  secondsToNext: number; // seconds until it reaches `to`, as of this update
  // Estimated time to cover the stretch (from its length): turns "seconds to go"
  // into "how far along". Used instead of one fixed time for every stretch.
  segmentSeconds: number;
  // The stop after `to`, if we know it: tells a train standing in a station
  // which way it's facing.
  aheadLon?: number;
  aheadLat?: number;
  // The end of the line it's heading for, e.g. "Wimbledon" (missing for some trains)
  destination?: string;
};

// The end of the line this train is heading for, in short form ("Wimbledon").
// A train's predictions all agree, but TfL leaves the field empty on some of
// them, so we take the first one that has it. Failing that, `towards`.
// Nothing usable: undefined, and the callout simply leaves the row out.
function destinationOf(preds: Prediction[]): string | undefined {
  for (const p of preds) {
    const name = p.destinationName?.replace(/ Underground Station$/, "");
    if (name) return name;
  }
  for (const p of preds) {
    if (p.towards && p.towards !== "Check Front of Train") return p.towards;
  }
  return undefined;
}

export type LineStatus = {
  id: string;
  name: string;
  severity: number; // 10 = good service; lower = worse
  description: string;
};

// One request gives us both the station web and the line's shape.
export async function fetchRoute(line: string) {
  const res = await fetch(`/api/route-sequence/${line}`);
  if (!res.ok) throw new Error(`Route request failed for ${line}: ${res.status}`);
  const data = await res.json();

  const network = buildNetwork(data.stopPointSequences);

  // lineStrings is text containing JSON, so each entry is parsed a second
  // time. Each parses to a list of lines already in [lon, lat] order.
  // Then they are smoothed together (see smooth.ts): this one shape feeds both
  // the drawn line and the train tracking, so trains ride the curve you see.
  const shape: number[][][] = smoothLines(
    data.lineStrings.flatMap((s: string) => JSON.parse(s))
  );

  return { network, shape };
}

// A branching line comes as several stretches of track ("branches"). We turn
// them into one web: stations that are next to each other in any branch
// become neighbours. Uses stopPointSequences (Naptan IDs), not `stations`
// (hub IDs for interchange stations): only the former matches the arrivals.
type RawStop = { id: string; name: string; lat: number; lon: number };

export function buildNetwork(
  sequences: { stopPoint: RawStop[] }[]
): Network {
  const stations = new Map<string, Station>();
  const next = new Map<string, Set<string>>();

  for (const sequence of sequences) {
    let previous: string | undefined;
    for (const s of sequence.stopPoint) {
      if (!stations.has(s.id)) {
        stations.set(s.id, {
          id: s.id,
          name: s.name.replace(" Underground Station", ""),
          lon: s.lon,
          lat: s.lat,
        });
        next.set(s.id, new Set());
      }
      if (previous && previous !== s.id) {
        next.get(previous)!.add(s.id);
        next.get(s.id)!.add(previous);
      }
      previous = s.id;
    }
  }

  const neighbours = new Map<string, string[]>();
  for (const [id, set] of next) neighbours.set(id, [...set]);
  return { stations, neighbours };
}

export async function fetchArrivals(line: string): Promise<Prediction[]> {
  // A request that hangs must fail, not block the next refresh for minutes
  const res = await fetch(`/api/arrivals/${line}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Arrivals request failed for ${line}: ${res.status}`);
  return res.json();
}

export async function fetchStatuses(): Promise<Record<string, LineStatus>> {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error(`Status request failed: ${res.status}`);
  const data = await res.json();

  const statuses: Record<string, LineStatus> = {};
  for (const line of data) {
    // A line can have several statuses at once; show the worst (lowest number)
    const worst = line.lineStatuses.reduce(
      (a: { statusSeverity: number }, b: { statusSeverity: number }) =>
        b.statusSeverity < a.statusSeverity ? b : a
    );
    statuses[line.id] = {
      id: line.id,
      name: line.name,
      severity: worst.statusSeverity,
      description: worst.statusSeverityDescription,
    };
  }
  return statuses;
}

// --- Matching station names in TfL's free-text "currentLocation" ---------
// The text spells names slightly differently ("Kings Cross St. P"), so we
// compare only letters, and let one name be the start of the other.
export function clean(name: string) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
function sameStation(a: string, b: string) {
  const x = clean(a);
  const y = clean(b);
  return x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x));
}

// TfL sometimes says outright which stretch a train is on:
//   "Between Brixton and Stockwell"  /  "Departed Victoria"
// If so, and it names a station next to `next`, that's the station behind.
function stationBehindFromText(
  text: string | undefined,
  next: Station,
  around: Station[]
): Station | undefined {
  if (!text) return undefined;
  const between = text.match(/^Between (.+) and (.+)$/i);
  const left = text.match(/^(?:Departed|Departing|Left|Leaving) (.+)$/i);
  const names = between ? [between[1], between[2]] : left ? [left[1]] : [];

  // One of the names should be the next station itself; we want the other
  const others = names.filter((n) => !sameStation(n, next.name));
  if (others.length !== 1) return undefined;

  const hits = around.filter((s) => sameStation(s.name, others[0]));
  return hits.length === 1 ? hits[0] : undefined;
}

// From predictions to train positions, for any line (single route or branching).
export function computeTrains(
  line: string,
  network: Network,
  predictions: Prediction[],
  nowMs = Date.now()
): Train[] {
  // Group predictions by train, each with its countdown from NOW
  const byTrain = new Map<string, Timed[]>();
  for (const p of predictions) {
    // TfL sometimes uses a placeholder ID ("000") for trains it can't identify.
    // Unrelated trains would share it and be merged into one pill that jumps
    // between them, so skip them.
    if (/^0*$/.test(p.vehicleId ?? "")) continue;
    const list = byTrain.get(p.vehicleId) ?? [];
    list.push({ ...p, secs: secondsUntil(p, nowMs) });
    byTrain.set(p.vehicleId, list);
  }

  const trains: Train[] = [];
  for (const [vehicleId, allPreds] of byTrain) {
    allPreds.sort((a, b) => a.secs - b.secs);

    // Forget stations the train has surely left: it was due there more than
    // DWELL_SECONDS ago, and the feed just hasn't caught up.
    const preds = allPreds.filter((p) => p.secs >= -DWELL_SECONDS);
    if (preds.length === 0) continue; // all behind it: journey over
    // If we had to drop any, TfL's free-text location is out of date too
    const dataIsStale = preds.length < allPreds.length;

    // The soonest remaining prediction is the train's next station
    const nextPred = preds[0];
    const next = network.stations.get(nextPred.naptanId);
    if (!next) continue; // unknown station: skip this train

    // Who sits next to that station?
    const aroundIds = network.neighbours.get(next.id) ?? [];
    const around = aroundIds.map((id) => network.stations.get(id)!);

    // The station AHEAD is the first of the train's later stops that is a
    // neighbour of the next station (usually simply its second stop).
    const aheadId = preds.find((p) => aroundIds.includes(p.naptanId))?.naptanId;
    const ahead = aheadId ? network.stations.get(aheadId) : undefined;

    // The station BEHIND, in order of trust:
    //  1. TfL's own words about where the train is
    //  2. the one neighbour that isn't ahead (the usual case)
    //  3. otherwise (a junction we can't settle, or a train waiting at the
    //     end of the line with nothing behind it): sit on the next station
    const behindByText = dataIsStale
      ? undefined
      : stationBehindFromText(nextPred.currentLocation, next, around);
    const notAhead = around.filter((s) => s.id !== aheadId);
    let from = behindByText ?? (notAhead.length === 1 ? notAhead[0] : next);

    // Can be negative: it was due that many seconds ago (and is still standing)
    let secondsToNext = nextPred.secs;

    // "At Platform" / "At Woodford": the train is standing in the station,
    // so put the dot exactly on it (unless the text is stale, see above).
    if (!dataIsStale && /^At /i.test(nextPred.currentLocation ?? "")) {
      from = next;
      secondsToNext = Math.min(0, secondsToNext);
    }

    // Length of the stretch we're measuring progress along: behind -> next, or
    // for a standing train (no stretch behind it) next -> ahead.
    const stretchMetres =
      from !== next
        ? metresBetween(from.lon, from.lat, next.lon, next.lat)
        : ahead
          ? metresBetween(next.lon, next.lat, ahead.lon, ahead.lat)
          : 0;

    const train: Train = {
      line,
      vehicleId,
      from: from.name,
      to: next.name,
      progress: 0,
      lon: 0,
      lat: 0,
      fromLon: from.lon,
      fromLat: from.lat,
      toLon: next.lon,
      toLat: next.lat,
      secondsToNext,
      segmentSeconds: segmentSeconds(stretchMetres),
      aheadLon: ahead?.lon,
      aheadLat: ahead?.lat,
      destination: destinationOf(allPreds),
    };
    // Where it is right now = where it will be after 0 seconds of creeping
    const now = positionAt(train, 0);
    train.progress = now.progress;
    train.lon = now.lon;
    train.lat = now.lat;
    trains.push(train);
  }
  return trains;
}

// Where is this train `elapsedSeconds` after we last heard about it?
// It creeps towards its next station, stands there briefly, then sets off
// towards the stop after (a guess, until the next update corrects it).
// `minProgress` is a floor: the train is never shown behind this point.
export function positionAt(
  train: Train,
  elapsedSeconds: number,
  minProgress = 0
) {
  const remaining = Math.max(0, train.secondsToNext - elapsedSeconds);
  // How long ago it should have reached the station (0 if it hasn't yet)
  const sinceArrival = Math.max(0, elapsedSeconds - train.secondsToNext);
  // Fraction of the next stretch covered after the dwell is over
  const overshoot = Math.min(
    MAX_OVERSHOOT,
    Math.max(0, sinceArrival - DWELL_SECONDS) / train.segmentSeconds
  );
  // Progress: 0 just left the previous station, 1 at the next one,
  // above 1 = on its way to the stop after that
  const progress = Math.max(
    0,
    minProgress,
    Math.min(1, 1 - remaining / train.segmentSeconds) + overshoot
  );

  // Straight-line fallback (used when the stations aren't pinned to track).
  // Up to the station: blend from -> to. Past it: blend to -> ahead.
  // With no `ahead` known, wait at the station rather than guess a direction.
  let lon: number;
  let lat: number;
  if (progress <= 1 || train.aheadLon === undefined || train.aheadLat === undefined) {
    const p = Math.min(1, progress);
    lon = train.fromLon + (train.toLon - train.fromLon) * p;
    lat = train.fromLat + (train.toLat - train.fromLat) * p;
  } else {
    const p = progress - 1;
    lon = train.toLon + (train.aheadLon - train.toLon) * p;
    lat = train.toLat + (train.aheadLat - train.toLat) * p;
  }
  return { progress, lon, lat };
}
