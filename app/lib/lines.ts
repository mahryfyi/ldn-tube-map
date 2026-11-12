// The 11 Tube lines, with their official TfL colours.
// `onMap` = drawn on the map yet? Circle, Hammersmith & City and Metropolitan
// are still off: they share track and their route data has gaps.

export type LineInfo = {
  id: string; // the name TfL uses in its web addresses
  name: string;
  colour: string;
  onMap: boolean;
};

export const LINES: LineInfo[] = [
  { id: "bakerloo", name: "Bakerloo", colour: "#B36305", onMap: true },
  { id: "central", name: "Central", colour: "#E32017", onMap: true },
  { id: "circle", name: "Circle", colour: "#FFD300", onMap: false },
  { id: "district", name: "District", colour: "#00782A", onMap: true },
  { id: "hammersmith-city", name: "Hammersmith & City", colour: "#F3A9BB", onMap: false },
  { id: "jubilee", name: "Jubilee", colour: "#A0A5A9", onMap: true },
  { id: "metropolitan", name: "Metropolitan", colour: "#9B0056", onMap: false },
  { id: "northern", name: "Northern", colour: "#000000", onMap: true },
  { id: "piccadilly", name: "Piccadilly", colour: "#003688", onMap: true },
  { id: "victoria", name: "Victoria", colour: "#0098D4", onMap: true },
  { id: "waterloo-city", name: "Waterloo & City", colour: "#95CDBA", onMap: true },
];

export const MAP_LINES = LINES.filter((l) => l.onMap);

// Our server routes only talk to TfL about lines on this list
export function isKnownLine(id: string) {
  return LINES.some((l) => l.id === id);
}

export function nameOf(id: string) {
  return LINES.find((l) => l.id === id)?.name ?? id;
}

export function colourOf(id: string) {
  return LINES.find((l) => l.id === id)?.colour ?? "#888888";
}
