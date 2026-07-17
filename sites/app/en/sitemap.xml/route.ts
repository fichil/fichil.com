import { renderLocaleSitemap, XML_HEADERS } from "@/lib/feeds";
export function GET() { return new Response(renderLocaleSitemap("en"), { headers: XML_HEADERS }); }
