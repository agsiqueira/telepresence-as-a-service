import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { listExplorerReceivedProposals } from "@/lib/proposals";
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) { const access = await authorizeExplorerApi(); if (!access.ok) return access.response; const proposals = await listExplorerReceivedProposals(db, access.user.id, params.id); return proposals ? NextResponse.json({ proposals }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Not found" }, { status: 404 }); }
