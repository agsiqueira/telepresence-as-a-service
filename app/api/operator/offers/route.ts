import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { authorizeApiUser } from "@/lib/current-user";
import { assignWaitingTrips, expireAndReassignOffers } from "@/lib/marketplace";
import { getCurrentOffer } from "@/lib/phase3-services";

export async function GET() {
  const access = await authorizeApiUser(Role.OPERATOR); if (!access.ok) return access.response; const user = access.user;

  const offer = await db.$transaction(async (tx) => {
    await expireAndReassignOffers(tx);
    await assignWaitingTrips(tx);
    return getCurrentOffer(tx, user.id);
  });
  return NextResponse.json({ offer });
}
