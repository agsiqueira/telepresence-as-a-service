import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { listExplorerProposalHistory } from "@/lib/proposals";
export async function GET(_req: NextRequest, { params }: { params: { id: string; proposalId: string } }) { const access = await authorizeExplorerApi(); if (!access.ok) return access.response; const proposals = await listExplorerProposalHistory(db, access.user.id, params.id, params.proposalId); return proposals ? NextResponse.json({ proposals }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 }); }
