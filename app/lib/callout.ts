// The callout that follows a hovered train.
//
// It is built ONCE per hovered train (createCallout) and then updated in place
// about 20 times a second (update). Rebuilding the whole thing every frame
// would throw away the DOM each time, so nothing could animate or stay stable.
// Styles live next door in callout.css (classes starting "callout-").
//
// Only textContent and style are ever set, never HTML strings, so odd text
// from TfL can't inject markup.

import type { Train } from "./tfl";
import { colourOf, nameOf } from "./lines";

// A small element with a class and optional text
function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text = "",
) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
}

// Only touch the DOM when the text really changed
function setText(node: HTMLElement, text: string) {
    if (node.textContent !== text) node.textContent = text;
}

export function createCallout() {
    // Header: a short bar in the line colour, then the line name and where it's heading
    const ident = el("span", "callout-ident");
    const lineName = el("span", "callout-line");
    const towards = el("span", "callout-towards");
    const head = el("div", "callout-head");
    head.append(ident, lineName, towards);

    // The stretch it is on: the two station names, and a track between them
    const from = el("span", "callout-from");
    const to = el("span", "callout-to");
    const names = el("div", "callout-names");
    names.append(from, to);
    const fill = el("div", "callout-fill");
    const rail = el("div", "callout-rail");
    rail.append(fill);
    const stretch = el("div", "callout-stretch");
    stretch.append(names, rail);

    // Footer: how old our data is, and when it arrives
    const age = el("span", "callout-age");
    const next = el("span", "callout-next");
    const foot = el("div", "callout-foot");
    foot.append(age, next);

    const root = el("div", "callout");
    root.append(head, stretch, foot);

    // ageSeconds: how long ago TfL's data for this train arrived
    function update(t: Train, ageSeconds: number) {
        const colour = colourOf(t.line);
        ident.style.background = colour;
        fill.style.background = colour;
        setText(lineName, `${nameOf(t.line)} line`);

        // Some trains have no destination in TfL's data: then the row goes
        setText(towards, t.destination ? `Towards ${t.destination}` : "");
        towards.hidden = !t.destination;

        // Seconds to go counts down live: the value from the last update
        // minus the time since (can be negative: already due)
        const remaining = t.secondsToNext - ageSeconds;
        // A train parked on its next station has no stretch behind it
        const parked = t.from === t.to;

        setText(from, parked ? "" : t.from);
        setText(to, t.to);
        rail.hidden = parked;
        if (!parked) {
            // progress can exceed 1 (a train that has overshot): clamp it
            const p = Math.min(1, Math.max(0, t.progress));
            fill.style.transform = `scaleX(${p})`;
        }

        setText(
            next,
            parked && remaining <= 15
                ? "At station"
                : remaining < 30
                  ? "Arriving now"
                  : `Arriving in ${Math.round(remaining / 60)} min`,
        );
        setText(age, `Updated ${Math.round(ageSeconds)}s ago`);
    }

    return { el: root, update };
}
