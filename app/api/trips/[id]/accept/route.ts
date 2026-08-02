import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeTeleporterActivityApi, enforceAccountSafetyForActivity } from "@/lib/current-user";
import { acceptTripOffer } from "@/lib/phase3-services";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeTeleporterActivityApi(); if (!access.ok) return access.response; const user = access.user; const restricted = await enforceAccountSafetyForActivity(user.id); if (restricted) return restricted;
  const result = await acceptTripOffer(db, user.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trip: { id: result.value.id, destination: result.value.destination, status: result.value.status, acceptedAt: result.value.acceptedAt } });
}
