import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeTeleporterActivityApi } from "@/lib/current-user";
import { evaluateOperatorReadiness } from "@/lib/profiles";

export async function POST(req: NextRequest) {
 try {
  const access = await authorizeTeleporterActivityApi(); if (!access.ok) return access.response; const user = access.user;

  const body = await req.json();
  if (!body || typeof body !== "object" || Object.keys(body).some(key => key !== "online") || typeof body.online !== "boolean") return NextResponse.json({ error: "Online status is required" }, { status: 400 });
  const online = body.online;

  const availability = await db.user.findUnique({
    where: { id: user.id },
    select: { pendingOfferTripId: true, activeTripId: true },
  });
  if (availability?.pendingOfferTripId || availability?.activeTripId) {
    return NextResponse.json(
      { error: "Availability cannot change during an offer or active visit" },
      { status: 409 }
    );
  }

  if (online) {
    const readiness = await evaluateOperatorReadiness(db, user.id);
    if (!readiness.eligible) return NextResponse.json({ error: readiness.message, reason: readiness.code }, { status: 409 });
  }

  const updated = await db.user.updateMany({
    where: {
      id: user.id,
      pendingOfferTripId: null,
      activeTripId: null,
    },
    data: { online },
  });
  if (updated.count !== 1) {
    return NextResponse.json(
      { error: "Availability cannot change during an offer or active visit" },
      { status: 409 }
    );
  }

  return NextResponse.json({ online });
 } catch (error) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  console.error("Operator availability update failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Availability could not be updated" }, { status: 500 });
 }
}
