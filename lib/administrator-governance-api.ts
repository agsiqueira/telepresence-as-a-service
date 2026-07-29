import "server-only";

import { AccountStatus, Role, type User } from "@prisma/client";
import { getAdminParticipant } from "@/lib/admin";
import { assignAdministrator, removeAdministrator, type AdministratorGovernanceFailureCode, type AdministratorGovernanceResult } from "@/lib/administrator-governance";
import { getCurrentPersistedUser } from "@/lib/current-user";
import { db } from "@/lib/db";

type Operation = "assign-administrator" | "remove-administrator";
type Governance = (database: typeof db, actorId: string, targetId: string, reason: unknown) => Promise<AdministratorGovernanceResult>;
type Dependencies = {
  getUser: () => Promise<Pick<User, "id" | "role" | "accountStatus"> | null>;
  govern: Governance;
  project: (targetId: string, actorId: string) => Promise<unknown | null>;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const publicFailures: Record<AdministratorGovernanceFailureCode, { status: number; message: string }> = {
  UNAUTHORIZED: { status: 401, message: "Authentication is required" },
  ACTOR_NOT_FOUND: { status: 401, message: "Authentication is no longer valid" },
  ACTOR_NOT_ACTIVE_ADMIN: { status: 403, message: "Active administrator authorization is required" },
  TARGET_NOT_FOUND: { status: 404, message: "Participant not found" },
  SELF_GOVERNANCE_FORBIDDEN: { status: 403, message: "Administrators cannot change their own administrator role" },
  TARGET_INACTIVE: { status: 409, message: "A deactivated participant cannot be assigned as an administrator" },
  INVALID_CURRENT_ROLE: { status: 409, message: "Participant role has changed; refresh and try again" },
  LAST_ACTIVE_ADMIN: { status: 409, message: "The last active administrator cannot be removed" },
  ACTIVE_ACCOUNT_OBLIGATION: { status: 409, message: "Participant has unfinished operational activity" },
  PENDING_OPERATOR_APPLICATION_EXISTS: { status: 409, message: "Resolve the pending Operator application before administrator assignment" },
  INVALID_REASON: { status: 400, message: "Reason must be between 1 and 500 characters" },
  SERIALIZATION_RETRY_EXHAUSTED: { status: 409, message: "Administrator governance changed concurrently; refresh and try again" },
  INTERNAL_INVARIANT_FAILURE: { status: 500, message: "Administrator governance could not be updated" },
};

function json(body: unknown, status: number) { return Response.json(body, { status, headers: NO_STORE }); }

export function createAdministratorGovernanceHandler(operation: Operation, overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    getUser: getCurrentPersistedUser,
    govern: operation === "assign-administrator" ? assignAdministrator : removeAdministrator,
    project: (targetId, actorId) => getAdminParticipant(db, targetId, actorId),
    ...overrides,
  };
  return async function handler(request: Request, { params }: { params: { reference?: string } }) {
    try {
      const actor = await dependencies.getUser();
      if (!actor) return json({ error: "Authentication is required", code: "UNAUTHORIZED" }, 401);
      if (actor.accountStatus !== AccountStatus.ACTIVE) return json({ error: "This account has been deactivated. Contact an administrator for assistance.", code: "ACCOUNT_DEACTIVATED" }, 403);
      if (actor.role !== Role.ADMIN) return json({ error: "Forbidden", code: "ACTOR_NOT_ACTIVE_ADMIN" }, 403);
      const targetId = params.reference;
      if (!targetId || targetId !== targetId.trim() || !ID_PATTERN.test(targetId)) return json({ error: "Invalid participant ID", code: "INVALID_TARGET_ID" }, 400);
      const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "application/json") return json({ error: "Content-Type must be application/json", code: "UNSUPPORTED_CONTENT_TYPE" }, 400);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "Request body must contain valid JSON", code: "INVALID_JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("reason" in body)) return json({ error: "Request body must contain only a reason", code: "INVALID_REQUEST_BODY" }, 400);
      const result = await dependencies.govern(db, actor.id, targetId, (body as { reason?: unknown }).reason);
      if (!result.ok) { const failure = publicFailures[result.code]; return json({ error: failure.message, code: result.code }, failure.status); }
      const participant = await dependencies.project(result.value.targetId, actor.id);
      if (!participant) return json({ error: "Participant projection could not be refreshed", code: "INTERNAL_ERROR" }, 500);
      return json({ participant }, 200);
    } catch (error) {
      console.error("Unexpected administrator governance request failure", { operation, targetId: params.reference }, error instanceof Error ? error.name : "UnknownError");
      return json({ error: "Administrator governance could not be updated", code: "INTERNAL_ERROR" }, 500);
    }
  };
}
