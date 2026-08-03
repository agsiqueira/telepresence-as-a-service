import type { ReactNode } from "react";
import Link from "next/link";
import PrimaryNavigation, { type NavigationItem } from "@/components/ui/PrimaryNavigation";

export function ContextShell({ context, navigationLabel, items, children, width = "participant", persistentMobileNavigation = false }: { context: string; navigationLabel: string; items: NavigationItem[]; children: ReactNode; width?: "participant" | "operational"; persistentMobileNavigation?: boolean }) {
  return <div className={`unfar-page-canvas ${persistentMobileNavigation ? "pb-20 md:pb-0" : ""}`}><header className="border-b border-line bg-surface"><div className={`mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 ${width === "operational" ? "max-w-operational" : "max-w-participant"}`}><div><Link href="/" className="text-heading-3 text-brand">Unfar</Link><p className="text-caption text-ink-muted">{context}</p></div><PrimaryNavigation label={navigationLabel} items={items} persistentMobile={persistentMobileNavigation} /></div></header>{children}</div>;
}
