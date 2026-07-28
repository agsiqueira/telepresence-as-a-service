import "server-only";

import { OperatorApplicationStatus, Role, type User } from "@prisma/client";
import { db } from "./db";
import { getCurrentUser } from "./current-user";
import {
  OPERATOR_APPLICATION_MAX_LIMIT,
  getAdminOperatorApplication,
  listAdminOperatorApplications,
  listViewerOperatorApplications,
  reviewOperatorApplication,
  submitOperatorApplication,
  withdrawOperatorApplication,
  type OperatorApplicationFailure,
  type OperatorApplicationFailureCode,
} from "./operator-applications";

type CurrentUser = Pick<User, "id" | "role">;
type GetUser = () => Promise<CurrentUser | null>;
type Operation = "viewer-list" | "viewer-submit" | "viewer-withdraw" | "admin-list" | "admin-detail" | "admin-review";
type RouteContext = { params: { id?: string } };

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const operatorApplicationPublicFailures = {
  UNAUTHENTICATED: { status: 401, message: "Authentication is required" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  VALIDATION_FAILED: { status: 400, message: "Check the Operator application details" },
  PENDING_APPLICATION_EXISTS: { status: 409, message: "A pending Operator application already exists" },
  APPLICATION_NOT_FOUND: { status: 404, message: "Operator application not found" },
  APPLICATION_NOT_OWNED: { status: 404, message: "Operator application not found" },
  APPLICATION_NOT_PENDING: { status: 409, message: "Operator application is no longer pending" },
  APPLICANT_NOT_VIEWER: { status: 409, message: "Applicant is no longer a Viewer" },
  UNFINISHED_VIEWER_OBLIGATION: { status: 409, message: "Applicant has unfinished Viewer activity" },
  SERIALIZATION_RETRY_EXHAUSTED: { status: 409, message: "Application state changed repeatedly; try again" },
  INTERNAL_INVARIANT_FAILURE: { status: 500, message: "Operator application operation could not be completed" },
} satisfies Record<OperatorApplicationFailureCode, { status: number; message: string }>;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function serviceFailure(result: OperatorApplicationFailure) {
  const mapped = operatorApplicationPublicFailures[result.code];
  return json({ error: mapped.message, code: result.code }, mapped.status);
}

function ownFailure(error: string, code: string, status: number) {
  return json({ error, code }, status);
}

function validId(value: string | undefined): value is string {
  return typeof value === "string" && value === value.trim() && ID_PATTERN.test(value);
}

async function objectBody(request: Request): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, response: ownFailure("Request body must be a JSON object", "INVALID_REQUEST_BODY", 400) };
    return { ok: true, value: value as Record<string, unknown> };
  } catch {
    return { ok: false, response: ownFailure("Request body must contain valid JSON", "INVALID_JSON", 400) };
  }
}

function projectViewerApplication(value: Record<string, unknown>) {
  return {
    id: value.id,
    qualifications: value.qualifications,
    relevantExperience: value.relevantExperience,
    languages: value.languages,
    availability: value.availability,
    supportingUrl: value.supportingUrl,
    additionalNote: value.additionalNote,
    status: value.status,
    reviewNote: value.reviewNote,
    submittedAt: value.submittedAt,
    reviewedAt: value.reviewedAt,
    withdrawnAt: value.withdrawnAt,
    updatedAt: value.updatedAt,
  };
}

function projectAdminApplication(value: Record<string, unknown>) {
  const applicant = value.applicant && typeof value.applicant === "object" ? value.applicant as Record<string, unknown> : null;
  const reviewer = value.reviewer && typeof value.reviewer === "object" ? value.reviewer as Record<string, unknown> : null;
  return {
    ...projectViewerApplication(value),
    applicant: applicant ? { id: applicant.id, name: applicant.name, role: applicant.role } : null,
    reviewer: reviewer ? { id: reviewer.id, name: reviewer.name } : null,
  };
}

function routeFailure(operation: Operation, applicationId: string | undefined, error: unknown) {
  console.error("Unexpected Operator application request failure", { operation, ...(applicationId ? { applicationId } : {}) }, error);
  return ownFailure("Operator application request could not be completed", "INTERNAL_ERROR", 500);
}

function authorize(user: CurrentUser | null, role: Role) {
  if (!user) return ownFailure("Authentication is required", "UNAUTHENTICATED", 401);
  if (user.role !== role) return ownFailure("Forbidden", "FORBIDDEN", 403);
  return null;
}

type ViewerDependencies = {
  getUser: GetUser;
  list: typeof listViewerOperatorApplications;
  submit: typeof submitOperatorApplication;
};

export function createViewerOperatorApplicationHandlers(overrides: Partial<ViewerDependencies> = {}) {
  const dependencies: ViewerDependencies = { getUser: getCurrentUser, list: listViewerOperatorApplications, submit: submitOperatorApplication, ...overrides };
  return {
    GET: async () => {
      try {
        const user = await dependencies.getUser();
        const denied = authorize(user, Role.VIEWER); if (denied) return denied;
        const result = await dependencies.list(db, user!.id);
        if (!result.ok) return serviceFailure(result);
        return json({ applications: result.value.map(value => projectViewerApplication(value as unknown as Record<string, unknown>)) });
      } catch (error) { return routeFailure("viewer-list", undefined, error); }
    },
    POST: async (request: Request) => {
      try {
        const user = await dependencies.getUser();
        const denied = authorize(user, Role.VIEWER); if (denied) return denied;
        const body = await objectBody(request); if (!body.ok) return body.response;
        const result = await dependencies.submit(db, user!.id, body.value);
        if (!result.ok) return serviceFailure(result);
        return json({ application: projectViewerApplication(result.value as unknown as Record<string, unknown>) }, 201);
      } catch (error) { return routeFailure("viewer-submit", undefined, error); }
    },
  };
}

type WithdrawDependencies = { getUser: GetUser; withdraw: typeof withdrawOperatorApplication };
export function createViewerOperatorApplicationWithdrawHandler(overrides: Partial<WithdrawDependencies> = {}) {
  const dependencies: WithdrawDependencies = { getUser: getCurrentUser, withdraw: withdrawOperatorApplication, ...overrides };
  return async function POST(request: Request, { params }: RouteContext) {
    try {
      const user = await dependencies.getUser();
      const denied = authorize(user, Role.VIEWER); if (denied) return denied;
      if (!validId(params.id)) return ownFailure("Invalid Operator application ID", "INVALID_APPLICATION_ID", 400);
      if (request.body !== null) return ownFailure("Request body must be empty", "INVALID_REQUEST_BODY", 400);
      const result = await dependencies.withdraw(db, user!.id, params.id);
      if (!result.ok) return serviceFailure(result);
      return json({ application: projectViewerApplication(result.value as unknown as Record<string, unknown>) });
    } catch (error) { return routeFailure("viewer-withdraw", params.id, error); }
  };
}

type AdminListDependencies = { getUser: GetUser; list: typeof listAdminOperatorApplications };
export function createAdminOperatorApplicationListHandler(overrides: Partial<AdminListDependencies> = {}) {
  const dependencies: AdminListDependencies = { getUser: getCurrentUser, list: listAdminOperatorApplications, ...overrides };
  return async function GET(request: Request) {
    try {
      const user = await dependencies.getUser();
      const denied = authorize(user, Role.ADMIN); if (denied) return denied;
      const parameters = new URL(request.url).searchParams;
      const allowed = new Set(["status", "page", "pageSize"]);
      if ([...parameters.keys()].some(key => !allowed.has(key)) || [...allowed].some(key => parameters.getAll(key).length > 1)) return ownFailure("Unsupported application filter", "INVALID_QUERY", 400);
      const statusValue = parameters.get("status");
      const status = statusValue === null ? undefined : Object.values(OperatorApplicationStatus).find(value => value === statusValue);
      if (statusValue !== null && !status) return ownFailure("Invalid application status", "INVALID_STATUS", 400);
      const pageValue = parameters.get("page");
      const pageSizeValue = parameters.get("pageSize");
      if (pageValue !== null && !/^[1-9]\d*$/.test(pageValue)) return ownFailure("Page must be a positive integer", "INVALID_PAGE", 400);
      if (pageSizeValue !== null && !/^[1-9]\d*$/.test(pageSizeValue)) return ownFailure("Page size must be a positive integer", "INVALID_PAGE_SIZE", 400);
      const page = pageValue === null ? undefined : Number(pageValue);
      const limit = pageSizeValue === null ? undefined : Number(pageSizeValue);
      if (limit !== undefined && limit > OPERATOR_APPLICATION_MAX_LIMIT) return ownFailure(`Page size must not exceed ${OPERATOR_APPLICATION_MAX_LIMIT}`, "INVALID_PAGE_SIZE", 400);
      const result = await dependencies.list(db, user!.id, { status, page, limit });
      if (!result.ok) return serviceFailure(result);
      return json({ ...result.value, applications: result.value.applications.map(value => projectAdminApplication(value as unknown as Record<string, unknown>)) });
    } catch (error) { return routeFailure("admin-list", undefined, error); }
  };
}

type AdminDetailDependencies = { getUser: GetUser; get: typeof getAdminOperatorApplication };
export function createAdminOperatorApplicationDetailHandler(overrides: Partial<AdminDetailDependencies> = {}) {
  const dependencies: AdminDetailDependencies = { getUser: getCurrentUser, get: getAdminOperatorApplication, ...overrides };
  return async function GET(_request: Request, { params }: RouteContext) {
    try {
      const user = await dependencies.getUser();
      const denied = authorize(user, Role.ADMIN); if (denied) return denied;
      if (!validId(params.id)) return ownFailure("Invalid Operator application ID", "INVALID_APPLICATION_ID", 400);
      const result = await dependencies.get(db, user!.id, params.id);
      if (!result.ok) return serviceFailure(result);
      return json({ application: projectAdminApplication(result.value as unknown as Record<string, unknown>) });
    } catch (error) { return routeFailure("admin-detail", params.id, error); }
  };
}

type AdminReviewDependencies = { getUser: GetUser; review: typeof reviewOperatorApplication };
export function createAdminOperatorApplicationReviewHandler(overrides: Partial<AdminReviewDependencies> = {}) {
  const dependencies: AdminReviewDependencies = { getUser: getCurrentUser, review: reviewOperatorApplication, ...overrides };
  return async function POST(request: Request, { params }: RouteContext) {
    try {
      const user = await dependencies.getUser();
      const denied = authorize(user, Role.ADMIN); if (denied) return denied;
      if (!validId(params.id)) return ownFailure("Invalid Operator application ID", "INVALID_APPLICATION_ID", 400);
      const body = await objectBody(request); if (!body.ok) return body.response;
      const result = await dependencies.review(db, user!.id, params.id, body.value);
      if (!result.ok) return serviceFailure(result);
      return json({
        application: projectViewerApplication(result.value.application as unknown as Record<string, unknown>),
        roleTransition: result.value.roleTransition ? { previousRole: result.value.roleTransition.value.previousRole, newRole: result.value.roleTransition.value.newRole } : null,
      });
    } catch (error) { return routeFailure("admin-review", params.id, error); }
  };
}
