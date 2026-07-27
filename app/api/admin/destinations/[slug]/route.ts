import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { validateAdminDestination } from "@/lib/admin";
import { db } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const auth = await authorizeAdminApi(); if (!auth.ok) return auth.response;
    const input = validateAdminDestination(await req.json(), false); if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const { expectedUpdatedAt, ...data } = input.value;
    const result = await db.$transaction(async tx => {
      const existing = await tx.destination.findUnique({ where: { slug: params.slug }, select: { slug: true } });
      if (!existing) return { ok: false as const, status: 404, error: "Destination not found" };
      const duplicate = await tx.destination.count({ where: { slug: { not: params.slug }, name: { equals: data.name, mode: "insensitive" } } });
      if (duplicate) return { ok: false as const, status: 409, error: "A destination with this name already exists" };
      const changed = await tx.destination.updateMany({ where: { slug: params.slug, updatedAt: expectedUpdatedAt! }, data });
      if (changed.count !== 1) return { ok: false as const, status: 409, error: "Destination changed; refresh and try again" };
      const destination = await tx.destination.findUniqueOrThrow({ where: { slug: params.slug }, select: { slug: true, name: true, shortDescription: true, city: true, meetingArea: true, category: true, durationOptions: true, active: true, imageUrl: true, custom: true, updatedAt: true } });
      return { ok: true as const, destination };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const destination = result.destination;
    return NextResponse.json({ destination: { ...destination, updatedAt: destination.updatedAt.toISOString() } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return NextResponse.json({ error: "Destination changed; refresh and try again" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return NextResponse.json({ error: "Destination not found" }, { status: 404 });
    console.error("Admin destination update failed", error instanceof Error ? error.name : "UnknownError"); return NextResponse.json({ error: "Destination could not be updated" }, { status: 500 });
  }
}
