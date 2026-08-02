import { NextResponse } from "next/server";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { listSafetyRestrictionsForAdmin, proposeSafetyRestrictionForAdmin, SafetyRestrictionError } from "@/lib/safety-restrictions";

function failure(error: unknown) {
  return error instanceof SafetyRestrictionError
    ? NextResponse.json({ error: error.code }, { status: error.status })
    : NextResponse.json({ error: "Restriction request failed" }, { status: 500 });
}
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const access = await authorizeAdminApi(); if (!access.ok) return access.response;
  try { const restrictions = await listSafetyRestrictionsForAdmin(db, access.user.id, params.id); return NextResponse.json({ restrictions: restrictions.map(item => ({ ...item, canApprove: item.status === "PROPOSED" && item.proposedByAdministrator.id !== access.user.id })) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await authorizeAdminApi(); if (!access.ok) return access.response;
  try { return NextResponse.json({ restriction: await proposeSafetyRestrictionForAdmin(db, access.user.id, params.id, await request.json()) }, { status: 201 }); } catch (error) { return failure(error); }
}
