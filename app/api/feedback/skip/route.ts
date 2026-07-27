import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { completeViewerFeedback } from "@/lib/trip-lifecycle";

export async function POST(req: NextRequest) {
  const user = await requireRole(Role.VIEWER);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { tripId } = await req.json() as { tripId?: string };
  if (!tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  const result = await completeViewerFeedback(db, user.id, tripId, null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ completed: true, skipped: true });
}
