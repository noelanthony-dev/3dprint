import type { ReactNode } from "react";

interface PageProps {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly description: string;
  readonly eyebrow?: string;
  readonly meta?: readonly string[];
  readonly title: string;
}

export function Page({
  actions,
  children,
  description,
  eyebrow = "Offline scaffold",
  meta = ["Local database later", "No sync", "No auth"],
  title,
}: PageProps) {
  return (
    <section className="page">
      <header className="page__header">
        <div className="page__title-group">
          <p className="page__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className="page__meta" aria-label="Page status">
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
        {actions ? <div className="page__actions">{actions}</div> : null}
      </header>
      {children ? <div className="page__body">{children}</div> : null}
    </section>
  );
}
