import { NextRequest, NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { createTripRequest, validateCreateTripInput } from "@/lib/phase3-services";

const ACTIVE_STATUSES: TripStatus[] = [
  TripStatus.REQUESTED,
  TripStatus.OFFERED,
  TripStatus.ACCEPTED,
  TripStatus.IN_PROGRESS,
];

export async function GET(req: NextRequest) {
  const user = await requireRole(Role.OPERATOR);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!new URL(req.url).searchParams.get("mine")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const trip = await db.trip.findFirst({ where: { status: { in: ACTIVE_STATUSES }, operatorId: user.id }, orderBy: { requestedAt: "desc" } });
  return NextResponse.json({ trip });
}

export async function POST(req: NextRequest) {
  const user = await requireRole(Role.VIEWER);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = validateCreateTripInput(await req.json());
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
  const result = await createTripRequest(db, user.id, input.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const trip = result.value.trip;
  return NextResponse.json({ trip: { id: trip.id, destination: trip.destination, status: trip.status, acceptedAt: trip.acceptedAt, hasOffer: Boolean(trip.offeredOperatorId && trip.offerExpiresAt) } }, { status: 201 });
}
