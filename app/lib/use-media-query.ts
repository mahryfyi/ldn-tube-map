"use client";

import { useSyncExternalStore } from "react";

// Does this CSS media query match right now, and does the answer update when
// the window is resized or the setting changes?
//
// useSyncExternalStore is React's built-in way to read something that lives
// outside React (here: the browser's matchMedia). `serverValue` is the answer
// used on the server and for the very first render in the browser, because the
// server has no window to ask. Using the same value on both keeps hydration
// (React taking over the server's HTML) from complaining.
export function useMediaQuery(query: string, serverValue = false) {
    return useSyncExternalStore(
        (notify) => {
            const mql = window.matchMedia(query);
            mql.addEventListener("change", notify);
            return () => mql.removeEventListener("change", notify);
        },
        () => window.matchMedia(query).matches,
        () => serverValue,
    );
}

// Tablet and up (Tailwind's `md`, 768px): the width where the map is shown.
// Below it we show the live line status instead (see MobileNotice).
export const TABLET_UP = "(min-width: 768px)";

export const useReducedMotion = () =>
    useMediaQuery("(prefers-reduced-motion: reduce)");
