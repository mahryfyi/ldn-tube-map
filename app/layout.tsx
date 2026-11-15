import type { Metadata } from "next";
import "@fontsource-variable/geist"; // Mahry DS's --typo-font-sans expects "Geist Variable"
import "./globals.css";

export const metadata: Metadata = {
  title: "Tube map",
  description: "Live-ish London Underground trains, estimated from TfL arrivals",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme switches Mahry DS and the tube tokens (tokens.css): "light" is
    // the default, "dark" is opt-in (also set THEME in lib/line.config.ts)
    <html lang="en" data-theme="light" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-map-ground font-body text-fg-primary">{children}</body>
    </html>
  );
}
