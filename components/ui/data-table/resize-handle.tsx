"use client";

import * as React from "react";
import { Header } from "@tanstack/react-table";
import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  header: Header<unknown, unknown>;
  onResetToDefault: () => void;
  lastColumnId: string;
  getColumnSize: (colId: string) => number;
  minColumnWidth: number;
}

export function ResizeHandle({
  header,
  onResetToDefault,
  lastColumnId,
  getColumnSize,
  minColumnWidth,
}: ResizeHandleProps) {
  const [isResizing, setIsResizing] = React.useState(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(0);
  const startLastColWidthRef = React.useRef(0);
  const isLastColumn = header.column.id === lastColumnId;

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = header.getSize();
      startLastColWidthRef.current = getColumnSize(lastColumnId);
    },
    [header, lastColumnId, getColumnSize]
  );

  const handleDoubleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onResetToDefault();
    },
    [onResetToDefault]
  );

  React.useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newSize = Math.max(minColumnWidth, startWidthRef.current + delta);
      const table = header.getContext().table;

      if (isLastColumn) {
        // Last column: just resize itself
        table.setColumnSizing((old) => ({
          ...old,
          [header.column.id]: newSize,
        }));
      } else {
        // Other columns: resize this column and compensate with last column
        const lastColNewSize = Math.max(
          minColumnWidth,
          startLastColWidthRef.current - delta
        );
        table.setColumnSizing((old) => ({
          ...old,
          [header.column.id]: newSize,
          [lastColumnId]: lastColNewSize,
        }));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, header, isLastColumn, lastColumnId, minColumnWidth]);

  return (
    <>
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="absolute right-0 top-0 h-full w-4 -mr-2 cursor-col-resize select-none touch-none flex items-center justify-center group"
        style={{ touchAction: "none" }}
      >
        <div
          className={cn(
            "h-full w-0.5 transition-colors",
            "group-hover:bg-primary/50 group-active:bg-primary",
            isResizing && "bg-primary"
          )}
        />
      </div>
      {/* Overlay to prevent text selection during resize */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </>
  );
}
