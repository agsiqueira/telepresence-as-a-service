import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { listAdminAgreements } from "@/lib/agreements";

export async function GET() {
  const access = await authorizeAdminApi(); if (!access.ok) return access.response;
  return NextResponse.json({ agreements: await listAdminAgreements(db) }, { headers: { "Cache-Control": "no-store" } });
}
