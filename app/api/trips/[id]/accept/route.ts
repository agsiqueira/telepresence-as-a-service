import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { acceptTripOffer } from "@/lib/phase3-services";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireRole(Role.OPERATOR);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await acceptTripOffer(db, user.id, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ trip: { id: result.value.id, destination: result.value.destination, status: result.value.status, acceptedAt: result.value.acceptedAt } });
}
