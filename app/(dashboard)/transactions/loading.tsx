import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <div className="h-full flex flex-col overflow-hidden bg-card">
      {/* Toolbar skeleton */}
      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <Skeleton className="h-9 w-[300px]" />
        <Skeleton className="h-9 w-[100px]" />
      </div>
      {/* Table header skeleton */}
      <div className="flex items-center gap-2 px-4 h-10 border-b bg-muted">
        <Skeleton className="h-4 w-[50px]" />
        <Skeleton className="h-4 w-[55px]" />
        <Skeleton className="h-4 w-[80px]" />
        <Skeleton className="h-4 w-[50px]" />
        <Skeleton className="h-4 w-[30px]" />
        <Skeleton className="h-4 w-[55px]" />
      </div>
      {/* Table rows skeleton */}
      <div className="flex-1">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 border-b last:border-b-0"
            style={{ height: 64 }}
          >
            <Skeleton className="h-5 w-[64px]" />
            <Skeleton className="h-5 w-[64px]" />
            <Skeleton className="h-5 w-[200px]" />
            <Skeleton className="h-5 w-[100px] rounded-full" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-5 w-[100px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
