import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeTeleporterActivityApi } from "@/lib/current-user";
import { discoverOpenJourneyRequests } from "@/lib/journey-requests";
import { evaluateOperatorReadiness } from "@/lib/profiles";

export async function GET() {
  const access = await authorizeTeleporterActivityApi(); if (!access.ok) return access.response;
  const readiness = await evaluateOperatorReadiness(db, access.user.id);
  if (!readiness.eligible) return NextResponse.json({ error: "Operational Teleporter capability is required" }, { status: 403 });
  return NextResponse.json({ requests: await discoverOpenJourneyRequests(db) }, { headers: { "Cache-Control": "no-store" } });
}
