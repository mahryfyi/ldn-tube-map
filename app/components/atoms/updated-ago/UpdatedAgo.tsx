"use client";

import { useEffect, useState } from "react";

// "Updated 12s ago", counting up every second. It lives in its own component
// so the once-a-second re-render never touches the panel (or the map) around it.
// `at` is when we last got fresh data (Date.now() ms).

// 12s, 3m, 2h: the coarsest unit that still says something
function ago(ms: number) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h`;
}

export function UpdatedAgo({
    at,
    className,
}: {
    at: number;
    className?: string;
}) {
    // The clock is only read inside the timer (browser only): Next.js refuses
    // Date.now() during the server render. Until the first tick (one second) it
    // reads "0s".
    const [now, setNow] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <p className={className}>
            Updated {now === 0 ? "0s" : ago(now - at)} ago
        </p>
    );
}
