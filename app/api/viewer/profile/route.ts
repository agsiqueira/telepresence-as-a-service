import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { publicDisplayName, validateViewerProfile } from "@/lib/profiles";

const projection = { name: true, preferredLanguage: true, accessibilityPreferences: true } as const;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (user.role !== Role.VIEWER) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const profile = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: projection });
    return NextResponse.json({ profile: { displayName: publicDisplayName(profile.name), preferredLanguage: profile.preferredLanguage, accessibilityPreferences: profile.accessibilityPreferences } });
  } catch (error) {
    console.error("Viewer profile request failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Profile is temporarily unavailable" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    if (user.role !== Role.VIEWER) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const input = validateViewerProfile(await req.json());
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const profile = await db.user.update({ where: { id: user.id }, data: { name: input.value.displayName, preferredLanguage: input.value.preferredLanguage, accessibilityPreferences: input.value.accessibilityPreferences }, select: projection });
    return NextResponse.json({ profile: { displayName: publicDisplayName(profile.name), preferredLanguage: profile.preferredLanguage, accessibilityPreferences: profile.accessibilityPreferences } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("Viewer profile update failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "Profile could not be saved" }, { status: 500 });
  }
}
