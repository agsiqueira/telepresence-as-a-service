import { NextRequest, NextResponse } from "next/server";
import { TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireCurrentUser();
  const trip = await db.trip.findUnique({ where: { id: params.id } });

  if (!trip || (trip.viewerId !== user.id && trip.operatorId !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.trip.update({
    where: { id: params.id },
    data: { status: TripStatus.ENDED, endedAt: new Date() },
  });

  return NextResponse.json({ trip: updated });
}
