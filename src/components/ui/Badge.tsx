import type { ReactNode } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
}

export function Badge({ children, tone = "neutral" }: BadgeProps) {
  return (
    <span className="badge" data-tone={tone}>
      {children}
    </span>
  );
}

