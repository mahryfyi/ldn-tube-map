// Our server's door to TfL's "how is each Tube line running?" data.

import { tflGet } from "../../lib/tfl-server";

export async function GET() {
  return tflGet("/Line/Mode/tube/Status");
}
