import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeApiUser } from "@/lib/current-user";
import { endTrip } from "@/lib/trip-lifecycle";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await authorizeApiUser(); if (!access.ok) return access.response; const user = access.user;
  const result = await endTrip(db, user.id, user.role, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trip: result.value });
}
