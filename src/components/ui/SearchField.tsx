interface SearchFieldProps {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onChange?: (value: string) => void;
  readonly placeholder: string;
  readonly value?: string;
}

export function SearchField({
  disabled = false,
  label,
  onChange,
  placeholder,
  value,
}: SearchFieldProps) {
  return (
    <label className="search-field">
      <span>{label}</span>
      <input
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
