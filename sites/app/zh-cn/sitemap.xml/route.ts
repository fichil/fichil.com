import { renderLocaleSitemap, XML_HEADERS } from "@/lib/feeds";
export function GET() { return new Response(renderLocaleSitemap("zh-cn"), { headers: XML_HEADERS }); }
