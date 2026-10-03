import { Skeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-28" />
      <Skeleton className="mt-2 h-4 w-96" />

      <div className="mt-6 flex gap-2 border-b border-border pb-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-28" />
      </div>
      <Skeleton className="mt-5 h-64 w-full" />
    </div>
  );
}
