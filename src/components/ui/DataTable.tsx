import type { CSSProperties, ReactNode } from "react";

type DataTableColumn =
  | string
  | {
      readonly header: ReactNode;
      readonly key: string;
    };

interface DataTableProps {
  readonly columns: readonly DataTableColumn[];
  readonly columnsTemplate?: string;
  readonly density?: "default" | "dense";
  readonly emptyMessage?: string;
  readonly footer?: string;
  readonly onRowClick?: (rowIndex: number) => void;
  readonly rows: readonly (readonly ReactNode[])[];
  readonly selectedRowIndex?: number | null;
}

export function DataTable({
  columns,
  columnsTemplate,
  density = "default",
  emptyMessage = "No records to display.",
  footer,
  onRowClick,
  rows,
  selectedRowIndex = null,
}: DataTableProps) {
  const tableStyle = {
    "--table-columns": columnsTemplate ?? `repeat(${columns.length}, minmax(0, 1fr))`,
  } as CSSProperties;

  return (
    <div className="data-table" data-density={density} role="table" style={tableStyle}>
      <div className="data-table__head" role="row">
        {columns.map((column) => (
          <span key={getColumnKey(column)} role="columnheader">
            {getColumnHeader(column)}
          </span>
        ))}
      </div>
      <div className="data-table__body">
        {rows.length === 0 ? (
          <div className="data-table__row data-table__row--empty" role="row">
            <span role="cell" style={{ gridColumn: `1 / span ${columns.length}` }}>
              {emptyMessage}
            </span>
          </div>
        ) : (
          rows.map((row, rowIndex) => (
            <div
              aria-selected={selectedRowIndex === rowIndex}
              className="data-table__row"
              data-clickable={onRowClick ? "true" : "false"}
              data-selected={selectedRowIndex === rowIndex ? "true" : "false"}
              key={rowIndex}
              onClick={onRowClick ? () => onRowClick(rowIndex) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }

                      event.preventDefault();
                      onRowClick(rowIndex);
                    }
                  : undefined
              }
              role="row"
              tabIndex={onRowClick ? 0 : undefined}
            >
              {row.map((cell, cellIndex) => (
                <span key={cellIndex} role="cell">
                  {cell}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
      {footer ? <div className="data-table__footer">{footer}</div> : null}
    </div>
  );
}

function getColumnKey(column: DataTableColumn): string {
  return typeof column === "string" ? column : column.key;
}

function getColumnHeader(column: DataTableColumn): ReactNode {
  return typeof column === "string" ? column : column.header;
}
