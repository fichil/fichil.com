import { HomePage } from "@/components/HomePage";
import { createMetadata } from "@/lib/seo";
import { getSiteCopy } from "@/lib/content";

export const metadata = createMetadata({ locale: "zh-cn", title: "Fichil | Excel / CSV 整理与重复报表自动化", description: getSiteCopy("zh-cn").hero.content, path: "/zh-cn/", alternatePath: "/" });

export default function Page() { return <HomePage locale="zh-cn" />; }
