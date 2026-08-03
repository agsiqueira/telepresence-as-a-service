import GuidedExperienceManager from "@/components/GuidedExperienceManager";
import LiveMomentManager from "@/components/LiveMomentManager";
import { PageHeader } from "@/components/ui/primitives";

export default function OfferingsPage() {
  return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10"><PageHeader eyebrow="Teleporter" title="Offerings" description="Create and manage time-bounded Live Moments and reusable Guided Experiences with explicit one-time occurrences." /><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-line bg-surface p-4"><h2 className="text-heading-3">Live Moment</h2><p className="mt-1 text-body-sm text-ink-secondary">One time-bounded availability window with bookable capacity.</p></div><div className="rounded-lg border border-line bg-surface p-4"><h2 className="text-heading-3">Guided Experience</h2><p className="mt-1 text-body-sm text-ink-secondary">A reusable listing with explicit one-time occurrences.</p></div></div><LiveMomentManager /><GuidedExperienceManager /></main>;
}
