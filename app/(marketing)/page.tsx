import { HeroSection } from "@/components/landing/hero-section";
import { ToolPreviewSection } from "@/components/landing/tool-preview-section";
import { LandingFooter } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      {/* Main content area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <HeroSection />
        <ToolPreviewSection />
      </main>

      {/* Footer */}
      <LandingFooter />
    </>
  );
}
