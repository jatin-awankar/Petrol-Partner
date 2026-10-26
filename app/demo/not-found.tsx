import Link from "next/link";
import styles from "./demo.module.css";

export default function DemoNotFound() {
  return <section className={styles.scope}>
    <p className={styles.eyebrow}>DEMO / PAGE NOT FOUND</p>
    <h1>Let’s get you back.</h1>
    <p>This sample page isn’t available. Your saved role and clock are unchanged.</p>
    <Link className={styles.primary} href="/demo">Return to demo</Link>
  </section>;
}
