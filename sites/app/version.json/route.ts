import { getBuildInfo } from "@/lib/content";

export function GET() {
  return Response.json(getBuildInfo(), {
    headers: {
      "cache-control": "no-store",
    },
  });
}
