import type { ReactNode } from "react";

interface PageProps {
  readonly children?: ReactNode;
  readonly description: string;
  readonly title: string;
}

export function Page({ children, description, title }: PageProps) {
  return (
    <section className="page">
      <header className="page__header">
        <p className="page__eyebrow">Scaffold</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </header>
      {children ? <div className="page__body">{children}</div> : null}
    </section>
  );
}

