import { BlogIndexPage } from "@/components/BlogIndexPage";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ locale: "en", title: "Engineering Notes", description: "Backend, DevOps, logistics systems, production recovery, and AI-assisted engineering notes.", path: "/blog/", alternatePath: "/zh-cn/blog/" });
export default function Page() { return <BlogIndexPage locale="en" page={1} />; }
