import { NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { deactivatedAccountApiResponse, getCurrentUser } from "@/lib/current-user";

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
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    const inactive = deactivatedAccountApiResponse(user); if (inactive) return inactive;
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
  } catch (error) {
    console.error("Current visit request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Current visit is temporarily unavailable" }, { status: 503 });
  }
}
