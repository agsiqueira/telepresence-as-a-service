import Link from "next/link";
import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
import ProfileSettings from "@/components/ProfileSettings";
import { PageHeader, Surface } from "@/components/ui/primitives";

export default function AccountPage() {
  return <main className="mx-auto max-w-participant px-4 py-10 sm:px-6"><PageHeader eyebrow="Teleporter" title="Account" description="Manage the public profile information used for your Teleporter participation and find account support." /><div className="mt-8"><AccountSafetyRestrictionNotice /></div><ProfileSettings role="operator" /><Surface className="mt-8"><h2 className="text-heading-2">Safety support</h2><p className="mt-2 text-body-sm text-ink-secondary">Open your private safety-support conversations with authorized safety administrators.</p><Link href="/safety-support" className="mt-4 inline-flex min-h-control items-center text-label text-link underline underline-offset-4">Open Safety support</Link></Surface></main>;
}
