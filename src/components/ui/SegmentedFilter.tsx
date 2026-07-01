interface SegmentedFilterOption {
  readonly active?: boolean;
  readonly label: string;
}

interface SegmentedFilterProps {
  readonly label: string;
  readonly options: readonly SegmentedFilterOption[];
}

export function SegmentedFilter({ label, options }: SegmentedFilterProps) {
  return (
    <div className="segmented-filter" aria-label={label}>
      {options.map((option) => (
        <button
          className="segmented-filter__item"
          data-active={option.active ? "true" : "false"}
          disabled
          key={option.label}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
