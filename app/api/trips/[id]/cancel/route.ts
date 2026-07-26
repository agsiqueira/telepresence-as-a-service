import { NextRequest, NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireRole(Role.VIEWER);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const trip = await db.trip.findUnique({ where: { id: params.id } });
  if (!trip || trip.viewerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cancellableStatuses: TripStatus[] = [
    TripStatus.REQUESTED,
    TripStatus.ACCEPTED,
  ];
  if (!cancellableStatuses.includes(trip.status)) {
    return NextResponse.json(
      { error: "Trip cannot be cancelled" },
      { status: 409 }
    );
  }

  const result = await db.trip.updateMany({
    where: {
      id: params.id,
      viewerId: user.id,
      status: { in: cancellableStatuses },
    },
    data: { status: TripStatus.CANCELLED },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Trip cannot be cancelled" },
      { status: 409 }
    );
  }

  const updated = await db.trip.findUnique({ where: { id: params.id } });
  return NextResponse.json({ trip: updated });
}
