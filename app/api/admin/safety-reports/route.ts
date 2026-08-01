import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { AdminSafetyReportError, listSafetyReportsForAdmin } from "@/lib/admin-safety-reports";

export async function GET(request: NextRequest) {
  const access = await authorizeAdminApi(); if (!access.ok) return access.response;
  try {
    const query = request.nextUrl.searchParams;
    const result = await listSafetyReportsForAdmin(db, access.user.id, { category: query.get("category"), severity: query.get("severity"), cursor: query.get("cursor"), limit: query.get("limit") });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AdminSafetyReportError) return NextResponse.json({ error: error.code === "INVALID_QUERY" ? "Invalid report query" : "Not found" }, { status: error.status });
    return NextResponse.json({ error: "Safety reports could not be loaded" }, { status: 500 });
  }
}
