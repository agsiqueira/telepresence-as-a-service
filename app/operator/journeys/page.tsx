import TeleporterAgreements from "@/components/TeleporterAgreements";
import { PageHeader } from "@/components/ui/primitives";

export default function JourneysPage() {
  return <main className="mx-auto max-w-participant px-4 py-10 sm:px-6"><PageHeader eyebrow="Teleporter" title="Journeys" description="Review confirmed Journey obligations, fulfillment details, and available scheduling actions." /><TeleporterAgreements /></main>;
}
