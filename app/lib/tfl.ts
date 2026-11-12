// Helpers for getting TfL data (via our own /api routes) and working out
// where trains are. The browser never talks to TfL directly.

// How long (seconds) we assume a typical gap between two stations takes.
// It's a guess: real gaps vary, so dot positions are approximate.
const SEGMENT_SECONDS = 120;

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
  timeToStation: number; // seconds
  currentLocation?: string; // free text, e.g. "Between Brixton and Stockwell"
};

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
};

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
  const shape: number[][][] = data.lineStrings.flatMap((s: string) =>
    JSON.parse(s)
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
  const res = await fetch(`/api/arrivals/${line}`);
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
function clean(name: string) {
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
  predictions: Prediction[]
): Train[] {
  // Group predictions by train, soonest first
  const byTrain = new Map<string, Prediction[]>();
  for (const p of predictions) {
    const list = byTrain.get(p.vehicleId) ?? [];
    list.push(p);
    byTrain.set(p.vehicleId, list);
  }

  const trains: Train[] = [];
  for (const [vehicleId, preds] of byTrain) {
    preds.sort((a, b) => a.timeToStation - b.timeToStation);

    // The soonest prediction is the train's next station
    const nextPred = preds[0];
    const next = network.stations.get(nextPred.naptanId);
    if (!next) continue; // unknown station: skip this train

    // Who sits next to that station?
    const aroundIds = network.neighbours.get(next.id) ?? [];
    const around = aroundIds.map((id) => network.stations.get(id)!);

    // The station AHEAD is the first of the train's later stops that is a
    // neighbour of the next station (usually simply its second stop).
    const aheadId = preds.find((p) => aroundIds.includes(p.naptanId))?.naptanId;

    // The station BEHIND, in order of trust:
    //  1. TfL's own words about where the train is
    //  2. the one neighbour that isn't ahead (the usual case)
    //  3. otherwise (a junction we can't settle, or a train waiting at the
    //     end of the line with nothing behind it): sit on the next station
    const behindByText = stationBehindFromText(
      nextPred.currentLocation,
      next,
      around
    );
    const notAhead = around.filter((s) => s.id !== aheadId);
    let from = behindByText ?? (notAhead.length === 1 ? notAhead[0] : next);

    let secondsToNext = nextPred.timeToStation;

    // "At Platform" / "At Woodford": the train is standing in the station,
    // so put the dot exactly on it.
    if (/^At /i.test(nextPred.currentLocation ?? "")) {
      from = next;
      secondsToNext = 0;
    }

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
// It keeps moving towards its next station, and stops once it gets there.
// `minProgress` is a floor: the train is never shown behind this point.
export function positionAt(
  train: Train,
  elapsedSeconds: number,
  minProgress = 0
) {
  const remaining = Math.max(0, train.secondsToNext - elapsedSeconds);
  // Progress: 0 just left the previous station, 1 arriving at the next one
  const progress = Math.min(
    1,
    Math.max(0, minProgress, 1 - remaining / SEGMENT_SECONDS)
  );
  return {
    progress,
    // Straight-line blend between the two stations
    lon: train.fromLon + (train.toLon - train.fromLon) * progress,
    lat: train.fromLat + (train.toLat - train.fromLat) * progress,
  };
}
