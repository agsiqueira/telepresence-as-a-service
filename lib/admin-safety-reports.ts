import "server-only";

import { AccountStatus, Prisma, Role, SafetyReportCategory, SafetyReportSeverity, SafetyReportTriageStatus } from "@prisma/client";
import type { db as applicationDb } from "@/lib/db";

type Database = typeof applicationDb;
const MAX_LIMIT = 50;
const categories = new Set(Object.values(SafetyReportCategory));
const severities = new Set(Object.values(SafetyReportSeverity));
const triageStatuses = new Set(Object.values(SafetyReportTriageStatus));
const identity = { id: true, name: true } as const;

export class AdminSafetyReportError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_QUERY" | "NOT_FOUND" | "INVALID_TRANSITION" | "TRIAGE_CONFLICT", readonly status: 400 | 403 | 404 | 409) { super(code); }
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

export type AdminSafetyReportFilters = { category?: string | null; severity?: string | null; triageStatus?: string | null; cursor?: string | null; limit?: string | number | null };

export async function listSafetyReportsForAdmin(database: Database, adminId: string, filters: AdminSafetyReportFilters) {
  await requireAdmin(database, adminId);
  if (filters.category && !categories.has(filters.category as SafetyReportCategory)) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  if (filters.severity && !severities.has(filters.severity as SafetyReportSeverity)) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  if (filters.triageStatus && !triageStatuses.has(filters.triageStatus as SafetyReportTriageStatus)) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  const limit = filters.limit == null || filters.limit === "" ? 20 : Number(filters.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  const cursor = decodeCursor(filters.cursor ?? null);
  const where: Prisma.SafetyReportWhereInput = {
    ...(filters.category ? { category: filters.category as SafetyReportCategory } : {}),
    ...(filters.severity ? { severity: filters.severity as SafetyReportSeverity } : {}),
    ...(filters.triageStatus ? { triageStatus: filters.triageStatus as SafetyReportTriageStatus } : {}),
    ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
  };
  const rows = await database.safetyReport.findMany({ where, take: limit + 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, tripId: true, category: true, severity: true, triageStatus: true, assignedAt: true, assignedAdministrator: { select: identity }, createdAt: true, reporterRole: true, reportedRole: true, reporter: { select: identity }, reported: { select: identity } } });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url") : null };
}

export async function getSafetyReportForAdmin(database: Database, adminId: string, reportId: string) {
  await requireAdmin(database, adminId);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reportId)) throw new AdminSafetyReportError("NOT_FOUND", 404);
  const report = await database.safetyReport.findUnique({ where: { id: reportId }, select: { id: true, tripId: true, category: true, severity: true, narrative: true, triageStatus: true, assignedAt: true, assignedAdministrator: { select: { ...identity, role: true, accountStatus: true } }, createdAt: true, reporterRole: true, reportedRole: true, reporter: { select: identity }, reported: { select: identity }, trip: { select: { id: true, status: true, requestedAt: true, acceptedAt: true, startedAt: true, endedAt: true } }, triageEvents: { take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, previousStatus: true, newStatus: true, createdAt: true, administrator: { select: identity } } }, assignmentEvents: { take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, createdAt: true, actingAdministrator: { select: identity }, previousAssignedAdministrator: { select: identity }, newAssignedAdministrator: { select: identity } } }, internalNotes: { take: 100, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, body: true, createdAt: true, administrator: { select: identity } } } } });
  if (!report) throw new AdminSafetyReportError("NOT_FOUND", 404);
  return report;
}

const transitions: Record<SafetyReportTriageStatus, readonly SafetyReportTriageStatus[]> = {
  NEW: ["UNDER_REVIEW", "ESCALATED", "CLOSED_NO_ACTION"], UNDER_REVIEW: ["ESCALATED", "CLOSED_NO_ACTION"],
  ESCALATED: ["UNDER_REVIEW", "CLOSED_NO_ACTION"], CLOSED_NO_ACTION: ["UNDER_REVIEW"],
};

export async function updateSafetyReportTriageStatusForAdmin(database: Database, adminId: string, reportId: string, input: unknown) {
  await requireAdmin(database, adminId);
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(reportId) || !input || typeof input !== "object" || Array.isArray(input)) throw new AdminSafetyReportError("NOT_FOUND", 404);
  const keys = Object.keys(input); if (keys.length !== 2 || !keys.includes("expectedStatus") || !keys.includes("newStatus")) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  const { expectedStatus, newStatus } = input as { expectedStatus?: unknown; newStatus?: unknown };
  if (typeof expectedStatus !== "string" || typeof newStatus !== "string" || !triageStatuses.has(expectedStatus as SafetyReportTriageStatus) || !triageStatuses.has(newStatus as SafetyReportTriageStatus)) throw new AdminSafetyReportError("INVALID_QUERY", 400);
  if (!transitions[expectedStatus as SafetyReportTriageStatus].includes(newStatus as SafetyReportTriageStatus)) throw new AdminSafetyReportError("INVALID_TRANSITION", 400);
  return database.$transaction(async tx => {
    const changed = await tx.safetyReport.updateMany({ where: { id: reportId, triageStatus: expectedStatus as SafetyReportTriageStatus }, data: { triageStatus: newStatus as SafetyReportTriageStatus } });
    if (changed.count !== 1) { const exists = await tx.safetyReport.findUnique({ where: { id: reportId }, select: { id: true } }); throw new AdminSafetyReportError(exists ? "TRIAGE_CONFLICT" : "NOT_FOUND", exists ? 409 : 404); }
    const event = await tx.safetyReportTriageEvent.create({ data: { safetyReportId: reportId, administratorId: adminId, previousStatus: expectedStatus as SafetyReportTriageStatus, newStatus: newStatus as SafetyReportTriageStatus }, select: { id: true, previousStatus: true, newStatus: true, createdAt: true } });
    return { id: reportId, triageStatus: newStatus as SafetyReportTriageStatus, event };
  });
}

export async function listEligibleSafetyReportAdministrators(database: Database, adminId: string) { await requireAdmin(database, adminId); return database.user.findMany({ where: { role: Role.ADMIN, accountStatus: AccountStatus.ACTIVE }, take: 100, orderBy: [{ name: "asc" }, { id: "asc" }], select: identity }); }

export async function updateSafetyReportAssignmentForAdmin(database: Database, adminId: string, reportId: string, input: unknown) {
  await requireAdmin(database, adminId); if (!input || typeof input !== "object" || Array.isArray(input)) throw new AdminSafetyReportError("INVALID_QUERY",400);
  const keys=Object.keys(input);if(keys.length!==2||!keys.includes("expectedAssignedAdministratorId")||!keys.includes("newAssignedAdministratorId"))throw new AdminSafetyReportError("INVALID_QUERY",400);
  const {expectedAssignedAdministratorId:expected,newAssignedAdministratorId:next}=input as Record<string,unknown>;if((expected!==null&&typeof expected!=="string")||(next!==null&&typeof next!=="string")||expected===next)throw new AdminSafetyReportError("INVALID_TRANSITION",400);
  if(next){const eligible=await database.user.findFirst({where:{id:next as string,role:Role.ADMIN,accountStatus:AccountStatus.ACTIVE},select:{id:true}});if(!eligible)throw new AdminSafetyReportError("INVALID_TRANSITION",400)}
  return database.$transaction(async tx=>{const changed=await tx.safetyReport.updateMany({where:{id:reportId,assignedAdministratorId:expected as string|null},data:{assignedAdministratorId:next as string|null,assignedAt:next?new Date():null}});if(changed.count!==1){const exists=await tx.safetyReport.findUnique({where:{id:reportId},select:{id:true}});throw new AdminSafetyReportError(exists?"TRIAGE_CONFLICT":"NOT_FOUND",exists?409:404)}const event=await tx.safetyReportAssignmentEvent.create({data:{safetyReportId:reportId,actingAdministratorId:adminId,previousAssignedAdministratorId:expected as string|null,newAssignedAdministratorId:next as string|null},select:{id:true,createdAt:true}});return{id:reportId,assignedAdministratorId:next, event}});
}

export async function addSafetyReportInternalNoteForAdmin(database: Database, adminId: string, reportId: string, input: unknown){await requireAdmin(database,adminId);if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length!==1||!("body"in input)||typeof input.body!=="string")throw new AdminSafetyReportError("INVALID_QUERY",400);const body=input.body.trim();if(body.length<1||body.length>2000)throw new AdminSafetyReportError("INVALID_QUERY",400);const exists=await database.safetyReport.findUnique({where:{id:reportId},select:{id:true}});if(!exists)throw new AdminSafetyReportError("NOT_FOUND",404);return database.safetyReportInternalNote.create({data:{safetyReportId:reportId,administratorId:adminId,body},select:{id:true,body:true,createdAt:true,administrator:{select:identity}}});}
