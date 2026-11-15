import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Same helper as Mahry DS: join class names, and when two clash, the later
// one wins. tailwind-merge has to be told about Mahry's type sizes
// (text-label-sm etc.), or it mistakes them for text colours and drops one.
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            "font-size": [
                {
                    text: [
                        "display-xl",
                        "display-lg",
                        "display-md",
                        "heading-lg",
                        "heading-md",
                        "heading-sm",
                        "body-lg",
                        "body-md",
                        "body-sm",
                        "label-lg",
                        "label-md",
                        "label-sm",
                        "caption-default",
                    ],
                },
            ],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
