import { renderRss, XML_HEADERS } from "@/lib/feeds";
export function GET() { return new Response(renderRss("en"), { headers: XML_HEADERS }); }
