import { ApplicationShell } from "@/components/shell/ApplicationShell";
import { AlertsProvider } from "@/components/alerts/AlertsProvider";
import { AlertBanner } from "@/components/alerts/AlertBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AlertsProvider>
      <ApplicationShell banner={<AlertBanner />}>{children}</ApplicationShell>
    </AlertsProvider>
  );
}
