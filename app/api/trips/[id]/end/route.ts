import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { endAcceptedTrip } from "@/lib/phase3-services";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireCurrentUser();
  const result = await endAcceptedTrip(db, user.id, user.role, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trip: result.value });
}
