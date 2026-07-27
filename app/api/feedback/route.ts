import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { completeViewerFeedback } from "@/lib/trip-lifecycle";

export async function POST(req: NextRequest) {
  const user = await requireRole(Role.VIEWER);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { tripId, presence, mediaQuality, moodBefore, moodAfter } = body as {
    tripId?: string;
    presence?: number;
    mediaQuality?: number;
    moodBefore?: number;
    moodAfter?: number;
  };

  if (
    !tripId ||
    !Number.isInteger(presence) ||
    (presence as number) < 1 ||
    (presence as number) > 5 ||
    !Number.isInteger(mediaQuality) ||
    (mediaQuality as number) < 1 ||
    (mediaQuality as number) > 5
  ) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const result = await completeViewerFeedback(db, user.id, tripId, {
    presence: presence as number,
    mediaQuality: mediaQuality as number,
    moodBefore: moodBefore ?? null,
    moodAfter: moodAfter ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ feedback: result.value.feedback }, { status: 201 });
}
