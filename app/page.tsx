import { SignInButton } from "@clerk/nextjs";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser, isAccountDeactivated } from "@/lib/current-user";
import { buttonClassName, PageHeader, Surface } from "@/components/ui/primitives";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    if (isAccountDeactivated(user)) redirect("/account-deactivated");
    if (user.role === Role.ADMIN) redirect("/admin/participants");
    redirect("/viewer");
  }

  return (
    <main className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-participant place-items-center px-4 py-12 sm:px-6">
      <Surface className="w-full max-w-2xl border-line-strong bg-surface-raised text-center shadow-md sm:p-10">
      <PageHeader eyebrow="Live, human-guided Journeys" title="Meaningful places, brought within reach" description="Explore a real place through a live video Journey with a Teleporter who can share the experience with you." className="items-center text-center sm:block" />
      <p className="mx-auto mt-6 max-w-prose text-body-sm text-ink-muted">Discover available experiences or request a Journey after signing in.</p>
      <SignInButton mode="modal">
        <button className={buttonClassName("primary", "mt-8 min-h-control-lg px-6")}>Sign in to get started</button>
      </SignInButton>
      </Surface>
    </main>
  );
}
