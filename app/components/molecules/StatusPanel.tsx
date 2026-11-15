"use client";

import { useEffect, useState } from "react";
import { Button, Card, Divider } from "@mahry/ds";
import { ChevronDown, ChevronUp } from "lucide-react";
import { LINES } from "../../lib/lines";
import type { LineStatus } from "../../lib/tfl";
import type { StatusLevel } from "../../tokens/tokens";
import { cn } from "../../lib/utils";
import { StatusBadge } from "../atoms/status-badge";
import { UpdatedAgo } from "../atoms/updated-ago";

// Figma: Playground → StatusPanel (77:351). The same panel sits on the map
// (desktop, a fixed 348px) and fills the width of the phone screen, so the
// caller decides placement and width through `className`.

// TfL severity → our three statuses. 10 = good service, 9 = minor delays,
// anything else (severe delays, part/full closures, suspensions) = severe.
function levelOf(severity: number): StatusLevel {
    if (severity === 10) return "good";
    if (severity === 9) return "minor";
    return "severe";
}

// ["A", "B", "C"] → "A, B and C"
function joinNames(names: string[]) {
    if (names.length < 2) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// Spoken description of the dot on the collapsed button (the dot is colour only)
const WORST_LABEL = {
    severe: "Severe disruption",
    minor: "Minor delays",
    good: "Good service",
} as const;

const ON_MAP = LINES.filter((l) => l.onMap);
const OFF_MAP = LINES.filter((l) => !l.onMap);

export function StatusPanel({
    statuses,
    updatedAt,
    collapsible = false,
    className,
}: {
    statuses: Record<string, LineStatus>;
    updatedAt: number | null; // when the statuses last loaded (Date.now() ms), null = not yet
    collapsible?: boolean; // desktop: can fold down to a small button. Phone: always open
    className?: string; // placement (e.g. "absolute top-4 left-4"), used in both states
}) {
    const [open, setOpen] = useState(true);
    // Play the grow-in only after someone has toggled it, not on first load
    const [toggled, setToggled] = useState(false);
    // The button that was pressed disappears (the other state replaces it), so
    // focus would be lost. After a toggle we send focus to the new button
    // (found by its data attribute: only one of the two exists at a time).
    useEffect(() => {
        if (toggled)
            document
                .querySelector<HTMLButtonElement>("[data-status-toggle]")
                ?.focus();
    }, [open, toggled]);

    function toggle() {
        setToggled(true);
        setOpen((o) => !o);
    }

    const animation = toggled ? "panel-in" : "";

    if (collapsible && !open) {
        const levels = ON_MAP.flatMap((l) =>
            statuses[l.id] ? [levelOf(statuses[l.id].severity)] : [],
        );
        const worst: StatusLevel | null = levels.includes("severe")
            ? "severe"
            : levels.includes("minor")
              ? "minor"
              : levels.length
                ? "good"
                : null;
        return (
            <Button
                data-status-toggle
                aria-label={
                    worst
                        ? `Show line status (${WORST_LABEL[worst]})`
                        : "Show line status"
                }
                variant="tertiary"
                label="Line status"
                hasIconLeft
                iconLeft={
                    <span
                        className="block size-2.5 rounded-full bg-fg-tertiary"
                        style={
                            worst
                                ? { background: `var(--tube-status-${worst}-bg)` }
                                : undefined
                        }
                    />
                }
                hasIconRight
                iconRight={<ChevronDown className="size-4" />}
                onClick={toggle}
                aria-expanded={false}
                className={cn("shadow-md", animation, className)}
            />
        );
    }

    return (
        <Card
            className={cn(
                "flex flex-col gap-3 rounded-xl border-0 p-4",
                // On the map: the same shadow as the train callout, to lift it off
                // the map. On the phone it sits on a flat grey page: none at all
                // (shadow-none also cancels the Card's own faint default).
                collapsible ? "w-[348px] shadow-md" : "w-full shadow-none",
                animation,
                className,
            )}
        >
            <ul className="flex flex-col gap-2">
                {ON_MAP.map((line) => {
                    const status = statuses[line.id];
                    return (
                        <li
                            key={line.id}
                            className="flex items-center justify-between gap-2"
                        >
                            <span className="flex items-center gap-2">
                                <span
                                    className="h-1.5 w-4 shrink-0 rounded-full"
                                    style={{ background: line.colour }}
                                />
                                <span className="text-label-md text-fg-primary whitespace-nowrap">
                                    {line.name}
                                </span>
                            </span>
                            {status && (
                                <StatusBadge status={levelOf(status.severity)}>
                                    {status.description}
                                </StatusBadge>
                            )}
                        </li>
                    );
                })}
            </ul>
            <Divider />
            <p className="text-caption-default font-medium text-fg-secondary">
                {joinNames(OFF_MAP.map((l) => l.name))} aren’t on the map yet.
                Check their status on{" "}
                <a
                    href="https://tfl.gov.uk/tube-dlr-overground/status/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                >
                    tfl.gov.uk
                </a>
                .
            </p>
            <div className="flex min-h-6 items-center justify-between">
                {updatedAt !== null ? (
                    <UpdatedAgo
                        at={updatedAt}
                        className="text-label-sm text-fg-tertiary"
                    />
                ) : (
                    <span />
                )}
                {collapsible && (
                    <Button
                        data-status-toggle
                        variant="ghost"
                        label="Hide"
                        hasIconRight
                        iconRight={<ChevronUp className="size-4" />}
                        onClick={toggle}
                        aria-expanded
                        className="-mr-2 h-6 px-2 text-label-sm"
                    />
                )}
            </div>
        </Card>
    );
}
