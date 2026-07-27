import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authorizeAdminApi } from "@/lib/admin-auth";
import { destinationSlug, validateAdminDestination } from "@/lib/admin";
import { db } from "@/lib/db";

const select = { slug: true, name: true, shortDescription: true, city: true, meetingArea: true, category: true, durationOptions: true, active: true, imageUrl: true, custom: true, updatedAt: true, _count: { select: { trips: true, operators: true } } } as const;

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAdminApi(); if (!auth.ok) return auth.response;
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const active = req.nextUrl.searchParams.get("active") ?? "";
    if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !["", "true", "false"].includes(active)) return NextResponse.json({ error: "Check destination filters" }, { status: 400 });
    const values = await db.destination.findMany({ where: active ? { active: active === "true" } : undefined, orderBy: [{ name: "asc" }, { slug: "asc" }], take: limit, select });
    return NextResponse.json({ destinations: values.map(({ _count, ...value }) => ({ ...value, updatedAt: value.updatedAt.toISOString(), referenced: _count.trips > 0 || _count.operators > 0 })) });
  } catch (error) { console.error("Admin destination listing failed", error instanceof Error ? error.name : "UnknownError"); return NextResponse.json({ error: "Destinations are temporarily unavailable" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeAdminApi(); if (!auth.ok) return auth.response;
    const input = validateAdminDestination(await req.json(), true); if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });
    const data = { name: input.value.name, shortDescription: input.value.shortDescription, city: input.value.city, meetingArea: input.value.meetingArea, category: input.value.category, durationOptions: input.value.durationOptions, imageUrl: input.value.imageUrl, custom: input.value.custom, active: input.value.active };
    const slug = destinationSlug(data.name); if (!slug) return NextResponse.json({ error: "Enter a destination name" }, { status: 400 });
    if (await db.destination.count({ where: { OR: [{ slug }, { name: { equals: data.name, mode: "insensitive" } }] } })) return NextResponse.json({ error: "A destination with this name already exists" }, { status: 409 });
    const created = await db.destination.create({ data: { ...data, slug }, select });
    const { _count, ...destination } = created;
    return NextResponse.json({ destination: { ...destination, updatedAt: destination.updatedAt.toISOString(), referenced: _count.trips > 0 || _count.operators > 0 } }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A destination with this name already exists" }, { status: 409 });
    console.error("Admin destination creation failed", error instanceof Error ? error.name : "UnknownError"); return NextResponse.json({ error: "Destination could not be created" }, { status: 500 });
  }
}
