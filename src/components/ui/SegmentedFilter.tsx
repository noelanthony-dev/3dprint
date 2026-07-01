interface SegmentedFilterOption {
  readonly active?: boolean;
  readonly label: string;
  readonly value?: string;
}

interface SegmentedFilterProps {
  readonly label: string;
  readonly onChange?: (value: string) => void;
  readonly options: readonly SegmentedFilterOption[];
}

export function SegmentedFilter({ label, onChange, options }: SegmentedFilterProps) {
  return (
    <div className="segmented-filter" aria-label={label}>
      {options.map((option) => (
        <button
          className="segmented-filter__item"
          data-active={option.active ? "true" : "false"}
          key={option.label}
          onClick={() => onChange?.(option.value ?? option.label)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
