import type { MetadataRoute } from "next";

// The site is a static export, so the manifest has to be built at build time.
export const dynamic = "force-static";

/**
 * Web app manifest: tells Android/Chrome which icons to use when the site is
 * saved to a home screen or installed. The 192 and 512 icons are full-bleed
 * blue with the face well inside the centre, so the same files serve both as
 * plain icons ("any") and as maskable ones (Android crops them to a circle or
 * squircle). They're listed twice because browsers want one purpose per entry.
 *
 * theme_color is the site blue (--color-action-primary). A manifest can't
 * read CSS variables, so the hex is repeated here.
 */
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "London Tube Map",
        short_name: "Tube Map",
        start_url: "/",
        display: "browser",
        theme_color: "#0A4BFF",
        background_color: "#FFFFFF",
        icons: [
            {
                src: "/icons/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "any",
            },
            {
                src: "/icons/icon-192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable",
            },
            {
                src: "/icons/icon-512.png",
                sizes: "512x512",
                type: "image/png",
                purpose: "maskable",
            },
        ],
    };
}
