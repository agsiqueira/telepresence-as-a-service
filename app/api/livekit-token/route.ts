import { NextRequest, NextResponse } from "next/server";
import { TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { mintLiveKitToken } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser();
  const body = await req.json();
  const { tripId } = body as { tripId?: string };

  if (!tripId) {
    return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  }

  const trip = await db.trip.findUnique({ where: { id: tripId } });

  if (!trip || (trip.viewerId !== user.id && trip.operatorId !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (trip.status !== TripStatus.ACCEPTED) {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  const canPublish = trip.operatorId === user.id;

  const token = await mintLiveKitToken({
    room: trip.livekitRoom,
    identity: user.id,
    name: user.name ?? undefined,
    canPublish,
  });

  return NextResponse.json({
    token,
    url: process.env.LIVEKIT_URL,
    room: trip.livekitRoom,
  });
}
