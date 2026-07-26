import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser();
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

  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.viewerId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const feedback = await db.feedback.create({
    data: {
      tripId,
      viewerId: user.id,
      presence: presence as number,
      mediaQuality: mediaQuality as number,
      moodBefore: moodBefore ?? null,
      moodAfter: moodAfter ?? null,
    },
  });

  return NextResponse.json({ feedback }, { status: 201 });
}
