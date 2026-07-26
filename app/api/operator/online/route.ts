import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";

export async function POST(req: NextRequest) {
  const user = await requireRole(Role.OPERATOR);
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const online = Boolean(body?.online);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { online },
  });

  return NextResponse.json({ user: updated });
}
