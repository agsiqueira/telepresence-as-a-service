import { NextRequest, NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { assignWaitingTrips, expireAndReassignOffers } from "@/lib/marketplace";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireCurrentUser();
  let trip = await db.trip.findUnique({ where: { id: params.id } });
  const isViewer = user.role === Role.VIEWER && trip?.viewerId === user.id;
  const isOperator =
    user.role === Role.OPERATOR && trip?.operatorId === user.id;

  if (!trip || (!isViewer && !isOperator)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (isViewer && (trip.status === TripStatus.REQUESTED || trip.status === TripStatus.OFFERED)) {
    await db.$transaction(async (tx) => {
      await expireAndReassignOffers(tx);
      await assignWaitingTrips(tx);
    });
    trip = await db.trip.findUnique({ where: { id: params.id } });
    if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    trip: {
      id: trip.id,
      destination: trip.destination,
      meetingArea: trip.meetingArea,
      requestedDuration: trip.requestedDuration,
      preferredLanguage: trip.preferredLanguage,
      accessibilityNeeds: trip.accessibilityNeeds,
      status: trip.status,
      requestedAt: trip.requestedAt,
      acceptedAt: trip.acceptedAt,
      offeredAt: trip.offeredAt,
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      cancelledAt: trip.cancelledAt,
      noOperatorAvailableAt: trip.noOperatorAvailableAt,
      feedbackCompletedAt: trip.feedbackCompletedAt,
      feedbackSkippedAt: trip.feedbackSkippedAt,
      hasOffer: Boolean(trip.offeredOperatorId && trip.offerExpiresAt),
    },
  });
}
