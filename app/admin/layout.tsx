import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { requirePageRole } from "@/lib/page-auth";
import { ContextShell } from "@/components/ui/AppShell";

const items=[{label:"Participants",href:"/admin/participants"},{label:"Destinations",href:"/admin/destinations"},{label:"Teleporter applications",href:"/admin/operator-applications"},{label:"Journey Requests",href:"/admin/journey-requests"},{label:"Proposals",href:"/admin/proposals"},{label:"Agreements",href:"/admin/agreements"},{label:"Safety Reports",href:"/admin/safety-reports"}];
export default async function AdminLayout({children}:{children:ReactNode}){await requirePageRole(Role.ADMIN);return <ContextShell context="Administration" navigationLabel="Administrator" items={items} width="operational">{children}</ContextShell>}
