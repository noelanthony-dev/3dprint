interface SwatchProps {
  readonly color: string;
  readonly label: string;
}

export function Swatch({ color, label }: SwatchProps) {
  return (
    <span className="swatch">
      <span
        aria-hidden="true"
        className="swatch__chip"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </span>
  );
}

