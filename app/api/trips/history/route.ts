import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";
import { listOperatorHistory, listViewerHistory } from "@/lib/trip-lifecycle";

export async function GET(req: NextRequest) {
  const user = await requireCurrentUser();
  const requested = Number(new URL(req.url).searchParams.get("limit") ?? 25);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 50)) : 25;
  const history = user.role === Role.VIEWER
    ? await listViewerHistory(db, user.id, limit)
    : await listOperatorHistory(db, user.id, limit);
  return NextResponse.json({ history });
}
