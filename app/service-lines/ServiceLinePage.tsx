"use client";

import styles from "./service-lines.module.css";

export type ServiceLineAction = {
  title: string;
  href: string;
  detail?: string;
  disabled?: boolean;
};

type ServiceLineScreenProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  actions: ServiceLineAction[];
};

function navigate(href: string) {
  window.location.href = href;
}

export default function ServiceLineScreen({
  eyebrow,
  title,
  subtitle,
  backHref = "/home",
  actions,
}: ServiceLineScreenProps) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <button className={`brand compact brand-home-link ${styles.brand}`} type="button" onClick={() => navigate("/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">TITAN</div>
            <div className="brand-subtitle">Tubular Inventory Tracking & Asset Navigation</div>
          </div>
        </button>

        <div className={styles.topActions}>
          <button className="button" type="button" onClick={() => navigate(backHref)}>
            Back
          </button>
          <button className="button primary" type="button" onClick={() => navigate("/home")}>
            Home
          </button>
        </div>
      </header>

      <section className={styles.panel}>
        <div className={styles.titleRow}>
          <div>
            <span>{eyebrow}</span>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>

        <div className={styles.grid}>
          {actions.map((action) => (
            <button
              key={action.title}
              className={styles.actionCard}
              type="button"
              disabled={action.disabled}
              onClick={() => !action.disabled && navigate(action.href)}
            >
              <strong>{action.title}</strong>
              {action.detail && <small>{action.detail}</small>}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
