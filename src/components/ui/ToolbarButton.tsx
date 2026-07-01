import type { ReactNode } from "react";

type ToolbarButtonTone = "primary" | "secondary" | "ghost";

interface ToolbarButtonProps {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly form?: string;
  readonly onClick?: () => void;
  readonly tone?: ToolbarButtonTone;
  readonly type?: "button" | "submit";
}

export function ToolbarButton({
  children,
  disabled = false,
  form,
  onClick,
  tone = "secondary",
  type = "button",
}: ToolbarButtonProps) {
  return (
    <button
      className="toolbar-button"
      data-tone={tone}
      disabled={disabled}
      form={form}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}
