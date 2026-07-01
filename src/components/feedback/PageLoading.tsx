interface PageLoadingProps {
  readonly label: string;
}

export function PageLoading({ label }: PageLoadingProps) {
  return (
    <div className="page-loading" role="status">
      Loading {label}
    </div>
  );
}

