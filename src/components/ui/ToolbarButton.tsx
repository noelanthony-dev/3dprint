import type { ReactNode } from "react";

type ToolbarButtonTone = "primary" | "secondary" | "ghost";

interface ToolbarButtonProps {
  readonly children: ReactNode;
  readonly tone?: ToolbarButtonTone;
}

export function ToolbarButton({
  children,
  tone = "secondary",
}: ToolbarButtonProps) {
  return (
    <button className="toolbar-button" data-tone={tone} type="button">
      {children}
    </button>
  );
}

