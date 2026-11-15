# Tube map

A geographic London Underground map with live-ish trains. TfL publishes no train
positions, only predicted arrivals at stations, so each train's position is
estimated from those predictions and glides between updates.

A learning prototype: built to understand how APIs work (keys, proxies, polling,
rate limits, GeoJSON). Estimates sometimes jump; that's expected.

- **Desktop / tablet (768px and up):** the map, with a line-status panel and a
  callout when you hover a train.
- **Phone:** no map, just live line status and a link to open it on a bigger screen.

## Run it

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # http://localhost:3000
```

## Environment variables

See `.env.example` for details.

| Name | Where it's used | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser (map tiles) | No, public by design. Restrict it by URL in Mapbox. |
| `TFL_APP_KEY` | Server only (`app/lib/tfl-server.ts`) | **Yes.** Never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_MAPBOX_STYLE_URL_LIGHT` | Optional Light map style | No |
| `NEXT_PUBLIC_MAPBOX_STYLE_URL` | Dark map style (Dark isn't switched on yet) | No |

## How it fits together

- The browser never talks to TfL. It asks our own routes in `app/api/`
  (`/api/status`, `/api/arrivals/[line]`, `/api/route-sequence/[line]`), which add
  the secret key, cache answers for 20 seconds and pass TfL's reply on.
- `app/page.tsx` draws the map (Mapbox GL JS) and polls for trains every 30 s.
- `app/lib/` holds the logic: TfL data and train estimates (`tfl.ts`, `track.ts`,
  `smooth.ts`), map layers (`map-layers.ts`), the hover callout (`callout.ts`) and
  look-and-feel constants (`line.config.ts`).
- `app/components/` holds the UI. Buttons, cards and type come from
  [Mahry DS](https://github.com/mahryme/mahry-ds).
- `app/tokens/` holds the colours, in the Mahry DS layout: `colours/primitive.css`
  (raw TfL colours) and `colours/semantic.css` (roles, Light/Dark).
  `tokens.ts` mirrors both for Mapbox, which can't read CSS variables. Change a
  colour in both places.

## Data and attribution

Unofficial learning project, not affiliated with or endorsed by Transport for London.

- Line status, route geometry and train predictions come from the TfL Unified API under the [TfL Transport Data Service licence](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service) (based on OGL v2.0). The licence requires the on-screen credits in `app/components/Attribution.tsx`: "Powered by TfL Open Data", the Ordnance Survey notice and the Geomni notice. Keep them visible.
- Train positions are estimates inferred from predicted arrivals, not GPS.
- Base map © Mapbox © OpenStreetMap contributors, shown by Mapbox GL in the bottom-right of the map. Don't hide it.
- Don't use TfL logos, roundels or other branding.
- The TfL key (`TFL_APP_KEY`) stays server-side; the licence allows up to 500 calls per minute per feed, and `app/lib/tfl-server.ts` caches responses for 20 seconds.

## Deploy

Any Next.js host works (e.g. Vercel). Before going live:

1. Set the environment variables above on the host.
2. Add the production domain to the Mapbox token's allowed URLs, or the map
   won't load there.
3. `npm run build` locally first: it fails if anything breaks the server/browser split.
