import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { listAdminJourneyRequests } from "@/lib/journey-requests";

export async function GET() {
  const access = await authorizeAdminApi(); if (!access.ok) return access.response;
  return NextResponse.json({ requests: await listAdminJourneyRequests(db) }, { headers: { "Cache-Control": "no-store" } });
}
