interface LoadingSpinnerProps {
  readonly label?: string;
}

export function LoadingSpinner({ label = "Loading" }: LoadingSpinnerProps) {
  return <span aria-label={label} className="spinner" role="status" />;
}
