import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { authorizeApiUser } from "@/lib/current-user";
import { retryUnavailableTrip } from "@/lib/trip-lifecycle";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeApiUser(Role.VIEWER); if (!access.ok) return access.response; const user = access.user;
  const result = await retryUnavailableTrip(db, user.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trip: result.value.trip }, { status: 201 });
}
