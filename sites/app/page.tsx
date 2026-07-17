import { HomePage } from "@/components/HomePage";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ locale: "en", title: "Fichil | Backend, DevOps & Integration Engineer", description: "Backend and DevOps engineer documenting Java systems, logistics platforms, production recovery, and AI-assisted engineering.", path: "/", alternatePath: "/zh-cn/" });

export default function Page() { return <HomePage locale="en" />; }
