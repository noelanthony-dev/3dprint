import { Page } from "@/components/layout/Page";
import { Badge, DataTable, MetricPanel, Panel, ToolbarButton } from "@/components/ui";

interface FeatureScaffoldProps {
  readonly description: string;
  readonly focus: readonly string[];
  readonly metrics: readonly {
    readonly detail?: string;
    readonly label: string;
    readonly tone?: "default" | "success" | "warning" | "danger";
    readonly value: string;
  }[];
  readonly title: string;
}

export function FeatureScaffold({
  description,
  focus,
  metrics,
  title,
}: FeatureScaffoldProps) {
  return (
    <Page
      actions={
        <>
          <ToolbarButton>Review Scope</ToolbarButton>
          <ToolbarButton tone="primary">Phase Placeholder</ToolbarButton>
        </>
      }
      description={description}
      title={title}
    >
      <div className="metric-grid">
        {metrics.map((metric) => (
          <MetricPanel
            key={metric.label}
            label={metric.label}
            value={metric.value}
            {...(metric.detail ? { detail: metric.detail } : {})}
            {...(metric.tone ? { tone: metric.tone } : {})}
          />
        ))}
      </div>

      <div className="content-grid content-grid--two">
        <Panel title="Phase Scope">
          <div className="spec-list">
            {focus.map((item) => (
              <div className="spec-list__item" key={item}>
                <Badge tone="accent">Planned</Badge>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Architecture Guardrails">
          <DataTable
            columns={["Boundary", "Status"]}
            footer="Presentation-only scaffold; no feature workflow is active."
            rows={[
              ["Raw SQL in React", <Badge tone="success">Blocked</Badge>],
              ["Business calculations", <Badge tone="success">Domain later</Badge>],
              ["Persistence", <Badge>Repository phase</Badge>],
            ]}
          />
        </Panel>
      </div>
    </Page>
  );
}
