import "server-only";

import { Role, type User } from "@prisma/client";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";

export async function requirePageRole(requiredRole: Role): Promise<User> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.role === requiredRole) {
    return user;
  }

  redirect(user.role === Role.VIEWER ? "/viewer" : "/operator");
}
