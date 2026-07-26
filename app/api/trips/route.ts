import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

const ACTIVE_STATUSES: TripStatus[] = [
  TripStatus.REQUESTED,
  TripStatus.ACCEPTED,
];

export async function GET(req: NextRequest) {
  const user = await requireCurrentUser();
  const { searchParams } = new URL(req.url);

  if (searchParams.get("mine")) {
    const trip = await db.trip.findFirst({
      where: {
        status: { in: ACTIVE_STATUSES },
        OR: [{ viewerId: user.id }, { operatorId: user.id }],
      },
      orderBy: { requestedAt: "desc" },
    });
    return NextResponse.json({ trip });
  }

  const status = (searchParams.get("status") ?? "REQUESTED") as TripStatus;
  const trips = await db.trip.findMany({
    where: { status },
    orderBy: { requestedAt: "asc" },
  });
  return NextResponse.json({ trips });
}

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser();
  const body = await req.json();
  const { destination, lat, lng } = body as {
    destination?: string;
    lat?: number;
    lng?: number;
  };

  if (!destination || typeof destination !== "string") {
    return NextResponse.json(
      { error: "destination is required" },
      { status: 400 }
    );
  }

  const existing = await db.trip.findFirst({
    where: { viewerId: user.id, status: { in: ACTIVE_STATUSES } },
  });
  if (existing) {
    return NextResponse.json({ trip: existing });
  }

  const trip = await db.trip.create({
    data: {
      viewerId: user.id,
      destination,
      lat: lat ?? null,
      lng: lng ?? null,
      livekitRoom: `trip-${randomUUID()}`,
    },
  });

  return NextResponse.json({ trip }, { status: 201 });
}
