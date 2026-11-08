import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { StateView } from "@/components/ui/StateView";

export default function DashboardPage() {
  // Client component reads wallet + searchParams; Suspense covers useSearchParams during prerender
  return (
    <Suspense fallback={<StateView variant="loading" title="Loading dashboard…" />}>
      <DashboardClient />
    </Suspense>
  );
}
