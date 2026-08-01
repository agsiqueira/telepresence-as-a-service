import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { acceptProposal } from "@/lib/agreements";

export async function POST(req: Request, { params }: { params: { id: string; proposalId: string } }) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  let input: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NextResponse.json({ error: "Invalid acceptance request" }, { status: 400 });
      input = parsed as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "Invalid acceptance request" }, { status: 400 });
  }
  if (Object.keys(input).some(key => key !== "scheduledStartAt")) return NextResponse.json({ error: "Unsupported acceptance field" }, { status: 400 });
  const result = await acceptProposal(db, access.user.id, params.id, params.proposalId, input);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ agreement: result.value, created: result.created }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
}
