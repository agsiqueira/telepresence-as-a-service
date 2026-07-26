import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/lib/page-auth";

export default async function ViewerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePageRole(Role.VIEWER);
  return children;
}
