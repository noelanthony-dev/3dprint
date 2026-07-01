import type { CSSProperties, ReactNode } from "react";

interface DataTableProps {
  readonly columns: readonly string[];
  readonly columnsTemplate?: string;
  readonly density?: "default" | "dense";
  readonly footer?: string;
  readonly rows: readonly (readonly ReactNode[])[];
}

export function DataTable({
  columns,
  columnsTemplate,
  density = "default",
  footer,
  rows,
}: DataTableProps) {
  const tableStyle = {
    "--table-columns": columnsTemplate ?? `repeat(${columns.length}, minmax(0, 1fr))`,
  } as CSSProperties;

  return (
    <div className="data-table" data-density={density} role="table" style={tableStyle}>
      <div className="data-table__head" role="row">
        {columns.map((column) => (
          <span key={column} role="columnheader">
            {column}
          </span>
        ))}
      </div>
      <div className="data-table__body">
        {rows.map((row, rowIndex) => (
          <div className="data-table__row" key={rowIndex} role="row">
            {row.map((cell, cellIndex) => (
              <span key={cellIndex} role="cell">
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>
      {footer ? <div className="data-table__footer">{footer}</div> : null}
    </div>
  );
}
