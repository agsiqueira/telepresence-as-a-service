import type { ReactNode } from "react";
import { requireExplorerPage } from "@/lib/page-auth";
import { ContextShell } from "@/components/ui/AppShell";

export default async function ViewerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireExplorerPage();
  const items=[{label:"Discover",href:"/viewer",exact:true},{label:"Journeys",href:"/viewer/journeys"},{label:"Requests",href:"/viewer/requests"},{label:"Account",href:"/viewer/account"}];
  return <ContextShell context="Explorer" navigationLabel="Explorer primary navigation" items={items} persistentMobileNavigation>{children}</ContextShell>;
}
