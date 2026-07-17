import { TaxonomyIndexPage } from "@/components/TaxonomyPages";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({ locale: "zh-cn", title: "分类", description: "按工程领域浏览 Fichil 技术记录。", path: "/zh-cn/categories/", alternatePath: "/categories/" });
export default function Page() { return <TaxonomyIndexPage locale="zh-cn" kind="categories" />; }
