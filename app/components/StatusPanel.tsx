import { Card, Divider } from "@mahry/ds";
import { LINES } from "../lib/lines";
import type { LineStatus } from "../lib/tfl";
import type { StatusLevel } from "../tokens/tokens";
import { cn } from "../lib/utils";
import { StatusBadge } from "./StatusBadge";
import { UpdatedAgo } from "./UpdatedAgo";

// Figma: Playground → StatusPanel (77:351). The same panel sits on the map
// (desktop) and fills the width of the phone screen, so the caller decides
// placement, width and shadow through `className`.

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

const ON_MAP = LINES.filter((l) => l.onMap);
const OFF_MAP = LINES.filter((l) => !l.onMap);

export function StatusPanel({
    statuses,
    updatedAt,
    className,
}: {
    statuses: Record<string, LineStatus>;
    updatedAt: number | null; // when the statuses last loaded (Date.now() ms), null = not yet
    className?: string; // placement, width and shadow (e.g. "absolute top-4 left-4 w-[348px] shadow-sm")
}) {
    return (
        <Card
            className={cn(
                // Default: full width and flat (the phone screen). shadow-none also
                // cancels the Card's own faint default shadow. The map overrides both.
                "flex w-full flex-col gap-3 rounded-xl border-0 p-4 shadow-none",
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
            {/* min-h-6: the row keeps its height before the first update arrives */}
            <div className="flex min-h-6 items-center">
                {updatedAt !== null && (
                    <UpdatedAgo
                        at={updatedAt}
                        className="text-label-sm text-fg-tertiary"
                    />
                )}
            </div>
        </Card>
    );
}
