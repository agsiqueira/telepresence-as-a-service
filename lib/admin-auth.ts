import "server-only";

import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/current-user";

export async function authorizeAdminApi() {
  const access = await authorizeApiUser();
  if (!access.ok) return access;
  if (access.user.role !== Role.ADMIN) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return access;
}
