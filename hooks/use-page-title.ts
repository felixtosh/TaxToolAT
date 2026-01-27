"use client";

import { useEffect } from "react";

const APP_NAME = "FiBuKI";

/**
 * Sets the document title with a consistent format:
 * - "ViewName - FiBuKI" (no item selected)
 * - "ViewName - ItemName - FiBuKI" (item selected)
 *
 * @param viewName - The name of the current view (e.g., "Transactions", "Files")
 * @param itemName - Optional name of the selected item (e.g., transaction description, filename)
 */
export function usePageTitle(viewName: string, itemName?: string | null) {
  useEffect(() => {
    const parts = [viewName];

    if (itemName) {
      // Truncate long item names for the title
      const truncated = itemName.length > 50
        ? itemName.substring(0, 50) + "..."
        : itemName;
      parts.push(truncated);
    }

    parts.push(APP_NAME);

    document.title = parts.join(" - ");

    // Cleanup: restore default title when component unmounts
    return () => {
      document.title = APP_NAME;
    };
  }, [viewName, itemName]);
}
