import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { createRescheduleProposal, listPendingRescheduleProposals } from "@/lib/rescheduling";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const access = await authorizeApiUser(); if (!access.ok) return access.response;
  const result = await listPendingRescheduleProposals(db, access.user.id, params.id);
  return result.ok ? NextResponse.json({ proposal: result.value }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: result.error }, { status: result.status });
}
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const access = await authorizeApiUser(); if (!access.ok) return access.response;
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const input = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const result = await createRescheduleProposal(db, access.user.id, params.id, { proposedStartAt: input.proposedStartAt, proposedEndAt: input.proposedEndAt });
  return result.ok ? NextResponse.json({ proposal: result.value }, { status: result.created ? 201 : 200 }) : NextResponse.json({ error: result.error }, { status: result.status });
}
