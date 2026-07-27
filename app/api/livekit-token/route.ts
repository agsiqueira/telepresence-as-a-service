import { NextRequest, NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { TrackSource } from "livekit-server-sdk";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { mintLiveKitToken } from "@/lib/livekit";

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser();
  const body = await req.json();
  const { tripId } = body as { tripId?: string };

  if (!tripId) {
    return NextResponse.json({ error: "Visit is required" }, { status: 400 });
  }

  const trip = await db.trip.findUnique({ where: { id: tripId } });
  const isViewer = user.role === Role.VIEWER && trip?.viewerId === user.id;
  const isOperator =
    user.role === Role.OPERATOR && trip?.operatorId === user.id;

  if (!trip || (!isViewer && !isOperator)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (trip.status !== TripStatus.ACCEPTED && trip.status !== TripStatus.IN_PROGRESS) {
    return NextResponse.json({ error: "Visit is not active" }, { status: 409 });
  }

  const canPublishSources = isOperator
    ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
    : [TrackSource.MICROPHONE];

  const token = await mintLiveKitToken({
    room: trip.livekitRoom,
    identity: user.id,
    name: user.name ?? undefined,
    canPublishSources,
  });

  return NextResponse.json({
    token,
    url: process.env.LIVEKIT_URL,
    room: trip.livekitRoom,
  });
}
