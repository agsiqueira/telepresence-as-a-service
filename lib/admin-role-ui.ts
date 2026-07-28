export type ParticipantRole = "VIEWER" | "OPERATOR" | "ADMIN";
export type AdminRoleAction = "ASSIGN_OPERATOR" | "RETURN_TO_VIEWER";

export const roleErrorMessages: Record<string, string> = {
  INVALID_TARGET_ID: "This participant reference is invalid. Refresh the list and try again.",
  INVALID_REQUEST_BODY: "The role-change request was rejected. Refresh the page and try again.",
  UNAUTHORIZED: "Your administrator session has expired. Sign in again to continue.",
  ACTOR_NOT_FOUND: "Your administrator session is no longer valid. Sign in again to continue.",
  FORBIDDEN: "You are not permitted to change this participant’s role.",
  SELF_TRANSITION_FORBIDDEN: "Administrators cannot change their own participant role.",
  TARGET_NOT_FOUND: "This participant is no longer available. The list has been refreshed.",
  INVALID_CURRENT_ROLE: "This participant’s role has already changed. The list has been refreshed.",
  UNFINISHED_VIEWER_OBLIGATION: "This Viewer cannot become an Operator until unfinished Viewer obligations are completed.",
  ACTIVE_OPERATOR_OBLIGATION: "This Operator cannot return to Viewer while active work or an outstanding offer remains.",
  SERIALIZATION_RETRY_EXHAUSTED: "The role change is temporarily unavailable. Please try again.",
  INTERNAL_INVARIANT_FAILURE: "The role change could not be completed. Please try again.",
  INTERNAL_ERROR: "The role change could not be completed. Please try again.",
};

const GENERIC_FAILURE = "The role change could not be completed. Please try again.";

export function roleActionFor(role: ParticipantRole): AdminRoleAction | null {
  if (role === "VIEWER") return "ASSIGN_OPERATOR";
  if (role === "OPERATOR") return "RETURN_TO_VIEWER";
  return null;
}

export function roleTransitionEndpoint(reference: string, action: AdminRoleAction) {
  const path = action === "ASSIGN_OPERATOR" ? "assign-operator" : "return-to-viewer";
  return `/api/admin/users/${reference}/${path}`;
}

export function roleTransitionRequest(): RequestInit {
  return { method: "POST" };
}

export function canCancelRoleDialog(pending: boolean) {
  return !pending;
}

async function responseCode(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) return null;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "code" in body && typeof body.code === "string") return body.code;
  } catch {}
  return null;
}

async function validTransitionResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) return false;
  try {
    const body: unknown = await response.json();
    return Boolean(body && typeof body === "object" &&
      "targetId" in body && typeof body.targetId === "string" &&
      "previousRole" in body && (body.previousRole === "VIEWER" || body.previousRole === "OPERATOR") &&
      "newRole" in body && (body.newRole === "VIEWER" || body.newRole === "OPERATOR") &&
      "auditId" in body && typeof body.auditId === "string");
  } catch { return false; }
}

type SubmitInput = {
  reference: string;
  displayName: string;
  action: AdminRoleAction;
  refresh: () => Promise<unknown>;
};

export function createAdminRoleChangeController(fetcher: typeof fetch) {
  const pending = new Set<string>();
  return {
    isPending(reference: string) { return pending.has(reference); },
    async submit(input: SubmitInput): Promise<{ kind: "success" | "error" | "unauthorized" | "busy"; message: string }> {
      if (pending.has(input.reference)) return { kind: "busy", message: "" };
      pending.add(input.reference);
      try {
        const response = await fetcher(roleTransitionEndpoint(input.reference, input.action), roleTransitionRequest());
        if (!response.ok) {
          const code = await responseCode(response);
          if (code === "TARGET_NOT_FOUND" || code === "INVALID_CURRENT_ROLE") await input.refresh();
          return {
            kind: response.status === 401 ? "unauthorized" : "error",
            message: code ? roleErrorMessages[code] ?? GENERIC_FAILURE : GENERIC_FAILURE,
          };
        }
        if (!await validTransitionResponse(response)) {
          await input.refresh();
          return { kind: "error", message: "The role change response could not be verified. Refresh the participant list before trying again." };
        }
        await input.refresh();
        return {
          kind: "success",
          message: input.action === "ASSIGN_OPERATOR"
            ? `${input.displayName} is now an Operator. Approval and online availability are unchanged.`
            : `${input.displayName} is now a Viewer.`,
        };
      } catch {
        return { kind: "error", message: GENERIC_FAILURE };
      } finally {
        pending.delete(input.reference);
      }
    },
  };
}

export function cycleDialogFocus(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">,
  elements: readonly Pick<HTMLElement, "focus">[],
  activeIndex: number
) {
  if (event.key !== "Tab" || elements.length === 0) return false;
  const next = event.shiftKey
    ? (activeIndex <= 0 ? elements.length - 1 : activeIndex - 1)
    : (activeIndex >= elements.length - 1 ? 0 : activeIndex + 1);
  event.preventDefault();
  elements[next].focus();
  return true;
}
