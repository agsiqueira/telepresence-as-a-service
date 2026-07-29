import { SignOutButton } from "@clerk/nextjs";
import { AccountStatus, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

export default async function AccountDeactivatedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (user.accountStatus === AccountStatus.ACTIVE) {
    if (user.role === Role.VIEWER) redirect("/viewer");
    if (user.role === Role.OPERATOR) redirect("/operator");
    redirect("/admin/participants");
  }
  return <section className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-3xl font-bold text-gray-950">Account access deactivated</h1><p className="mt-4 text-gray-700">Your VirtualTrip application access has been deactivated. Your sign-in identity has not been deleted or disabled.</p><p className="mt-3 text-gray-700">Contact an administrator if you believe access should be restored.</p><SignOutButton redirectUrl="/"><button className="mt-8 min-h-11 rounded-lg bg-gray-950 px-5 text-white focus-visible:ring-2 focus-visible:ring-offset-2">Sign out</button></SignOutButton></section>;
}
