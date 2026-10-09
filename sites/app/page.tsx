import { HomePage } from "@/components/HomePage";
import { createMetadata } from "@/lib/seo";
import { getSiteCopy } from "@/lib/content";

export const metadata = createMetadata({ locale: "en", title: "Fichil | Excel / CSV cleanup and repeatable reports", description: getSiteCopy("en").hero.content, path: "/", alternatePath: "/zh-cn/" });

export default function Page() { return <HomePage locale="en" />; }
