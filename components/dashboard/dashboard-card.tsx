import type { ReactNode } from "react";
import styles from "./dashboard-overview.module.css";

export function DashboardCard({ title, subtitle, action, children, className = "" }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.card} ${className}`}>
      <div className={styles.cardHeading}>
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action}
      </div>
      {children}
    </section>
  );
}
