import { renderRss, XML_HEADERS } from "@/lib/feeds";
export function GET() { return new Response(renderRss("zh-cn"), { headers: XML_HEADERS }); }
