import { NextRequest, NextResponse } from "next/server";
import { Prisma, Role, TripStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";

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

  const trip = await db.trip.findUnique({ where: { id: tripId } });
  if (!trip || trip.viewerId !== user.id) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (trip.status !== TripStatus.ENDED) {
    return NextResponse.json({ error: "Trip has not ended" }, { status: 409 });
  }

  let feedback;
  try {
    feedback = await db.feedback.create({
      data: {
        tripId,
        viewerId: user.id,
        presence: presence as number,
        mediaQuality: mediaQuality as number,
        moodBefore: moodBefore ?? null,
        moodAfter: moodAfter ?? null,
      },
    });
  } catch (error) {
    const target =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.meta?.target
        : undefined;

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(target) && target.includes("tripId")) {
      return NextResponse.json(
        { error: "Feedback already submitted" },
        { status: 409 }
      );
    }

    throw error;
  }

  return NextResponse.json({ feedback }, { status: 201 });
}
