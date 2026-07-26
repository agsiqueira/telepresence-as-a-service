import { NextRequest, NextResponse } from "next/server";
import { Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireRole(Role.OPERATOR);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
