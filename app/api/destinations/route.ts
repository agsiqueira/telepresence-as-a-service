import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { listActiveDestinations } from "@/lib/phase3-services";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    const destinations = await listActiveDestinations(db);
    return NextResponse.json({ destinations });
  } catch (error) {
    console.error("Destination catalog request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Destination catalog is temporarily unavailable" }, { status: 503 });
  }
}
