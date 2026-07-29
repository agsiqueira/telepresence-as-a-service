import "server-only";

import { Role, type User } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser, isAccountDeactivated } from "@/lib/current-user";

export async function requirePageRole(requiredRole: Role): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (isAccountDeactivated(user)) {
    redirect("/account-deactivated");
  }

  if (user.role === requiredRole) {
    return user;
  }

  if (user.role === Role.VIEWER) redirect("/viewer");
  if (user.role === Role.OPERATOR) redirect("/operator");
  redirect("/");
}
