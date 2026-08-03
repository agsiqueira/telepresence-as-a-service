import ProfileSettings from "@/components/ProfileSettings";
import { ActionLink, PageHeader, Surface } from "@/components/ui/primitives";
import { hasTeleporterCapability } from "@/lib/capabilities";
import { requireExplorerPage } from "@/lib/page-auth";

export default async function ExplorerAccountPage() {
  const user = await requireExplorerPage();
  return <main className="mx-auto max-w-participant px-4 py-10 sm:px-6">
    <PageHeader eyebrow="Explorer" title="Account" description="Manage your Explorer profile and open existing account or support services." />
    <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <ProfileSettings role="viewer" />
      <Surface className="h-fit">
        <h2 className="text-heading-3">Account and support</h2>
        <div className="mt-4 grid gap-3">
          <ActionLink variant="secondary" href="/safety-support">Open safety support</ActionLink>
          <ActionLink variant="secondary" href="/viewer/operator-application">Teleporter application</ActionLink>
          {user.operatorProfile && <ActionLink variant="secondary" href="/operator">{hasTeleporterCapability(user) ? "Open Teleporter tools" : "Open Teleporter setup"}</ActionLink>}
        </div>
      </Surface>
    </div>
  </main>;
}
