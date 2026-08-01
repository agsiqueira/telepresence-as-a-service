import "server-only";

import { AccountStatus, Prisma, Role, SafetyReportCategory, SafetyReportSeverity } from "@prisma/client";
import type { db as applicationDb } from "@/lib/db";

type Database = Pick<typeof applicationDb, "user" | "safetyReport">;
const MAX_LIMIT = 50;
const categories = new Set(Object.values(SafetyReportCategory));
const severities = new Set(Object.values(SafetyReportSeverity));
const identity = { id: true, name: true } as const;

export class AdminSafetyReportError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_QUERY" | "NOT_FOUND", readonly status: 400 | 403 | 404) { super(code); }
}

async function requireAdmin(database: Database, adminId: string) {
  const admin = await database.user.findUnique({ where: { id: adminId }, select: { role: true, accountStatus: true } });
  if (!admin || admin.role !== Role.ADMIN || admin.accountStatus !== AccountStatus.ACTIVE) throw new AdminSafetyReportError("FORBIDDEN", 403);
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.createdAt !== "string" || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error();
    return { id: parsed.id, createdAt: new Date(parsed.createdAt) };
  } catch { throw new AdminSafetyReportError("INVALID_QUERY", 400); }
}

export type AdminSafetyReportFilters = { category?: string | null; severity?: string | null; cursor?: string | null; limit?: string | number | null };

export async function listSafetyReportsForAdmin(database: Database, adminId: string, filters: AdminSafetyReportFilters) {
  await requireAdmin(database, adminId);
  if (filters.category && !categories.has(filters.category as SafetyReportCategory)) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  if (filters.severity && !severities.has(filters.severity as SafetyReportSeverity)) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  const limit = filters.limit == null || filters.limit === "" ? 20 : Number(filters.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  const cursor = decodeCursor(filters.cursor ?? null);
  const where: Prisma.SafetyReportWhereInput = {
    ...(filters.category ? { category: filters.category as SafetyReportCategory } : {}),
    ...(filters.severity ? { severity: filters.severity as SafetyReportSeverity } : {}),
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
  };
  const rows = await database.safetyReport.findMany({ where, take: limit + 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, tripId: true, category: true, severity: true, createdAt: true, reporterRole: true, reportedRole: true, reporter: { select: identity }, reported: { select: identity } } });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
}

export async function getSafetyReportForAdmin(database: Database, adminId: string, reportId: string) {
  await requireAdmin(database, adminId);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reportId)) throw new AdminSafetyReportError("NOT_FOUND", 404);
  const report = await database.safetyReport.findUnique({ where: { id: reportId }, select: { id: true, tripId: true, category: true, severity: true, narrative: true, createdAt: true, reporterRole: true, reportedRole: true, reporter: { select: identity }, reported: { select: identity }, trip: { select: { id: true, status: true, requestedAt: true, acceptedAt: true, startedAt: true, endedAt: true } } } });
  if (!report) throw new AdminSafetyReportError("NOT_FOUND", 404);
  return report;
}
