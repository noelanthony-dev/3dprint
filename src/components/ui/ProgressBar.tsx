interface ProgressBarProps {
  readonly label: string;
  readonly tone?: "success" | "warning" | "danger";
  readonly value: number;
}

export function ProgressBar({
  label,
  tone = "success",
  value,
}: ProgressBarProps) {
  const boundedValue = Math.max(0, Math.min(value, 100));

  return (
    <span className="progress" aria-label={label}>
      <span className="progress__track">
        <span
          className="progress__value"
          data-tone={tone}
          style={{ width: `${boundedValue}%` }}
        />
      </span>
      <span className="progress__label">{boundedValue}%</span>
    </span>
  );
}

