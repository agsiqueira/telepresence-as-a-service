import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { getOwnedJourneyRequest } from "@/lib/journey-requests";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  if (!params.id || params.id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const request = await getOwnedJourneyRequest(db, access.user.id, params.id);
  return request ? NextResponse.json({ request }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
