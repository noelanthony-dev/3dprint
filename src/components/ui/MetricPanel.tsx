import type { ReactNode } from "react";

type MetricTone = "default" | "success" | "warning" | "danger";

interface MetricPanelProps {
  readonly detail?: string;
  readonly label: string;
  readonly tone?: MetricTone;
  readonly value: ReactNode;
}

export function MetricPanel({
  detail,
  label,
  tone = "default",
  value,
}: MetricPanelProps) {
  return (
    <article className="metric-panel" data-tone={tone}>
      <span className="metric-panel__label">{label}</span>
      <strong>{value}</strong>
      {detail ? <span className="metric-panel__detail">{detail}</span> : null}
    </article>
  );
}

