import { SignInButton } from "@clerk/nextjs";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    if (user.role === Role.VIEWER) redirect("/viewer");
    if (user.role === Role.OPERATOR) redirect("/operator");
    redirect("/admin/participants");
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-3xl font-bold text-spartan-green mb-4">
        VirtualTrip
      </h1>
      <p className="text-gray-600 mb-10">
        A livestreamed visit to a real place, from a phone in someone&apos;s
        hand to yours.
      </p>

      <SignInButton mode="modal">
        <button className="bg-spartan-green text-white px-6 py-3 rounded-md font-medium">
          Sign in to get started
        </button>
      </SignInButton>
    </div>
  );
}
