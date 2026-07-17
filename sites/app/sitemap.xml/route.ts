import { renderSitemapIndex, XML_HEADERS } from "@/lib/feeds";
export function GET() { return new Response(renderSitemapIndex(), { headers: XML_HEADERS }); }
