import { Skeleton } from "@/components/ui/skeleton";

export default function BinDetailLoading() {
  return (
    <div>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-2 h-4 w-80" />
      <Skeleton className="mb-4 mt-8 h-5 w-40" />
      <Skeleton className="h-64 max-w-2xl" />
    </div>
  );
}
