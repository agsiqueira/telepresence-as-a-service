import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { listAdminProposals } from "@/lib/proposals";
export async function GET() { const access = await authorizeAdminApi(); if (!access.ok) return access.response; return NextResponse.json({ proposals: await listAdminProposals(db) }, { headers: { "Cache-Control": "no-store" } }); }
