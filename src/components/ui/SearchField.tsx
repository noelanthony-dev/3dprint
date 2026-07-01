interface SearchFieldProps {
  readonly label: string;
  readonly placeholder: string;
}

export function SearchField({ label, placeholder }: SearchFieldProps) {
  return (
    <label className="search-field">
      <span>{label}</span>
      <input disabled placeholder={placeholder} />
    </label>
  );
}
