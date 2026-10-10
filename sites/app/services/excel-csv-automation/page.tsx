import { ServicePage } from "@/components/ServicePage";
import { getServiceCopy, servicePath } from "@/lib/content";
import { createMetadata } from "@/lib/seo";
const copy = getServiceCopy("en");
export const metadata = createMetadata({ locale: "en", title: copy.title, description: copy.description, path: servicePath("en"), alternatePath: servicePath("zh-cn") });
export default function Page() { return <ServicePage locale="en" />; }
