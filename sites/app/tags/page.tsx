import { TaxonomyIndexPage } from "@/components/TaxonomyPages";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({ locale: "en", title: "Tags", description: "Browse Fichil engineering notes by technology and topic.", path: "/tags/", alternatePath: "/zh-cn/tags/" });
export default function Page() { return <TaxonomyIndexPage locale="en" kind="tags" />; }
