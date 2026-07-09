import type { ReactNode } from "react";

import { LoadingSpinner } from "./LoadingSpinner";

type ToolbarButtonTone = "danger" | "primary" | "secondary" | "ghost";

interface ToolbarButtonProps {
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly form?: string;
  readonly isLoading?: boolean;
  readonly loadingLabel?: string;
  readonly onClick?: () => void;
  readonly tone?: ToolbarButtonTone;
  readonly type?: "button" | "submit";
}

export function ToolbarButton({
  children,
  disabled = false,
  form,
  isLoading = false,
  loadingLabel = "Working",
  onClick,
  tone = "secondary",
  type = "button",
}: ToolbarButtonProps) {
  return (
    <button
      className="toolbar-button"
      data-tone={tone}
      disabled={disabled || isLoading}
      form={form}
      onClick={onClick}
      type={type}
    >
      {isLoading ? (
        <>
          <LoadingSpinner label={loadingLabel} />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
