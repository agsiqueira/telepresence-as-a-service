import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi, enforceAccountSafetyForActivity } from "@/lib/current-user";
import { createJourneyRequest, listOwnedJourneyRequests, validateJourneyRequestInput } from "@/lib/journey-requests";

export async function GET() {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  return NextResponse.json({ requests: await listOwnedJourneyRequests(db, access.user.id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  const restricted = await enforceAccountSafetyForActivity(access.user.id); if (restricted) return restricted;
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    const input = validateJourneyRequestInput(body as Record<string, unknown>);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const result = await createJourneyRequest(db, access.user.id, input.value);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ request: result.value }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("Journey Request creation failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Journey Request could not be created" }, { status: 500 });
  }
}
