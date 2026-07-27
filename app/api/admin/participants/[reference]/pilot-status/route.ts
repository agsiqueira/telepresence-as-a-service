import { NextRequest, NextResponse } from "next/server";
import { OperatorPilotStatus } from "@prisma/client";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { setOperatorPilotStatus } from "@/lib/profiles";

export async function PATCH(req: NextRequest, { params }: { params: { reference: string } }) {
  try {
    const auth = await authorizeAdminApi();
    if (!auth.ok) return auth.response;
    const body = await req.json();
    if (!body || typeof body !== "object" || Object.keys(body).some(key => !["pilotStatus", "expectedStatus"].includes(key)) || !Object.values(OperatorPilotStatus).includes(body.pilotStatus) || !Object.values(OperatorPilotStatus).includes(body.expectedStatus)) return NextResponse.json({ error: "Check the pilot status change" }, { status: 400 });
    const result = await setOperatorPilotStatus(db, params.reference, body.pilotStatus, body.expectedStatus);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ operator: result.value });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("Admin pilot status update failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Pilot status could not be updated" }, { status: 500 });
  }
}
