"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { TransactionDetailPanel } from "@/components/transactions/transaction-detail-panel";
import { useTransactions } from "@/hooks/use-transactions";
import { useSources } from "@/hooks/use-sources";
import { Skeleton } from "@/components/ui/skeleton";
import { Transaction } from "@/types/transaction";
import { cn } from "@/lib/utils";

const PANEL_WIDTH_KEY = "transactionDetailPanelWidth";
const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 380;
const MAX_PANEL_WIDTH = 700;

function TransactionTableFallback() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Skeleton className="h-9 w-[300px]" />
        <Skeleton className="h-9 w-[100px]" />
      </div>
      <div className="flex-1">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-4 px-4 py-3 border-b last:border-b-0"
          >
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[200px]" />
            <Skeleton className="h-4 w-[120px]" />
            <Skeleton className="h-4 w-[80px]" />
            <Skeleton className="h-4 w-[60px]" />
            <Skeleton className="h-4 w-[24px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { transactions, loading, updateTransaction } = useTransactions();
  const { sources } = useSources();

  const [panelWidth, setPanelWidth] = useState<number>(DEFAULT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const currentWidthRef = useRef(panelWidth);

  // Get selected transaction ID from URL
  const selectedId = searchParams.get("id");

  // Find selected transaction
  const selectedTransaction = useMemo(() => {
    if (!selectedId || !transactions.length) return null;
    return transactions.find((t) => t.id === selectedId) || null;
  }, [selectedId, transactions]);

  // Find source for selected transaction
  const selectedSource = useMemo(() => {
    if (!selectedTransaction) return undefined;
    return sources.find((s) => s.id === selectedTransaction.sourceId);
  }, [selectedTransaction, sources]);

  // Load panel width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= MIN_PANEL_WIDTH && parsed <= MAX_PANEL_WIDTH) {
        setPanelWidth(parsed);
      }
    }
  }, []);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: panelWidth };
  }, [panelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !panelRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, resizeRef.current.startWidth + delta));
      // Update DOM directly during drag - no React re-render
      panelRef.current.style.width = `${newWidth}px`;
      currentWidthRef.current = newWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Commit to state only on drag end
      setPanelWidth(currentWidthRef.current);
      localStorage.setItem(PANEL_WIDTH_KEY, currentWidthRef.current.toString());
      resizeRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Select transaction (update URL)
  const handleSelectTransaction = useCallback(
    (transaction: Transaction) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("id", transaction.id);
      router.push(`/transactions?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Close detail panel (remove ID from URL)
  const handleCloseDetail = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("id");
    const newUrl = params.toString()
      ? `/transactions?${params.toString()}`
      : "/transactions";
    router.push(newUrl, { scroll: false });
  }, [router, searchParams]);

  // Update transaction
  const handleTransactionUpdate = useCallback(
    async (updates: Partial<Transaction>) => {
      if (!selectedTransaction) return;
      await updateTransaction(selectedTransaction.id, updates);
    },
    [selectedTransaction, updateTransaction]
  );

  // Scroll to selected transaction when it changes from URL
  useEffect(() => {
    if (selectedId && !loading) {
      setTimeout(() => {
        const element = document.querySelector(
          `[data-transaction-id="${selectedId}"]`
        );
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }, [selectedId, loading]);

  if (loading) {
    return <TransactionTableFallback />;
  }

  return (
    <div className="h-full overflow-hidden">
      {/* Main content - adjusts margin when panel is open */}
      <div
        className="h-full transition-[margin] duration-200 ease-in-out"
        style={{ marginRight: selectedTransaction ? panelWidth : 0 }}
      >
        <TransactionTable
          onSelectTransaction={handleSelectTransaction}
          selectedTransactionId={selectedId}
        />
      </div>

      {/* Right sidebar - fixed position */}
      {selectedTransaction && (
        <div
          ref={panelRef}
          className="fixed right-0 top-14 bottom-0 z-30 bg-background border-l flex"
          style={{ width: panelWidth }}
        >
          {/* Resize handle */}
          <div
            className={cn(
              "w-1 cursor-col-resize bg-border hover:bg-primary/20 active:bg-primary/30 flex-shrink-0",
              isResizing && "bg-primary/30"
            )}
            onMouseDown={handleResizeStart}
          />
          {/* Panel content */}
          <div className="flex-1 overflow-hidden">
            <TransactionDetailPanel
              transaction={selectedTransaction}
              source={selectedSource}
              onClose={handleCloseDetail}
              onUpdate={handleTransactionUpdate}
            />
          </div>
        </div>
      )}

      {/* Prevent text selection while resizing */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionTableFallback />}>
      <TransactionsContent />
    </Suspense>
  );
}
