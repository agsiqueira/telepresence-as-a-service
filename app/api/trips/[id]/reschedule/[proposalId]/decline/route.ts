import { NextResponse } from "next/server";
import { authorizeApiUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { declineRescheduleProposal } from "@/lib/rescheduling";

export async function POST(_request: Request, { params }: { params: { id: string; proposalId: string } }) {
  const access = await authorizeApiUser(); if (!access.ok) return access.response;
  const result = await declineRescheduleProposal(db, access.user.id, params.id, params.proposalId);
  return result.ok ? NextResponse.json({ proposal: result.value }) : NextResponse.json({ error: result.error }, { status: result.status });
}
