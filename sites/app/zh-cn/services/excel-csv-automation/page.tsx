import { ServicePage } from "@/components/ServicePage";
import { getServiceCopy, servicePath } from "@/lib/content";
import { createMetadata } from "@/lib/seo";
const copy = getServiceCopy("zh-cn");
export const metadata = createMetadata({ locale: "zh-cn", title: copy.title, description: copy.description, path: servicePath("zh-cn"), alternatePath: servicePath("en") });
export default function Page() { return <ServicePage locale="zh-cn" />; }
