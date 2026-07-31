import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeTeleporterActivityApi } from "@/lib/current-user";
import { withdrawProposal } from "@/lib/proposals";
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) { const access = await authorizeTeleporterActivityApi(); if (!access.ok) return access.response; const result = await withdrawProposal(db, access.user.id, params.id); if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status }); return NextResponse.json({ proposal: result.value }, { headers: { "Cache-Control": "no-store" } }); }
