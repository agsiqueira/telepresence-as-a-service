import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { listActiveDestinations } from "@/lib/phase3-services";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const destinations = await listActiveDestinations(db);
  return NextResponse.json({ destinations });
}
