"use client";

import * as React from "react";
import { forwardRef } from "react";
import { UserPartner } from "@/types/partner";
import {
  ResizableDataTable,
  DataTableHandle,
} from "@/components/ui/data-table";
import { getPartnerColumns } from "./partner-columns";

interface PartnerDataTableProps {
  data: UserPartner[];
  onRowClick?: (partner: UserPartner) => void;
  selectedRowId?: string | null;
  onEdit?: (partner: UserPartner) => void;
  onDelete?: (partnerId: string) => void;
}

export interface PartnerDataTableHandle {
  scrollToIndex: (index: number) => void;
}

// Default column sizes for partners table
const DEFAULT_PARTNER_COLUMN_SIZES: Record<string, number> = {
  name: 200,
  vatId: 120,
  ibans: 180,
  website: 150,
  actions: 50,
};

function PartnerDataTableInner(
  { data, onRowClick, selectedRowId, onEdit, onDelete }: PartnerDataTableProps,
  ref: React.ForwardedRef<PartnerDataTableHandle>
) {
  const columns = React.useMemo(
    () => getPartnerColumns({ onEdit, onDelete }),
    [onEdit, onDelete]
  );

  // Get data attributes for row
  const getRowDataAttributes = React.useCallback((row: UserPartner) => {
    return { "partner-id": row.id };
  }, []);

  return (
    <ResizableDataTable
      ref={ref as React.Ref<DataTableHandle>}
      columns={columns}
      data={data}
      onRowClick={onRowClick}
      selectedRowId={selectedRowId}
      defaultColumnSizes={DEFAULT_PARTNER_COLUMN_SIZES}
      getRowDataAttributes={getRowDataAttributes}
      emptyMessage="No partners found."
    />
  );
}

export const PartnerDataTable = forwardRef(PartnerDataTableInner);
