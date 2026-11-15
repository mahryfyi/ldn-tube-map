"use client";

import { ago, useNow } from "../lib/use-now";

// "Updated 12s ago", counting up every second. It lives in its own component
// so the once-a-second re-render never touches the panel (or the map) around it.
// `at` is when we last got fresh data (Date.now() ms).
export function UpdatedAgo({
    at,
    className,
}: {
    at: number;
    className?: string;
}) {
    const now = useNow(); // 0 until the clock starts in the browser
    return (
        <p className={className}>
            Updated {now === 0 ? "0s" : ago(now - at)} ago
        </p>
    );
}
