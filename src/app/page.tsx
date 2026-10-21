import Hero from "@/components/home/Hero";
import DripDivider from "@/components/home/DripDivider";
import FlavoursShowcase from "@/components/home/FlavoursShowcase";
import AboutSection from "@/components/home/AboutSection";
import ReviewsSection from "@/components/home/ReviewsSection";
import BranchDirectory from "@/components/locations/BranchDirectory";
import ContactSection from "@/components/home/ContactSection";

export default function HomePage() {
  return (
    <>
      <Hero />
      <DripDivider />
      <FlavoursShowcase />
      <AboutSection />
      <ReviewsSection />
      <BranchDirectory />
      <ContactSection />
    </>
  );
}
