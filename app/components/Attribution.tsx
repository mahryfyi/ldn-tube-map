import { Card } from "@mahry/ds";
import { cn } from "../lib/utils";

// Credits required by TfL's Transport Data Service licence
// (https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service).
// The wording of the first paragraph is prescribed by the licence, so don't
// reword it. Mapbox and OpenStreetMap credits are handled by Mapbox GL itself
// (bottom-right of the map) and must stay visible.
//
// Styled like StatusPanel: a Mahry DS Card on the map, with the same 16px inset,
// radius and shadow; type and colours come from the design tokens, so it follows
// the theme.

const linkClass = "text-fg-primary underline";

// Default: a card pinned to the map's bottom-left corner.
// inline: no card, it flows in the page (used on the phone screen, which has no map).
export default function Attribution({ inline = false }: { inline?: boolean }) {
    const text = (
        <div className="text-caption-default text-fg-secondary flex flex-col gap-1">
            <p>
                Powered by{" "}
                <a
                    href="https://tfl.gov.uk/info-for/open-data-users"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(linkClass, "font-medium")}
                >
                    TfL Open Data
                </a>
                . Contains OS data © Crown copyright and database rights 2016.
                Geomni UK Map data © and database rights 2019.
            </p>
            <p>
                Unofficial learning project built by{" "}
                <a
                    href="https://mahry.fyi"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(linkClass, "font-medium")}
                >
                    Maksym H.
                </a>{" "}
                Not affiliated with or endorsed by TfL. Train positions are
                estimated from predicted arrivals.
            </p>
        </div>
    );

    if (inline) return text;

    return (
        // bottom-10: sits above the Mapbox logo
        <Card className="absolute bottom-10 left-4 w-[348px] rounded-xl border-0 p-4 shadow-sm">
            {text}
        </Card>
    );
}
