import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../../lib/utils";

// A borderless pill showing a line's service status. Matches Figma "StatusBadge"
// (77:57): 8px / 2px padding, label/sm text. Colours come from the tube status
// tokens (tokens.css), one pair per status.
export const statusBadgeVariants = cva(
    "inline-flex items-center justify-center rounded-full px-2 py-0.5 font-label text-label-sm whitespace-nowrap",
    {
        variants: {
            status: {
                good: "bg-(--tube-status-good-bg) text-(--tube-status-good-fg)",
                minor: "bg-(--tube-status-minor-bg) text-(--tube-status-minor-fg)",
                severe: "bg-(--tube-status-severe-bg) text-(--tube-status-severe-fg)",
            },
        },
        defaultVariants: { status: "good" },
    },
);

export type StatusBadgeProps = React.HTMLAttributes<HTMLSpanElement> &
    VariantProps<typeof statusBadgeVariants>;

export function StatusBadge({
    className,
    status,
    children,
    ...props
}: StatusBadgeProps) {
    return (
        <span
            className={cn(statusBadgeVariants({ status, className }))}
            {...props}
        >
            {children}
        </span>
    );
}
