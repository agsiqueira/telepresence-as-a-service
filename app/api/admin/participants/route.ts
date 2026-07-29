import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { listAdminParticipants, parseParticipantQuery } from "@/lib/admin";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAdminApi();
    if (!auth.ok) return auth.response;
    const input = parseParticipantQuery(req.nextUrl.searchParams);
    if (!input) return NextResponse.json({ error: "Check participant filters" }, { status: 400 });
    const participants = await listAdminParticipants(db, input, auth.user.id);
    return NextResponse.json({ participants, limit: input.limit, page: input.page, hasNext: participants.length === input.limit });
  } catch (error) {
    console.error("Admin participant listing failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Participants are temporarily unavailable" }, { status: 500 });
  }
}
