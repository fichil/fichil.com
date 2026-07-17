import { TaxonomyIndexPage } from "@/components/TaxonomyPages";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({ locale: "en", title: "Categories", description: "Browse Fichil engineering notes by discipline.", path: "/categories/", alternatePath: "/zh-cn/categories/" });
export default function Page() { return <TaxonomyIndexPage locale="en" kind="categories" />; }
