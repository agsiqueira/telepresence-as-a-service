import type { ReactNode } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/lib/page-auth";

export default async function ViewerLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePageRole(Role.VIEWER);
  return <div className="min-h-screen bg-gray-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4"><span className="font-bold text-spartan-green">VirtualTrip viewer</span><nav aria-label="Viewer"><ul className="flex flex-wrap gap-2"><li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/viewer">Visits</Link></li><li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/viewer/operator-application">Operator application</Link></li></ul></nav></div></header>{children}</div>;
}
