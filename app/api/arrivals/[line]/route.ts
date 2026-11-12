// Our server's door to TfL's arrivals for ONE line, e.g. /api/arrivals/jubilee.
// Only the known Tube lines are allowed through, so nobody can use this
// door to ask TfL for something else. The secret key is added in tfl-server.ts.

import { isKnownLine } from "../../../lib/lines";
import { tflGet } from "../../../lib/tfl-server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ line: string }> }
) {
  const { line } = await context.params;

  if (!isKnownLine(line)) {
    return Response.json({ error: "Unknown line" }, { status: 404 });
  }

  return tflGet(`/Line/${line}/Arrivals`);
}
