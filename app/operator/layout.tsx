import type { ReactNode } from "react";
import { requireTeleporterPage } from "@/lib/page-auth";
import { ContextShell } from "@/components/ui/AppShell";

export default async function OperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireTeleporterPage();
  const items = [
    { label: "Home", href: "/operator", exact: true },
    { label: "Requests", href: "/operator/requests" },
    { label: "Journeys", href: "/operator/journeys" },
    { label: "Offerings", href: "/operator/offerings" },
    { label: "Account", href: "/operator/account" },
  ];
  return <ContextShell context="Teleporter" navigationLabel="Teleporter primary navigation" items={items} persistentMobileNavigation secondaryLink={{ label: "Open Explorer", href: "/viewer" }}>{children}</ContextShell>;
}
