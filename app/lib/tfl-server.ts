// SERVER-ONLY helper: the one place that talks to TfL and knows the secret key.
// (Only files inside app/api/ import this, so it never ships to the browser.)
//
// It does three jobs:
//  1. adds the secret key (TFL_APP_KEY from .env.local) to every request
//  2. remembers each good answer for 20 seconds, so ten visitors cause one
//     TfL call, not ten
//  3. passes TfL's "too many requests" (429) message through honestly

// Must stay SHORTER than how often the browser asks for trains (30s,
// TRAIN_POLL_MS in page.tsx). If they were equal, a request arriving a
// moment early would get the previous answer again: the train stalls on old
// data, then dashes when the next update brings 60s of news at once.
const CACHE_MS = 20_000;

type Result = { status: number; body: string; retryAfter: string | null };
const cache = new Map<string, { at: number; result: Promise<Result> }>();

async function fetchFromTfl(path: string): Promise<Result> {
  const url = new URL(`https://api.tfl.gov.uk${path}`);
  const key = process.env.TFL_APP_KEY;
  if (key) url.searchParams.set("app_key", key); // no key set: still works, just slower limits

  const res = await fetch(url, { cache: "no-store" });
  return {
    status: res.status,
    body: await res.text(),
    retryAfter: res.headers.get("retry-after"),
  };
}

export async function tflGet(path: string): Promise<Response> {
  // Reuse a recent answer if we have one (or one that's already on its way)
  let entry = cache.get(path);
  if (!entry || Date.now() - entry.at > CACHE_MS) {
    entry = { at: Date.now(), result: fetchFromTfl(path) };
    cache.set(path, entry);
  }

  let result: Result;
  try {
    result = await entry.result;
  } catch {
    cache.delete(path);
    return Response.json({ error: "Could not reach TfL" }, { status: 502 });
  }

  if (result.status === 200) {
    return new Response(result.body, {
      headers: { "content-type": "application/json" },
    });
  }

  // Don't remember failures: the next request should try again
  cache.delete(path);
  const headers: Record<string, string> = {};
  if (result.retryAfter) headers["retry-after"] = result.retryAfter;
  return Response.json(
    { error: "TfL request failed", tflStatus: result.status },
    { status: result.status === 429 ? 429 : 502, headers }
  );
}
