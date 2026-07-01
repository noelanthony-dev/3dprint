import type { ReactNode } from "react";

interface PanelProps {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly title?: string;
}

export function Panel({ actions, children, title }: PanelProps) {
  return (
    <section className="panel">
      {title || actions ? (
        <header className="panel__header">
          {title ? <h2>{title}</h2> : <span />}
          {actions ? <div className="panel__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel__body">{children}</div>
    </section>
  );
}

