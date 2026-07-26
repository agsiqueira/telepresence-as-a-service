import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/lib/page-auth";

export default async function OperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePageRole(Role.OPERATOR);
  return children;
}
