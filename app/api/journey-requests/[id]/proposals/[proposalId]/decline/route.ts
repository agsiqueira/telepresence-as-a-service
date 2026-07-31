import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { declineProposal } from "@/lib/proposals";
export async function POST(_req: NextRequest, { params }: { params: { id: string; proposalId: string } }) { const access = await authorizeExplorerApi(); if (!access.ok) return access.response; const result = await declineProposal(db, access.user.id, params.id, params.proposalId); if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status }); return NextResponse.json({ proposal: result.value }, { headers: { "Cache-Control": "no-store" } }); }
