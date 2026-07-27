import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { forceOperatorOffline } from "@/lib/profiles";

export async function POST(_req: Request, { params }: { params: { reference: string } }) {
  try {
    const auth = await authorizeAdminApi();
    if (!auth.ok) return auth.response;
    const result = await forceOperatorOffline(db, params.reference);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ operator: result.value });
  } catch (error) {
    console.error("Admin forced-offline update failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Operator availability could not be updated" }, { status: 500 });
  }
}
