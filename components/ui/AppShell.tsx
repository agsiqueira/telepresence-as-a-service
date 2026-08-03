import type { ReactNode } from "react";
import Link from "next/link";
import PrimaryNavigation, { type NavigationItem } from "@/components/ui/PrimaryNavigation";

export function ContextShell({ context, navigationLabel, items, children, width = "participant" }: { context: string; navigationLabel: string; items: NavigationItem[]; children: ReactNode; width?: "participant" | "operational" }) {
  return <div className="unfar-page-canvas"><header className="border-b border-line bg-surface"><div className={`mx-auto flex min-h-16 items-center justify-between gap-4 px-4 py-3 sm:px-6 ${width === "operational" ? "max-w-operational" : "max-w-participant"}`}><div><Link href="/" className="text-heading-3 text-brand">Unfar</Link><p className="text-caption text-ink-muted">{context}</p></div><PrimaryNavigation label={navigationLabel} items={items} /></div></header>{children}</div>;
}
