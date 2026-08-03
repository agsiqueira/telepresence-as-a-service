import type { ReactNode } from "react";
import { requireTeleporterPage } from "@/lib/page-auth";
import { ContextShell } from "@/components/ui/AppShell";

export default async function OperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireTeleporterPage();
  return <ContextShell context="Teleporter" navigationLabel="Teleporter" items={[{label:"Explore",href:"/viewer"},{label:"Teleport",href:"/operator",exact:true},{label:"Requests",href:"/operator/opportunities"}]}>{children}</ContextShell>;
}
