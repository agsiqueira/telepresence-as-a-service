import type { ReactNode } from "react";
import { requireExplorerPage } from "@/lib/page-auth";
import { hasTeleporterCapability } from "@/lib/capabilities";
import { ContextShell } from "@/components/ui/AppShell";

export default async function ViewerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireExplorerPage();
  const items=[{label:"Explore",href:"/viewer",exact:true},{label:"Journey Requests",href:"/viewer/requests"},...(user.operatorProfile?[{label:hasTeleporterCapability(user)?"Teleport":"Teleporter setup",href:"/operator"}]:[]),{label:"Teleporter application",href:"/viewer/operator-application"}];
  return <ContextShell context="Explorer" navigationLabel="Explorer" items={items}>{children}</ContextShell>;
}
