import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { publicDisplayName, validateOperatorPresentation } from "@/lib/profiles";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (user.role !== Role.OPERATOR) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { name: true } });
    return NextResponse.json({ profile: { displayName: publicDisplayName(profile.name) } });
  } catch (error) {
    console.error("Operator profile request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Profile is temporarily unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (user.role !== Role.OPERATOR) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const input = validateOperatorPresentation(await req.json());
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const profile = await db.user.update({ where: { id: user.id }, data: { name: input.value.displayName }, select: { name: true } });
    return NextResponse.json({ profile: { displayName: publicDisplayName(profile.name) } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("Operator profile update failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Profile could not be saved" }, { status: 500 });
  }
}
