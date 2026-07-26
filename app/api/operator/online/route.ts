import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCurrentUser } from "@/lib/current-user";

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser();
  const body = await req.json();
  const online = Boolean(body?.online);

  const updated = await db.user.update({
    where: { id: user.id },
    data: { online, role: Role.OPERATOR },
  });

  return NextResponse.json({ user: updated });
}
