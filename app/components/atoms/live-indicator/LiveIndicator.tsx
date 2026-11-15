"use client";

import { useEffect, useState } from "react";

// Says how fresh the train data is, only when there is something to say. It
// ticks every second, so it lives in its own component: re-rendering it never
// touches the map.
//
//   no data yet, or none for a while  -> a small spinner (after 300 ms, so a
//     (staleAfterMs)                     quick load never flashes it)
//   fetch failed                      -> a red pill: "Can't update trains · last
//                                        update 3m ago" (a spinner can't say that)
//   healthy                           -> nothing at all

// 12s, 3m, 2h: the coarsest unit that still says something
function ago(ms: number) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
}

export function LiveIndicator({
    lastOkAt,
    failed,
    staleAfterMs,
}: {
    lastOkAt: number | null; // when we last got good data (Date.now() ms), null = never
    failed: boolean; // did the most recent attempt fail?
    staleAfterMs: number;
}) {
    // Re-render once a second so "12s ago" counts up. The clock is only read
    // inside the effect (browser only): Next.js refuses Date.now() during the
    // server render, where it would freeze at build time. The first render is
    // always "Loading" (no data yet), which doesn't need the time.
    const [now, setNow] = useState(0);
    useEffect(() => {
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Healthy (or waiting): which of the three is it?
    const waiting =
        lastOkAt === null || now - lastOkAt > staleAfterMs; // no data, or no fresh data

    if (failed) {
        const text =
            lastOkAt === null
                ? "Can't update trains"
                : `Can't update trains · last update ${ago(now - lastOkAt)} ago`;
        return (
            // role="status": screen readers announce changes politely
            <div className="live-chip absolute top-4 right-4" role="status">
                <span className="live-chip-dot" />
                {text}
            </div>
        );
    }

    if (waiting) {
        return (
            <div
                className="live-spinner absolute top-4 right-4"
                role="status"
                aria-label={lastOkAt === null ? "Loading trains" : "Updating trains"}
            >
                <span className="live-spinner-ring" />
            </div>
        );
    }

    return null; // healthy: nothing to show
}
