import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { listTeleporterAgreements } from "@/lib/agreements";

export async function GET() {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  return NextResponse.json({ agreements: await listTeleporterAgreements(db, access.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
