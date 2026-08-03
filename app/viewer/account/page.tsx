import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
import ExplorerProfileSettings from "@/components/explorer/ExplorerProfileSettings";
import { ActionLink, MetadataList, Notice, PageHeader, StatusBadge, Surface } from "@/components/ui/primitives";
import { hasTeleporterCapability } from "@/lib/capabilities";
import { requireExplorerPage } from "@/lib/page-auth";

export default async function ExplorerAccountPage() {
  const user = await requireExplorerPage();
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
    <PageHeader eyebrow="Explorer" title="Account" description="Manage the profile details stored by Unfar, understand your current access, and open existing account services." />
    <div className="mt-6"><AccountSafetyRestrictionNotice /></div>
    <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)] lg:items-start">
      <ExplorerProfileSettings />
      <div className="grid min-w-0 gap-6">
        <Surface>
          <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-heading-2">Account access</h2><StatusBadge variant="success">Active</StatusBadge></div>
          <MetadataList className="mt-5 sm:grid-cols-1" items={[{ term: "Application role", detail: "Explorer" }, { term: "Access status", detail: "Active application access" }]}/>
          <p className="mt-4 text-body-sm text-ink-secondary">Your role and access status are server-managed and cannot be changed from this page. Access changes are synchronized automatically.</p>
        </Surface>
        <Surface>
          <h2 className="text-heading-2">Sign-in identity</h2>
          <Notice className="mt-4" variant="info" title="Managed by the sign-in provider"><p>Your email address, sign-in methods, and sign-out action are managed through the account avatar in the global header. Unfar does not project those identity details into this page.</p></Notice>
        </Surface>
        <Surface>
          <h2 className="text-heading-2">Account services</h2>
          <p className="mt-2 text-body-sm text-ink-secondary">Open the existing services associated with your Explorer account.</p>
          <div className="mt-5 grid gap-3">
            <ActionLink variant="secondary" href="/safety-support" className="w-full">Open Safety support</ActionLink>
            <ActionLink variant="secondary" href="/viewer/operator-application" className="w-full">Teleporter application</ActionLink>
            {user.operatorProfile && <ActionLink variant="secondary" href="/operator" className="w-full">{hasTeleporterCapability(user) ? "Open Teleporter tools" : "Open Teleporter setup"}</ActionLink>}
          </div>
        </Surface>
      </div>
    </div>
  </main>;
}
