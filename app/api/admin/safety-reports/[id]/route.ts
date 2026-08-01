import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { AdminSafetyReportError, getSafetyReportForAdmin } from "@/lib/admin-safety-reports";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const access = await authorizeAdminApi(); if (!access.ok) return access.response;
  try { return NextResponse.json({ report: await getSafetyReportForAdmin(db, access.user.id, params.id) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof AdminSafetyReportError) return NextResponse.json({ error: "Safety report not found" }, { status: error.status });
    return NextResponse.json({ error: "Safety report could not be loaded" }, { status: 500 });
  }
}
