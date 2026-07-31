import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi, authorizeTeleporterActivityApi } from "@/lib/current-user";
import { listOperatorHistory, listViewerHistory } from "@/lib/trip-lifecycle";

export async function GET(req: NextRequest) {
  try {
    const teleporterView = new URL(req.url).searchParams.get("as") === "teleporter";
    const access = teleporterView ? await authorizeTeleporterActivityApi() : await authorizeExplorerApi();
    if (!access.ok) return access.response; const user = access.user;
    const requested = Number(new URL(req.url).searchParams.get("limit") ?? 25);
    const limit = Number.isInteger(requested) ? Math.max(1, Math.min(requested, 50)) : 25;
    const history = teleporterView ? await listOperatorHistory(db, user.id, limit) : await listViewerHistory(db, user.id, limit);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Visit history request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Visit history is temporarily unavailable" }, { status: 503 });
  }
}
