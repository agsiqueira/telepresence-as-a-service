import { NextResponse } from "next/server";
import { getCurrentPersistedUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { getEffectiveAccountSafetyRestriction } from "@/lib/safety-restrictions";

export async function GET() {
  const user = await getCurrentPersistedUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const restriction = await getEffectiveAccountSafetyRestriction(db, user.id);
  return NextResponse.json({ restriction }, { headers: { "Cache-Control": "no-store" } });
}
