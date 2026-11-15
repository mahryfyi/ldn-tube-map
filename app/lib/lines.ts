// The 11 Tube lines. Lines on the map take their colour from the Figma tokens
// (official TfL colours in Light); the rest keep the official TfL colour for now.
// `onMap` = drawn on the map yet? Circle, Hammersmith & City and Metropolitan
// are still off: they share track and their route data has gaps.

import { tubeTokens } from "../tokens/tokens";
import { THEME } from "./line.config";

export type LineInfo = {
  id: string; // the name TfL uses in its web addresses
  name: string;
  colour: string;
  onMap: boolean;
};

const t = tubeTokens[THEME].line;

export const LINES: LineInfo[] = [
  { id: "bakerloo", name: "Bakerloo", colour: t.bakerloo, onMap: true },
  { id: "central", name: "Central", colour: t.central, onMap: true },
  { id: "circle", name: "Circle", colour: "#FFD300", onMap: false },
  { id: "district", name: "District", colour: t.district, onMap: true },
  { id: "hammersmith-city", name: "Hammersmith & City", colour: "#F3A9BB", onMap: false },
  { id: "jubilee", name: "Jubilee", colour: t.jubilee, onMap: true },
  { id: "metropolitan", name: "Metropolitan", colour: "#9B0056", onMap: false },
  { id: "northern", name: "Northern", colour: t.northern, onMap: true },
  { id: "piccadilly", name: "Piccadilly", colour: t.piccadilly, onMap: true },
  { id: "victoria", name: "Victoria", colour: t.victoria, onMap: true },
  { id: "waterloo-city", name: "Waterloo & City", colour: t["waterloo-city"], onMap: true },
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
