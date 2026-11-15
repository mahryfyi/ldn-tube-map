"use client";

import { useSyncExternalStore } from "react";

// One shared clock that ticks once a second, for anything that shows "12s ago".
// Every component using it re-renders on the same tick, from one timer.
//
// Same pattern as use-media-query.ts: the time lives outside React, and
// useSyncExternalStore reads it. The server has no "now" worth showing (Next.js
// refuses Date.now() during the server render), so the server value is 0 and
// the real time arrives as soon as the first component subscribes.

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function tick() {
    now = Date.now();
    listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
    listeners.add(notify);
    // The first subscriber starts the clock (and reads the time straight away)
    if (listeners.size === 1) {
        now = Date.now();
        timer = setInterval(tick, 1000);
    }
    return () => {
        listeners.delete(notify);
        // The last one to leave stops it
        if (listeners.size === 0) clearInterval(timer);
    };
}

// The current time (Date.now() ms), or 0 before the clock has started
export function useNow() {
    return useSyncExternalStore(
        subscribe,
        () => now,
        () => 0,
    );
}

// 12s, 3m, 2h: the coarsest unit that still says something
export function ago(ms: number) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
}
