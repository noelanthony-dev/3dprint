interface PageLoadingProps {
  readonly label: string;
}

export function PageLoading({ label }: PageLoadingProps) {
  return (
    <div className="page-loading" aria-live="polite" role="status">
      Loading {label}
    </div>
  );
}
