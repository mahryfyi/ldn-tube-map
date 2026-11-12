// Our server's door to TfL's route (stations + line shape) for ONE line,
// e.g. /api/route-sequence/bakerloo. Same safety list as the arrivals door.

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

  return tflGet(`/Line/${line}/Route/Sequence/inbound`);
}
