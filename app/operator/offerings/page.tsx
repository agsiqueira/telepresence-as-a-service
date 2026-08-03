import GuidedExperienceManager from "@/components/GuidedExperienceManager";
import LiveMomentManager from "@/components/LiveMomentManager";
import { PageHeader } from "@/components/ui/primitives";

export default function OfferingsPage() {
  return <main className="mx-auto max-w-participant px-4 py-10 sm:px-6"><PageHeader eyebrow="Teleporter" title="Offerings" description="Create and manage Live Moments and Guided Experiences using your existing service capabilities." /><LiveMomentManager /><GuidedExperienceManager /></main>;
}
