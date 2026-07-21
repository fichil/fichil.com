import { HomePage } from "@/components/HomePage";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ locale: "en", title: "Fichil | Freelance Backend, DevOps & Integration Engineer", description: "Evidence-led production reliability, DevOps delivery, and enterprise logistics integration by Fichil.", path: "/", alternatePath: "/zh-cn/" });

export default function Page() { return <HomePage locale="en" />; }
