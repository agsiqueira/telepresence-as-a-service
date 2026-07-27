import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { profileIsComplete } from "@/lib/marketplace";

export async function POST(req: NextRequest) {
  const user = await requireRole(Role.OPERATOR);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const online = Boolean(body?.online);

  const availability = await db.user.findUnique({
    where: { id: user.id },
    select: { pendingOfferTripId: true, activeTripId: true },
  });
  if (availability?.pendingOfferTripId || availability?.activeTripId) {
    return NextResponse.json(
      { error: "Availability cannot change during an offer or active visit" },
      { status: 409 }
    );
  }

  if (online) {
    const profile = await db.operatorProfile.findUnique({ where: { userId: user.id } });
    const destinationCount = await db.operatorDestination.count({ where: { operatorId: user.id } });
    if (!profileIsComplete(profile, destinationCount, profile?.supportsCustom ?? false)) {
      return NextResponse.json({ error: "Complete your service setup before going online" }, { status: 409 });
    }
  }

  const updated = await db.user.updateMany({
    where: {
      id: user.id,
      pendingOfferTripId: null,
      activeTripId: null,
    },
    data: { online },
  });
  if (updated.count !== 1) {
    return NextResponse.json(
      { error: "Availability cannot change during an offer or active visit" },
      { status: 409 }
    );
  }

  return NextResponse.json({ online });
}
