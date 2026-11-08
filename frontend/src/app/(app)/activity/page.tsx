import { Suspense } from "react";
import { ActivityClient } from "@/components/activity/ActivityClient";
import { StateView } from "@/components/ui/StateView";

export default function ActivityPage() {
  return (
    <Suspense fallback={<StateView variant="loading" title="Loading activity…" />}>
      <ActivityClient />
    </Suspense>
  );
}
