import TeleporterAgreements from "@/components/TeleporterAgreements";
import { PageHeader } from "@/components/ui/primitives";

export default function JourneysPage() {
  return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10"><PageHeader eyebrow="Teleporter" title="Journeys" description="Review confirmed Journeys, fulfillment details, and pending schedule changes." /><TeleporterAgreements /></main>;
}
