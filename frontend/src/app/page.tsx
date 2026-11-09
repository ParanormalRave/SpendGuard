import { BackgroundGrid } from "@/components/landing-hero/BackgroundGrid";
import { HeroContent } from "@/components/landing-hero/HeroContent";
import { LandingNav } from "@/components/landing-hero/LandingNav";
import { LedgerPanel } from "@/components/landing-hero/LedgerPanel";
import { Ring } from "@/components/landing-hero/Ring";
import { StatsBar } from "@/components/landing-hero/StatsBar";
import { RiskSection } from "@/components/landing/RiskSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { SiteFooter } from "@/components/landing/SiteFooter";

function Divider() {
  return <div aria-hidden="true" className="h-px w-full bg-[#162231]" />;
}

export default function Home() {
  return (
    <div className="landing-hero flex min-h-screen flex-col bg-[#0A111B]">
      {/* Hero — min 920px, hero background + grid + ring */}
      <div className="relative flex min-h-[920px] flex-col overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 78%, #12405A 0%, #0E2236 38%, #0A111B 75%)",
          }}
        />
        <BackgroundGrid />
        <Ring />

        <div className="relative flex min-h-[920px] w-full flex-col">
          <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col">
            <LandingNav />
            <main className="flex flex-1 flex-col">
              <HeroContent />
              <div className="mt-auto pt-6">
                <LedgerPanel />
              </div>
            </main>
          </div>
          <StatsBar />
        </div>
      </div>

      <Divider />
      <RiskSection />

      <Divider />
      <HowItWorksSection />

      <Divider />
      <CtaSection />

      <SiteFooter />
    </div>
  );
}
