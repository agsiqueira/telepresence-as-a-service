import { NextRequest, NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireCurrentUser();
  const trip = await db.trip.findUnique({ where: { id: params.id } });
  const isViewer = user.role === Role.VIEWER && trip?.viewerId === user.id;
  const isOperator =
    user.role === Role.OPERATOR && trip?.operatorId === user.id;

  if (!trip || (!isViewer && !isOperator)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (trip.status !== TripStatus.ACCEPTED) {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  const result = await db.trip.updateMany({
    where: { id: params.id, status: TripStatus.ACCEPTED },
    data: { status: TripStatus.ENDED, endedAt: new Date() },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Trip is not active" }, { status: 409 });
  }

  const updated = await db.trip.findUnique({ where: { id: params.id } });

  return NextResponse.json({ trip: updated });
}
