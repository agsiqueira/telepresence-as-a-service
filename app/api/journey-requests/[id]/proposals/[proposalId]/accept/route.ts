import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { acceptProposal } from "@/lib/agreements";

export async function POST(_: Request, { params }: { params: { id: string; proposalId: string } }) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  const result = await acceptProposal(db, access.user.id, params.id, params.proposalId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ agreement: result.value, created: result.created }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
}
