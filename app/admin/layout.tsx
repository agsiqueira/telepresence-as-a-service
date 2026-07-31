import type { ReactNode } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/lib/page-auth";

const links=[["Participants","/admin/participants"],["Destinations","/admin/destinations"],["Operator applications","/admin/operator-applications"],["Journey Requests","/admin/journey-requests"],["Proposals","/admin/proposals"],["Agreements","/admin/agreements"]] as const;
export default async function AdminLayout({children}:{children:ReactNode}){await requirePageRole(Role.ADMIN);return <div className="min-h-screen bg-gray-50"><header className="border-b bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4"><span className="font-bold text-spartan-green">VirtualTrip pilot admin</span><nav aria-label="Administrator"><ul className="flex flex-wrap gap-2">{links.map(([label,href])=><li key={href}><Link className="inline-flex min-h-11 items-center rounded-lg px-3 focus-visible:ring-2" href={href}>{label}</Link></li>)}</ul></nav></div></header>{children}</div>}
