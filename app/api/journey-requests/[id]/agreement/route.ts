import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeExplorerApi } from "@/lib/current-user";
import { getExplorerAgreement } from "@/lib/agreements";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const access = await authorizeExplorerApi(); if (!access.ok) return access.response;
  const agreement = await getExplorerAgreement(db, access.user.id, params.id);
  if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  return NextResponse.json({ agreement }, { headers: { "Cache-Control": "no-store" } });
}
