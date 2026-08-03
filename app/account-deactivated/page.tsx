import { SignOutButton } from "@clerk/nextjs";
import { AccountStatus, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { buttonClassName, Notice, PageHeader, Surface } from "@/components/ui/primitives";

export default async function AccountDeactivatedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accountStatus === AccountStatus.ACTIVE) {
    if (user.role === Role.ADMIN) redirect("/admin/participants");
    redirect("/viewer");
  }
  return <main className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-participant place-items-center px-4 py-12 sm:px-6"><Surface className="w-full max-w-xl"><PageHeader eyebrow="Account access" title="Account access deactivated" description="Your Unfar application access has been deactivated. Your sign-in identity has not been deleted or disabled."/><Notice variant="warning" className="mt-6">Contact an administrator if you believe access should be restored.</Notice><SignOutButton redirectUrl="/"><button className={buttonClassName("secondary","mt-8")}>Sign out</button></SignOutButton></Surface></main>;
}
