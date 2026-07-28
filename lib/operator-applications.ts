import "server-only";

import {
  OperatorApplicationStatus,
  Prisma,
  Role,
  type PrismaClient,
} from "@prisma/client";
import { ALLOWED_LANGUAGES } from "./marketplace";
import {
  RoleTransitionAbort,
  assignViewerAsOperatorInTransaction,
  type RoleTransitionSuccess,
} from "./role-transitions";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
export const OPERATOR_APPLICATION_PAGE_LIMIT = 20;
export const OPERATOR_APPLICATION_MAX_LIMIT = 50;

export type OperatorApplicationFailureCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "PENDING_APPLICATION_EXISTS"
  | "APPLICATION_NOT_FOUND"
  | "APPLICATION_NOT_OWNED"
  | "APPLICATION_NOT_PENDING"
  | "APPLICANT_NOT_VIEWER"
  | "UNFINISHED_VIEWER_OBLIGATION"
  | "SERIALIZATION_RETRY_EXHAUSTED"
  | "INTERNAL_INVARIANT_FAILURE";

export type OperatorApplicationFailure = {
  ok: false;
  code: OperatorApplicationFailureCode;
  status: 400 | 401 | 403 | 404 | 409 | 500 | 503;
  error: string;
};
export type OperatorApplicationSuccess<T> = { ok: true; value: T };
export type OperatorApplicationResult<T> = OperatorApplicationSuccess<T> | OperatorApplicationFailure;

export type SubmitOperatorApplicationInput = {
  qualifications: string;
  relevantExperience: string;
  languages: string[];
  availability: string;
  supportingUrl: string | null;
  additionalNote: string | null;
};

export type ReviewOperatorApplicationInput = {
  decision: typeof OperatorApplicationStatus.APPROVED | typeof OperatorApplicationStatus.REJECTED;
  reviewNote: string | null;
};

type Database = Pick<PrismaClient, "$transaction">;
type QueryDatabase = Pick<PrismaClient, "user" | "operatorApplication">;
type Operation = "submit" | "withdraw" | "review";

class ApplicationAbort extends Error {
  constructor(readonly failure: OperatorApplicationFailure) {
    super(failure.code);
  }
}

const failure = (
  code: OperatorApplicationFailureCode,
  status: OperatorApplicationFailure["status"],
  error: string
): OperatorApplicationFailure => ({ ok: false, code, status, error });

function abort(code: OperatorApplicationFailureCode, status: OperatorApplicationFailure["status"], error: string): never {
  throw new ApplicationAbort(failure(code, status, error));
}

function isPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

async function runSerializable<T>(
  db: Database,
  operation: Operation,
  context: { userId?: string | null; applicationId?: string },
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<OperatorApplicationResult<T>> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, value: await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) };
    } catch (error) {
      if (error instanceof ApplicationAbort) return error.failure;
      if (isPrismaError(error, "P2034")) {
        if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        return failure("SERIALIZATION_RETRY_EXHAUSTED", 503, "Application state changed repeatedly; try again");
      }
      console.error("Unexpected Operator application failure", { operation, ...context }, error);
      return failure("INTERNAL_INVARIANT_FAILURE", 500, "Operator application operation could not be completed");
    }
  }
  return failure("INTERNAL_INVARIANT_FAILURE", 500, "Operator application operation could not be completed");
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOnlyFields(body: Record<string, unknown>, allowed: ReadonlySet<string>) {
  return Object.keys(body).every(key => allowed.has(key));
}

const SUBMISSION_FIELDS = new Set([
  "qualifications",
  "relevantExperience",
  "languages",
  "availability",
  "supportingUrl",
  "additionalNote",
]);

export function validateOperatorApplicationSubmission(body: Record<string, unknown>): OperatorApplicationResult<SubmitOperatorApplicationInput> {
  if (!hasOnlyFields(body, SUBMISSION_FIELDS)) return failure("VALIDATION_FAILED", 400, "Unsupported application field");
  const qualifications = normalizedText(body.qualifications);
  const relevantExperience = normalizedText(body.relevantExperience);
  const availability = normalizedText(body.availability);
  const supportingUrl = normalizedText(body.supportingUrl);
  const additionalNote = normalizedText(body.additionalNote);
  if (body.supportingUrl !== undefined && body.supportingUrl !== null && typeof body.supportingUrl !== "string") return failure("VALIDATION_FAILED", 400, "Supporting URL must be text");
  if (body.additionalNote !== undefined && body.additionalNote !== null && typeof body.additionalNote !== "string") return failure("VALIDATION_FAILED", 400, "Additional note must be text");
  if (qualifications.length < 20 || qualifications.length > 2000) return failure("VALIDATION_FAILED", 400, "Qualifications must be between 20 and 2,000 characters");
  if (relevantExperience.length < 20 || relevantExperience.length > 2000) return failure("VALIDATION_FAILED", 400, "Relevant experience must be between 20 and 2,000 characters");
  if (availability.length < 10 || availability.length > 1000) return failure("VALIDATION_FAILED", 400, "Availability must be between 10 and 1,000 characters");
  if (!Array.isArray(body.languages) || body.languages.length < 1 || body.languages.length > 4 || body.languages.some(value => typeof value !== "string")) return failure("VALIDATION_FAILED", 400, "Choose between one and four supported languages");
  const languages = body.languages as string[];
  if (new Set(languages).size !== languages.length) return failure("VALIDATION_FAILED", 400, "Languages must not contain duplicates");
  if (languages.some(value => !ALLOWED_LANGUAGES.includes(value as never))) return failure("VALIDATION_FAILED", 400, "Choose only supported languages");
  if (supportingUrl.length > 500) return failure("VALIDATION_FAILED", 400, "Supporting URL is too long");
  if (supportingUrl) {
    try {
      if (new URL(supportingUrl).protocol !== "https:") return failure("VALIDATION_FAILED", 400, "Supporting URL must use HTTPS");
    } catch {
      return failure("VALIDATION_FAILED", 400, "Supporting URL must be a valid HTTPS URL");
    }
  }
  if (additionalNote.length > 1000) return failure("VALIDATION_FAILED", 400, "Additional note is too long");
  return { ok: true, value: { qualifications, relevantExperience, languages, availability, supportingUrl: supportingUrl || null, additionalNote: additionalNote || null } };
}

export function validateOperatorApplicationReview(body: Record<string, unknown>): OperatorApplicationResult<ReviewOperatorApplicationInput> {
  if (!hasOnlyFields(body, new Set(["decision", "reviewNote"]))) return failure("VALIDATION_FAILED", 400, "Unsupported review field");
  if (body.decision !== OperatorApplicationStatus.APPROVED && body.decision !== OperatorApplicationStatus.REJECTED) return failure("VALIDATION_FAILED", 400, "Review decision must be APPROVED or REJECTED");
  if (body.reviewNote !== undefined && body.reviewNote !== null && typeof body.reviewNote !== "string") return failure("VALIDATION_FAILED", 400, "Review note must be text");
  const reviewNote = normalizedText(body.reviewNote);
  if (reviewNote.length > 1000) return failure("VALIDATION_FAILED", 400, "Review note is too long");
  return { ok: true, value: { decision: body.decision, reviewNote: reviewNote || null } };
}

async function requireRole(tx: Prisma.TransactionClient, userId: string | null | undefined, role: Role) {
  if (!userId) abort("UNAUTHENTICATED", 401, "Authentication is required");
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) abort("UNAUTHENTICATED", 401, "Authentication is no longer valid");
  if (user.role !== role) abort("FORBIDDEN", 403, role === Role.ADMIN ? "Administrator authorization is required" : "Viewer authorization is required");
  return user;
}

export async function submitOperatorApplication(
  db: Database,
  applicantId: string | null | undefined,
  body: Record<string, unknown>
) {
  const input = validateOperatorApplicationSubmission(body);
  if (!input.ok) return input;
  return runSerializable(db, "submit", { userId: applicantId }, async tx => {
    const applicant = await requireRole(tx, applicantId, Role.VIEWER);
    if (await tx.operatorApplication.count({ where: { applicantId: applicant.id, status: OperatorApplicationStatus.PENDING } })) {
      abort("PENDING_APPLICATION_EXISTS", 409, "A pending Operator application already exists");
    }
    try {
      return await tx.operatorApplication.create({ data: { applicantId: applicant.id, ...input.value } });
    } catch (error) {
      if (isPrismaError(error, "P2002")) abort("PENDING_APPLICATION_EXISTS", 409, "A pending Operator application already exists");
      throw error;
    }
  });
}

export async function withdrawOperatorApplication(
  db: Database,
  applicantId: string | null | undefined,
  applicationId: string,
  now = new Date()
) {
  return runSerializable(db, "withdraw", { userId: applicantId, applicationId }, async tx => {
    const applicant = await requireRole(tx, applicantId, Role.VIEWER);
    const application = await tx.operatorApplication.findUnique({ where: { id: applicationId }, select: { id: true, applicantId: true, status: true } });
    if (!application) abort("APPLICATION_NOT_FOUND", 404, "Operator application not found");
    if (application.applicantId !== applicant.id) abort("APPLICATION_NOT_OWNED", 403, "Operator application belongs to another Viewer");
    if (application.status !== OperatorApplicationStatus.PENDING) abort("APPLICATION_NOT_PENDING", 409, "Operator application is no longer pending");
    const changed = await tx.operatorApplication.updateMany({
      where: { id: application.id, applicantId: applicant.id, status: OperatorApplicationStatus.PENDING },
      data: { status: OperatorApplicationStatus.WITHDRAWN, withdrawnAt: now },
    });
    if (changed.count !== 1) abort("APPLICATION_NOT_PENDING", 409, "Operator application is no longer pending");
    return tx.operatorApplication.findUniqueOrThrow({ where: { id: application.id } });
  });
}

const viewerApplicationSelect = {
  id: true,
  qualifications: true,
  relevantExperience: true,
  languages: true,
  availability: true,
  supportingUrl: true,
  additionalNote: true,
  status: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
  withdrawnAt: true,
  updatedAt: true,
} satisfies Prisma.OperatorApplicationSelect;

export async function listViewerOperatorApplications(db: QueryDatabase, applicantId: string | null | undefined) {
  try {
    if (!applicantId) return failure("UNAUTHENTICATED", 401, "Authentication is required");
    const applicant = await db.user.findUnique({ where: { id: applicantId }, select: { role: true } });
    if (!applicant) return failure("UNAUTHENTICATED", 401, "Authentication is no longer valid");
    if (applicant.role !== Role.VIEWER) return failure("FORBIDDEN", 403, "Viewer authorization is required");
    const applications = await db.operatorApplication.findMany({ where: { applicantId }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], select: viewerApplicationSelect });
    return { ok: true as const, value: applications };
  } catch (error) {
    console.error("Unexpected Operator application query failure", { operation: "list-viewer", userId: applicantId }, error);
    return failure("INTERNAL_INVARIANT_FAILURE", 500, "Operator applications could not be loaded");
  }
}

export type AdminOperatorApplicationFilters = { status?: OperatorApplicationStatus; page?: number; limit?: number };
const adminApplicationSelect = {
  ...viewerApplicationSelect,
  applicant: { select: { id: true, name: true, role: true } },
  reviewer: { select: { id: true, name: true } },
} satisfies Prisma.OperatorApplicationSelect;

export async function listAdminOperatorApplications(db: QueryDatabase, adminId: string | null | undefined, filters: AdminOperatorApplicationFilters = {}) {
  try {
    if (!adminId) return failure("UNAUTHENTICATED", 401, "Authentication is required");
    const admin = await db.user.findUnique({ where: { id: adminId }, select: { role: true } });
    if (!admin) return failure("UNAUTHENTICATED", 401, "Authentication is no longer valid");
    if (admin.role !== Role.ADMIN) return failure("FORBIDDEN", 403, "Administrator authorization is required");
    const page = filters.page ?? 1;
    const limit = filters.limit ?? OPERATOR_APPLICATION_PAGE_LIMIT;
    if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(limit) || limit < 1 || limit > OPERATOR_APPLICATION_MAX_LIMIT || (filters.status && !Object.values(OperatorApplicationStatus).includes(filters.status))) return failure("VALIDATION_FAILED", 400, "Check application filters");
    const applications = await db.operatorApplication.findMany({
      where: { status: filters.status },
      orderBy: filters.status ? [{ submittedAt: "asc" }, { id: "asc" }] : [{ status: "asc" }, { submittedAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: adminApplicationSelect,
    });
    return { ok: true as const, value: { applications, page, limit, hasNext: applications.length === limit } };
  } catch (error) {
    console.error("Unexpected Operator application query failure", { operation: "list-admin", userId: adminId }, error);
    return failure("INTERNAL_INVARIANT_FAILURE", 500, "Operator applications could not be loaded");
  }
}

export async function getAdminOperatorApplication(db: QueryDatabase, adminId: string | null | undefined, applicationId: string) {
  try {
    if (!adminId) return failure("UNAUTHENTICATED", 401, "Authentication is required");
    const admin = await db.user.findUnique({ where: { id: adminId }, select: { role: true } });
    if (!admin) return failure("UNAUTHENTICATED", 401, "Authentication is no longer valid");
    if (admin.role !== Role.ADMIN) return failure("FORBIDDEN", 403, "Administrator authorization is required");
    const application = await db.operatorApplication.findUnique({ where: { id: applicationId }, select: adminApplicationSelect });
    return application ? { ok: true as const, value: application } : failure("APPLICATION_NOT_FOUND", 404, "Operator application not found");
  } catch (error) {
    console.error("Unexpected Operator application query failure", { operation: "get-admin", userId: adminId, applicationId }, error);
    return failure("INTERNAL_INVARIANT_FAILURE", 500, "Operator application could not be loaded");
  }
}

function translatePromotionFailure(error: RoleTransitionAbort): never {
  if (error.failure.code === "INVALID_CURRENT_ROLE" || error.failure.code === "TARGET_NOT_FOUND") abort("APPLICANT_NOT_VIEWER", 409, "Applicant is no longer a Viewer");
  if (error.failure.code === "UNFINISHED_VIEWER_OBLIGATION") abort("UNFINISHED_VIEWER_OBLIGATION", 409, error.failure.error);
  if (error.failure.code === "UNAUTHORIZED" || error.failure.code === "ACTOR_NOT_FOUND") abort("UNAUTHENTICATED", 401, "Administrator authentication is no longer valid");
  if (error.failure.code === "FORBIDDEN" || error.failure.code === "SELF_TRANSITION_FORBIDDEN") abort("FORBIDDEN", 403, error.failure.error);
  abort("INTERNAL_INVARIANT_FAILURE", 500, "Applicant promotion could not be completed");
}

export async function reviewOperatorApplication(
  db: Database,
  adminId: string | null | undefined,
  applicationId: string,
  body: Record<string, unknown>,
  now = new Date()
): Promise<OperatorApplicationResult<{ application: Prisma.OperatorApplicationGetPayload<object>; roleTransition: RoleTransitionSuccess | null }>> {
  const input = validateOperatorApplicationReview(body);
  if (!input.ok) return input;
  return runSerializable(db, "review", { userId: adminId, applicationId }, async tx => {
    const admin = await requireRole(tx, adminId, Role.ADMIN);
    const application = await tx.operatorApplication.findUnique({ where: { id: applicationId }, select: { id: true, applicantId: true, status: true } });
    if (!application) abort("APPLICATION_NOT_FOUND", 404, "Operator application not found");
    if (application.status !== OperatorApplicationStatus.PENDING) abort("APPLICATION_NOT_PENDING", 409, "Operator application is no longer pending");

    const changed = await tx.operatorApplication.updateMany({
      where: { id: application.id, status: OperatorApplicationStatus.PENDING },
      data: { status: input.value.decision, reviewedById: admin.id, reviewedAt: now, reviewNote: input.value.reviewNote },
    });
    if (changed.count !== 1) abort("APPLICATION_NOT_PENDING", 409, "Operator application is no longer pending");

    let roleTransition: RoleTransitionSuccess | null = null;
    if (input.value.decision === OperatorApplicationStatus.APPROVED) {
      try {
        roleTransition = await assignViewerAsOperatorInTransaction(tx, admin.id, application.applicantId, {
          allowPendingOperatorApplication: true,
          forcePendingPilotStatus: true,
        });
      } catch (error) {
        if (error instanceof RoleTransitionAbort) translatePromotionFailure(error);
        throw error;
      }
    }
    const reviewed = await tx.operatorApplication.findUniqueOrThrow({ where: { id: application.id } });
    return { application: reviewed, roleTransition };
  });
}
