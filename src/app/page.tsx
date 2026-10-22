import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { FeatureCards } from "@/components/landing/feature-cards";
import { Hero } from "@/components/landing/hero";
import { Container } from "@/components/layout/container";

export default function HomePage() {
  return (
    <Container className="pb-16 sm:pb-24">
      <Hero />
      <div className="space-y-20 sm:space-y-24">
        <FeatureCards />
        <DashboardPreview />
      </div>
    </Container>
  );
}
