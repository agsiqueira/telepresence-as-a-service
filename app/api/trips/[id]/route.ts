import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireCurrentUser();
  const trip = await db.trip.findUnique({ where: { id: params.id } });
  const isViewer = user.role === Role.VIEWER && trip?.viewerId === user.id;
  const isOperator =
    user.role === Role.OPERATOR && trip?.operatorId === user.id;

  if (!trip || (!isViewer && !isOperator)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ trip });
}
