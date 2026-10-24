import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoProvider } from "@/components/demo/DemoProvider";
import DemoShell from "@/components/demo/DemoShell";
import styles from "./demo.module.css";

export const metadata: Metadata = {
  title: "Try the demo | Petrol Partner",
  description: "Explore a fictional route with passenger and driver roles. No account, real ride or payment required.",
  robots: { index: false, follow: false },
};
export default function DemoLayout({ children }: { children: ReactNode }) {
  return <div className={styles.demo}>
    <DemoProvider><DemoShell>{children}</DemoShell></DemoProvider>
  </div>;
}
