import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi, enforceAccountSafetyForActivity } from "@/lib/current-user";
import { retryUnavailableTrip } from "@/lib/trip-lifecycle";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response; const user = access.user;
  const restricted = await enforceAccountSafetyForActivity(user.id); if (restricted) return restricted;
  const result = await retryUnavailableTrip(db, user.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trip: result.value.trip }, { status: 201 });
}
