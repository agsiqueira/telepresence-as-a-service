import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { ALLOWED_ACCESSIBILITY, ALLOWED_DURATIONS, ALLOWED_LANGUAGES, profileIsComplete } from "@/lib/marketplace";
import { updateOperatorSettings, validateSettingsInput } from "@/lib/phase3-services";

export async function GET() {
 try {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== Role.OPERATOR) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [profile, destinations, services] = await Promise.all([
    db.operatorProfile.findUnique({ where: { userId: user.id }, select: { operatingArea: true, serviceRadiusKm: true, supportsCustom: true, languages: true, accessibilityCapabilities: true, durationOptions: true, pilotStatus: true } }),
    db.destination.findMany({ where: { custom: false, OR: [{ active: true }, { operators: { some: { operatorId: user.id } } }] }, select: { id: true, name: true, city: true, active: true }, orderBy: { name: "asc" } }),
    db.operatorDestination.findMany({ where: { operatorId: user.id }, select: { destinationId: true } }),
  ]);
  return NextResponse.json({ profile, destinationIds: services.map(item => item.destinationId), destinations, online: user.online, complete: profileIsComplete(profile, services.length, profile?.supportsCustom ?? false), options: { durations: ALLOWED_DURATIONS, languages: ALLOWED_LANGUAGES, accessibility: ALLOWED_ACCESSIBILITY } });
 } catch (error) {
  console.error("Operator settings request failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Service settings are temporarily unavailable" }, { status: 500 });
 }
}

export async function PUT(req: NextRequest) {
 try {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.role !== Role.OPERATOR) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = validateSettingsInput(await req.json());
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
  const result = await updateOperatorSettings(db, user.id, input.value);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ profile: { operatingArea: result.value.profile.operatingArea, serviceRadiusKm: result.value.profile.serviceRadiusKm, supportsCustom: result.value.profile.supportsCustom, languages: result.value.profile.languages, accessibilityCapabilities: result.value.profile.accessibilityCapabilities, durationOptions: result.value.profile.durationOptions }, destinationIds: result.value.destinationIds, online: false, complete: true });
 } catch (error) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  console.error("Operator settings update failed", error instanceof Error ? error.name : "UnknownError");
  return NextResponse.json({ error: "Service settings could not be saved" }, { status: 500 });
 }
}
