import type { ReactNode } from "react";
import Link from "next/link";
import { requireTeleporterPage } from "@/lib/page-auth";

export default async function OperatorLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireTeleporterPage();
  return <div className="min-h-screen bg-gray-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4"><span className="font-bold text-spartan-green">Unfar Teleporter</span><nav aria-label="Capabilities" className="flex gap-2"><Link className="inline-flex min-h-11 items-center rounded-lg px-3" href="/viewer">Explore</Link><Link className="inline-flex min-h-11 items-center rounded-lg px-3" href="/operator">Teleport</Link></nav></div></header>{children}</div>;
}
