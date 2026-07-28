import "server-only";

import { Role, type User } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import {
  assignViewerAsOperator,
  returnOperatorToViewer,
  type RoleTransitionFailureCode,
  type RoleTransitionResult,
} from "@/lib/role-transitions";

type Operation = "assign-operator" | "return-to-viewer";
type Transition = (
  database: typeof db,
  actorId: string,
  targetId: string
) => Promise<RoleTransitionResult>;

type Dependencies = {
  getUser: () => Promise<Pick<User, "id" | "role"> | null>;
  transition: Transition;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const TARGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_EMPTY_BODY_PROBE_BYTES = 1024;

const publicFailures: Record<
  RoleTransitionFailureCode,
  { status: number; message: string }
> = {
  UNAUTHORIZED: { status: 401, message: "Authentication is required" },
  ACTOR_NOT_FOUND: { status: 401, message: "Authentication is no longer valid" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  SELF_TRANSITION_FORBIDDEN: { status: 403, message: "Self role changes are forbidden" },
  TARGET_NOT_FOUND: { status: 404, message: "Participant not found" },
  INVALID_CURRENT_ROLE: { status: 409, message: "Participant role has changed" },
  UNFINISHED_VIEWER_OBLIGATION: { status: 409, message: "Participant has unfinished Viewer activity" },
  ACTIVE_OPERATOR_OBLIGATION: { status: 409, message: "Participant has active Operator activity" },
  SERIALIZATION_RETRY_EXHAUSTED: { status: 503, message: "Role change is temporarily unavailable" },
  INTERNAL_INVARIANT_FAILURE: { status: 500, message: "Role change could not be completed" },
};

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

function validTargetId(value: string | undefined): value is string {
  return typeof value === "string" && value === value.trim() && TARGET_ID_PATTERN.test(value);
}

async function hasRequestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (Number.isFinite(parsed) && parsed > 0) return true;
    if (parsed === 0) return false;
    return true;
  }
  if (!request.body) return false;

  const reader = request.body.getReader();
  let inspected = 0;
  let reads = 0;
  try {
    while (inspected <= MAX_EMPTY_BODY_PROBE_BYTES && reads < 8) {
      const { done, value } = await reader.read();
      reads += 1;
      if (done) return false;
      inspected += value.byteLength;
      if (value.byteLength > 0) {
        void reader.cancel().catch(() => undefined);
        return true;
      }
    }
    void reader.cancel().catch(() => undefined);
    return true;
  } catch {
    return true;
  } finally {
    reader.releaseLock();
  }
}

export function createRoleTransitionHandler(
  operation: Operation,
  overrides: Partial<Dependencies> = {}
) {
  const defaultTransition =
    operation === "assign-operator" ? assignViewerAsOperator : returnOperatorToViewer;
  const dependencies: Dependencies = {
    getUser: getCurrentUser,
    transition: defaultTransition,
    ...overrides,
  };

  return async function POST(
    request: Request,
    { params }: { params: { id?: string } }
  ): Promise<Response> {
    try {
      const actor = await dependencies.getUser();
      if (!actor) return json({ error: "Authentication is required", code: "UNAUTHORIZED" }, 401);
      if (actor.role !== Role.ADMIN) return json({ error: "Forbidden", code: "FORBIDDEN" }, 403);

      if (!validTargetId(params.id)) {
        return json({ error: "Invalid target user ID", code: "INVALID_TARGET_ID" }, 400);
      }
      if (await hasRequestBody(request)) {
        return json({ error: "Request body must be empty", code: "INVALID_REQUEST_BODY" }, 400);
      }

      const result = await dependencies.transition(db, actor.id, params.id);
      if (!result.ok) {
        const failure = publicFailures[result.code];
        return json({ error: failure.message, code: result.code }, failure.status);
      }
      return json(result.value, 200);
    } catch {
      return json(
        { error: "Role change could not be completed", code: "INTERNAL_ERROR" },
        500
      );
    }
  };
}
