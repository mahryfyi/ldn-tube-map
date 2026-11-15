"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Container } from "@mahry/ds";
import type { LineStatus } from "../../lib/tfl";
import { StatusPanel } from "../molecules/StatusPanel";
import { TrainIllustration } from "../molecules/TrainIllustration";

// The phone screen (Figma: mobile, 87:485). Below the tablet breakpoint we
// don't load the map at all (page.tsx decides), so this is what's shown.
export function MobileNotice({
    statuses,
    updatedAt,
}: {
    statuses: Record<string, LineStatus>;
    updatedAt: number | null;
}) {
    // Copy this page's address, so it can be opened on a bigger screen
    const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
    const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(reset.current), []);

    async function copyLink() {
        try {
            // Only works on https (or localhost): browsers hide the clipboard
            // on plain http, e.g. a phone opening your laptop's IP address
            await navigator.clipboard.writeText(window.location.href);
            setCopy("copied");
        } catch {
            setCopy("failed");
        }
        clearTimeout(reset.current);
        reset.current = setTimeout(() => setCopy("idle"), 2000);
    }

    return (
        <main className="min-h-dvh bg-surface-recessed">
            {/* Container gives the page padding (20px on phones). We cap the width so a
                near-tablet screen keeps the phone layout, and leave room for the
                home bar on iPhones at the bottom. */}
            <Container className="flex min-h-dvh max-w-[402px] flex-col gap-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <TrainIllustration />

                <div className="flex flex-col gap-2">
                    <h1 className="text-heading-sm text-fg-primary">
                        <span className="block">
                            This map is{" "}
                            <span className="whitespace-nowrap">desktop-only</span>
                        </span>
                        <span className="block">for now</span>
                    </h1>
                    <p className="text-body-sm text-fg-secondary">
                        Here’s live line status instead
                    </p>
                </div>

                <StatusPanel
                    statuses={statuses}
                    updatedAt={updatedAt}
                    className="w-full"
                />

                {/* mt-auto: the button sits at the bottom edge on tall screens */}
                <Button
                    variant="secondary"
                    label={
                        copy === "copied"
                            ? "Link copied"
                            : copy === "failed"
                              ? "Couldn’t copy link"
                              : "Copy link for desktop"
                    }
                    onClick={copyLink}
                    aria-live="polite"
                    className="mt-auto h-12 w-full shrink-0"
                />
            </Container>
        </main>
    );
}
