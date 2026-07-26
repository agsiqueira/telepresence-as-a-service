import { NextRequest, NextResponse } from "next/server";
import { TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireCurrentUser();

  const result = await db.trip.updateMany({
    where: { id: params.id, status: TripStatus.REQUESTED },
    data: {
      operatorId: user.id,
      status: TripStatus.ACCEPTED,
      acceptedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { error: "Trip already claimed" },
      { status: 409 }
    );
  }

  const trip = await db.trip.findUnique({ where: { id: params.id } });
  return NextResponse.json({ trip });
}
