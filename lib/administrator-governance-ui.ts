export type AdministratorAction = "ASSIGN_ADMINISTRATOR" | "REMOVE_ADMINISTRATOR";

export const administratorGovernanceErrorMessages: Record<string, string> = {
  INVALID_TARGET_ID: "This participant reference is invalid. Refresh the list and try again.",
  UNSUPPORTED_CONTENT_TYPE: "The administrator request could not be sent. Refresh and try again.",
  INVALID_JSON: "The administrator request could not be read. Refresh and try again.",
  INVALID_REQUEST_BODY: "Only a governance reason may be submitted.",
  INVALID_REASON: "Enter a reason between 1 and 500 characters.",
  UNAUTHORIZED: "Your administrator session has expired. Sign in again to continue.",
  ACCOUNT_DEACTIVATED: "Your administrator account is deactivated. Contact another administrator.",
  ACTOR_NOT_FOUND: "Your administrator session is no longer valid. Sign in again to continue.",
  ACTOR_NOT_ACTIVE_ADMIN: "An active administrator account is required for this action.",
  SELF_GOVERNANCE_FORBIDDEN: "Administrators cannot change their own administrator role.",
  TARGET_NOT_FOUND: "This participant is no longer available. The list has been refreshed.",
  TARGET_INACTIVE: "A deactivated participant cannot be assigned as an administrator.",
  INVALID_CURRENT_ROLE: "This participant’s role changed or the request became stale. The list has been refreshed.",
  ACTIVE_ACCOUNT_OBLIGATION: "This participant has unfinished operational activity. Complete it before changing administrator status.",
  PENDING_OPERATOR_APPLICATION_EXISTS: "Resolve the pending Operator application before assigning administrator status.",
  LAST_ACTIVE_ADMIN: "The last active administrator cannot be removed.",
  SERIALIZATION_RETRY_EXHAUSTED: "Administrator governance changed concurrently. The list has been refreshed; please try again.",
  INTERNAL_INVARIANT_FAILURE: "Administrator governance could not be completed. Please try again.",
  INTERNAL_ERROR: "Administrator governance could not be completed. Please try again.",
};

const GENERIC_FAILURE = "Administrator governance could not be completed. Please try again.";
const REFRESH_CODES = new Set(["TARGET_NOT_FOUND", "INVALID_CURRENT_ROLE", "SERIALIZATION_RETRY_EXHAUSTED"]);

function endpoint(reference: string) { return `/api/admin/participants/${reference}/administrator`; }
function request(action: AdministratorAction, reason: string): RequestInit {
  return { method: action === "ASSIGN_ADMINISTRATOR" ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) };
}
async function responseBody(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  try { const body: unknown = await response.json(); return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null; } catch { return null; }
}
function validParticipant(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const participant = value as Record<string, unknown>;
  return typeof participant.reference === "string" && typeof participant.displayName === "string" &&
    ["VIEWER", "OPERATOR", "ADMIN"].includes(String(participant.role)) && ["ACTIVE", "DEACTIVATED"].includes(String(participant.accountStatus)) &&
    typeof participant.isCurrentAdmin === "boolean" && typeof participant.canAssignAdministrator === "boolean" && typeof participant.canRemoveAdministrator === "boolean" &&
    !("clerkId" in participant) && !("activeTripId" in participant) && !("pendingOfferTripId" in participant);
}

type SubmitInput = { reference: string; displayName: string; action: AdministratorAction; reason: string; refresh: () => Promise<unknown> };
export function createAdministratorGovernanceController(fetcher: typeof fetch) {
  const pending = new Set<string>();
  return {
    isPending(reference: string) { return pending.has(reference); },
    async submit(input: SubmitInput): Promise<{ kind: "success" | "error" | "unauthorized" | "busy"; message: string }> {
      if (pending.has(input.reference)) return { kind: "busy", message: "" };
      const reason = input.reason.trim().replace(/\s+/g, " ");
      if (!reason || reason.length > 500) return { kind: "error", message: administratorGovernanceErrorMessages.INVALID_REASON };
      pending.add(input.reference);
      try {
        const response = await fetcher(endpoint(input.reference), request(input.action, reason));
        const body = await responseBody(response);
        if (!response.ok) {
          const code = typeof body?.code === "string" ? body.code : null;
          if (code && REFRESH_CODES.has(code)) await input.refresh();
          return { kind: response.status === 401 ? "unauthorized" : "error", message: code ? administratorGovernanceErrorMessages[code] ?? GENERIC_FAILURE : GENERIC_FAILURE };
        }
        if (!validParticipant(body?.participant)) { await input.refresh(); return { kind: "error", message: "The updated participant could not be verified. The list has been refreshed." }; }
        await input.refresh();
        return { kind: "success", message: input.action === "ASSIGN_ADMINISTRATOR" ? `${input.displayName} is now an Administrator.` : `${input.displayName} is now a Viewer and is not an Operator.` };
      } catch { return { kind: "error", message: GENERIC_FAILURE }; }
      finally { pending.delete(input.reference); }
    },
  };
}
