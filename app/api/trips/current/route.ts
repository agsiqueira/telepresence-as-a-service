import { NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

const ACTIVE = [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS];
const SELECT = {
  id: true,
  destination: true,
  status: true,
  acceptedAt: true,
  startedAt: true,
  offeredOperatorId: true,
  offerExpiresAt: true,
} as const;

export async function GET() {
  const user = await requireCurrentUser();
  const trip = await db.trip.findFirst({
    where: user.role === Role.VIEWER
      ? { viewerId: user.id, status: { in: ACTIVE } }
      : { operatorId: user.id, status: { in: [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS] } },
    orderBy: { requestedAt: "desc" },
    select: SELECT,
  });
  return NextResponse.json({
    trip: trip ? {
      id: trip.id,
      destination: trip.destination,
      status: trip.status,
      acceptedAt: trip.acceptedAt,
      startedAt: trip.startedAt,
      hasOffer: Boolean(trip.offeredOperatorId && trip.offerExpiresAt),
    } : null,
  });
}
