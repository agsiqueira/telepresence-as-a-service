import "server-only";

import { Role } from "@prisma/client";
import { deactivateAccount, reactivateAccount, type AccountLifecycleResult } from "@/lib/account-lifecycle";
import { authorizeApiUser } from "@/lib/current-user";
import { db } from "@/lib/db";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };
type Operation = "deactivate" | "reactivate";

function json(body: unknown, status: number) { return Response.json(body, { status, headers: NO_STORE }); }

function mapResult(result: AccountLifecycleResult) {
  if (result.ok) return json({ account: { reference: result.value.targetId, accountStatus: result.value.newStatus, deactivatedAt: result.value.deactivatedAt } }, 200);
  const conflictCodes = new Set(["SELF_DEACTIVATION_FORBIDDEN", "LAST_ACTIVE_ADMIN", "ACTIVE_ACCOUNT_OBLIGATION", "ACCOUNT_ALREADY_ACTIVE", "ACCOUNT_ALREADY_DEACTIVATED"]);
  const status = conflictCodes.has(result.code) ? 409 : result.status;
  return json({ error: result.error, code: result.code }, status);
}

export function createAccountLifecycleHandler(operation: Operation, transition = operation === "deactivate" ? deactivateAccount : reactivateAccount) {
  return async function POST(request: Request, { params }: { params: { reference?: string } }) {
    try {
      const access = await authorizeApiUser(Role.ADMIN); if (!access.ok) return access.response;
      const targetId = params.reference;
      if (!targetId || targetId !== targetId.trim() || !ID_PATTERN.test(targetId)) return json({ error: "Invalid participant ID", code: "INVALID_TARGET_ID" }, 400);
      const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "application/json") return json({ error: "Content-Type must be application/json", code: "UNSUPPORTED_CONTENT_TYPE" }, 400);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "Request body must contain valid JSON", code: "INVALID_JSON" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("reason" in body)) return json({ error: "Request body must contain only a reason", code: "INVALID_REQUEST_BODY" }, 400);
      return mapResult(await transition(db, access.user.id, targetId, (body as { reason?: unknown }).reason));
    } catch (error) {
      console.error("Unexpected account lifecycle request failure", { operation, targetId: params.reference }, error);
      return json({ error: "Account lifecycle could not be updated", code: "INTERNAL_ERROR" }, 500);
    }
  };
}
