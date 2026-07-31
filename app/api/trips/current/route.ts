import { NextResponse } from "next/server";
import { TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { canAccessTeleporterObligation, hasTeleporterCapability } from "@/lib/capabilities";

const ACTIVE = [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS];
const SELECT = {
  id: true,
  destination: true,
  status: true,
  acceptedAt: true,
  startedAt: true,
  operatorId: true,
  offeredOperatorId: true,
  offerExpiresAt: true,
} as const;

export async function GET(req: Request) {
  try {
    const access = await authorizeExplorerApi(); if (!access.ok) return access.response; const user = access.user;
    const teleporterView = new URL(req.url).searchParams.get("as") === "teleporter";
    const confirmationReady = { OR: [{ status: TripStatus.IN_PROGRESS }, { status: TripStatus.ACCEPTED, agreement: { is: null } }, { status: TripStatus.ACCEPTED, agreement: { is: { agreedEarliestStart: { lte: new Date() } } } }] };
    const trip = await db.trip.findFirst({
      where: teleporterView
        ? { operatorId: user.id, AND: [confirmationReady] }
        : { viewerId: user.id, AND: [{ status: { in: ACTIVE } }, { OR: [{ status: { in: [TripStatus.REQUESTED, TripStatus.OFFERED, TripStatus.IN_PROGRESS] } }, { status: TripStatus.ACCEPTED, agreement: { is: null } }, { status: TripStatus.ACCEPTED, agreement: { is: { agreedEarliestStart: { lte: new Date() } } } }] }] },
      orderBy: { requestedAt: "desc" },
      select: SELECT,
    });
    if (teleporterView && !hasTeleporterCapability(user) && !canAccessTeleporterObligation(user, trip)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
