import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { withdrawJourneyRequest } from "@/lib/journey-requests";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  if (!params.id || params.id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await withdrawJourneyRequest(db, access.user.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ request: result.value }, { headers: { "Cache-Control": "no-store" } });
}
