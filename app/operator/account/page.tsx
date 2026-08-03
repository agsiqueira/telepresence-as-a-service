import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
import ProfileSettings from "@/components/ProfileSettings";
import TeleporterAccountOverview from "@/components/operator/TeleporterAccountOverview";
import { ActionLink, PageHeader, Surface } from "@/components/ui/primitives";

export default function AccountPage() {
  return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10"><PageHeader eyebrow="Teleporter" title="Account" description="Manage your Teleporter identity, review participation readiness, and access account support." /><div className="mt-6"><AccountSafetyRestrictionNotice /></div><TeleporterAccountOverview /><ProfileSettings role="operator" heading="Public profile" description="Your display name is the public identity used for Teleporter participation. Service capabilities are managed separately on Home." /><Surface className="mt-6"><h2 className="text-heading-2">Safety support</h2><p className="mt-2 break-words text-body-sm text-ink-secondary">Open private Safety-support conversations with authorized Safety administrators. Journey-specific Safety reporting remains part of the relevant Journey workflow.</p><ActionLink href="/safety-support" variant="secondary" className="mt-4">Open Safety support</ActionLink></Surface><Surface className="mt-6"><h2 className="text-heading-2">Sign-in and sign-out</h2><p className="mt-2 text-body-sm text-ink-secondary">Your sign-in identity and sign-out action are managed by the account control in the global header.</p></Surface></main>;
}
