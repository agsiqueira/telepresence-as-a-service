import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { assignWaitingTrips, expireAndReassignOffers } from "@/lib/marketplace";
import { getCurrentOffer } from "@/lib/phase3-services";

export async function GET() {
  const user = await requireRole(Role.OPERATOR);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const offer = await db.$transaction(async (tx) => {
    await expireAndReassignOffers(tx);
    await assignWaitingTrips(tx);
    return getCurrentOffer(tx, user.id);
  });
  return NextResponse.json({ offer });
}
