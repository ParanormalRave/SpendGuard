import { LandingHeader } from "@/components/shell/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { CtaBand } from "@/components/landing/CtaBand";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <CtaBand />
      </main>
      <LandingFooter />
    </div>
  );
}
