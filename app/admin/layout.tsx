import type { ReactNode } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/lib/page-auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageRole(Role.ADMIN);
  return <div className="min-h-screen bg-gray-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4"><span className="font-bold text-spartan-green">VirtualTrip pilot admin</span><nav aria-label="Administrator"><ul className="flex flex-wrap gap-2"><li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/admin/participants">Participants</Link></li><li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/admin/destinations">Destinations</Link></li><li><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href="/admin/operator-applications">Operator applications</Link></li></ul></nav></div></header>{children}</div>;
}
