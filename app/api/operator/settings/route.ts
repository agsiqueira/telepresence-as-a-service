import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { ALLOWED_ACCESSIBILITY, ALLOWED_DURATIONS, ALLOWED_LANGUAGES, profileIsComplete } from "@/lib/marketplace";
import { updateOperatorSettings, validateSettingsInput } from "@/lib/phase3-services";

export async function GET() {
  const user = await requireRole(Role.OPERATOR);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [profile, destinations, services] = await Promise.all([
    db.operatorProfile.findUnique({ where: { userId: user.id }, select: { operatingArea: true, serviceRadiusKm: true, supportsCustom: true, languages: true, accessibilityCapabilities: true, durationOptions: true } }),
    db.destination.findMany({ where: { active: true, custom: false }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
    db.operatorDestination.findMany({ where: { operatorId: user.id }, select: { destinationId: true } }),
  ]);
  return NextResponse.json({ profile, destinationIds: services.map(item => item.destinationId), destinations, online: user.online, complete: profileIsComplete(profile, services.length, profile?.supportsCustom ?? false), options: { durations: ALLOWED_DURATIONS, languages: ALLOWED_LANGUAGES, accessibility: ALLOWED_ACCESSIBILITY } });
}

export async function PUT(req: NextRequest) {
  const user = await requireRole(Role.OPERATOR);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = validateSettingsInput(await req.json());
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
  const result = await updateOperatorSettings(db, user.id, input.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ profile: { operatingArea: result.value.profile.operatingArea, serviceRadiusKm: result.value.profile.serviceRadiusKm, supportsCustom: result.value.profile.supportsCustom, languages: result.value.profile.languages, accessibilityCapabilities: result.value.profile.accessibilityCapabilities, durationOptions: result.value.profile.durationOptions }, destinationIds: result.value.destinationIds, online: false, complete: true });
}
