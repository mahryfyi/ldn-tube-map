"use client";

import { ago, useNow } from "../lib/use-now";
import "./LiveIndicator.css";

// Says how fresh the train data is, only when there is something to say. It
// ticks every second, so it lives in its own component: re-rendering it never
// touches the map.
//
//   no data yet, or none for a while  -> a small spinner (after 300 ms, so a
//     (staleAfterMs)                     quick load never flashes it)
//   fetch failed                      -> a red pill: "Can't update trains · last
//                                        update 3m ago" (a spinner can't say that)
//   healthy                           -> nothing at all

export function LiveIndicator({
    lastOkAt,
    failed,
    staleAfterMs,
}: {
    lastOkAt: number | null; // when we last got good data (Date.now() ms), null = never
    failed: boolean; // did the most recent attempt fail?
    staleAfterMs: number;
}) {
    // Re-renders once a second so "3m ago" counts up. 0 on the server and until
    // the clock starts; the first render is always "Loading" (no data yet),
    // which doesn't need the time.
    const now = useNow();

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
