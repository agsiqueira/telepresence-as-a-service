import type { ReactNode } from "react";
import Link from "next/link";
import { requireExplorerPage } from "@/lib/page-auth";
import { hasTeleporterCapability } from "@/lib/capabilities";

export default async function ViewerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireExplorerPage();
  return <div className="min-h-screen bg-gray-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4"><span className="font-bold text-spartan-green">Unfar Explorer</span><nav aria-label="Explorer"><ul className="flex flex-wrap gap-2"><li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/viewer">Explore</Link></li>{user.operatorProfile && <li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/operator">{hasTeleporterCapability(user) ? "Teleport" : "Teleporter setup"}</Link></li>}<li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/viewer/operator-application">Teleporter application</Link></li></ul></nav></div></header>{children}</div>;
}
