import "server-only";

import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";

export async function authorizeAdminApi() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthenticated" }, { status: 401 }) };
  if (user.role !== Role.ADMIN) return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const, user };
}
