import { safeSupportingUrl, type ApplicationStatus, type ViewerApplication } from "./operator-application-ui";

export const ADMIN_APPLICATION_STATUSES = ["ALL", "PENDING", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
export type AdminStatusFilter = typeof ADMIN_APPLICATION_STATUSES[number];
export type AdminApplication = ViewerApplication & { applicant: { id: string; name: string | null; role: string } | null; reviewer: { id: string; name: string | null } | null };
export type QueueResult = { applications: AdminApplication[]; page: number; limit: number; hasNext: boolean };
export type ReviewDecision = "APPROVED" | "REJECTED";

export function normalizeQueueState(status: string, page: number, pageSize: number) {
  const safeStatus = ADMIN_APPLICATION_STATUSES.includes(status as AdminStatusFilter) ? status as AdminStatusFilter : "ALL";
  return { status: safeStatus, page: Number.isInteger(page) && page > 0 && page <= 1000 ? page : 1, pageSize: Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 50 ? pageSize : 20 };
}
export function queueUrl(status: AdminStatusFilter, page: number, pageSize: number) { const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); if (status !== "ALL") query.set("status", status); return `/api/admin/operator-applications?${query}`; }
export function reviewPayload(decision: ReviewDecision, reviewNote: string) { return { decision, reviewNote }; }
export function validateReview(decision: string, reviewNote: unknown) { const errors: { decision?: string; reviewNote?: string } = {}; if (decision !== "APPROVED" && decision !== "REJECTED") errors.decision = "Choose approval or rejection."; if (typeof reviewNote !== "string" || reviewNote.trim().length > 1000) errors.reviewNote = "Administrator feedback must be no longer than 1,000 characters."; return errors; }
const messages: Record<string, string> = {
  VALIDATION_FAILED: "Check the review details.", APPLICATION_NOT_FOUND: "This application is no longer available.",
  APPLICATION_NOT_PENDING: "Another action changed this application. The latest status has been loaded.", APPLICANT_NOT_VIEWER: "The applicant is no longer a Viewer and cannot be approved.",
  UNFINISHED_VIEWER_OBLIGATION: "Approval cannot be completed while the applicant has an outstanding Viewer obligation.", SERIALIZATION_RETRY_EXHAUSTED: "The application changed repeatedly. Refresh and try again.",
  INTERNAL_INVARIANT_FAILURE: "The review could not be completed. Please try again.", UNAUTHENTICATED: "Your administrator session has expired.", FORBIDDEN: "You are not permitted to review Operator applications.",
};
async function decoded(response: Response) { if (!response.headers.get("content-type")?.includes("application/json")) return null; try { return await response.json() as unknown; } catch { return null; } }
function codeOf(body: unknown) { return body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : null; }
function safeError(code: string | null, fallback: string) { return code ? messages[code] ?? fallback : fallback; }
function validQueue(body: unknown): body is QueueResult { return Boolean(body && typeof body === "object" && "applications" in body && Array.isArray(body.applications) && "page" in body && typeof body.page === "number" && "limit" in body && typeof body.limit === "number" && "hasNext" in body && typeof body.hasNext === "boolean"); }
function validDetail(body: unknown): body is { application: AdminApplication } { return Boolean(body && typeof body === "object" && "application" in body && body.application && typeof body.application === "object" && "id" in body.application && typeof body.application.id === "string" && "status" in body.application && ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"].includes(String(body.application.status))); }

export function createAdminOperatorApplicationController(fetcher: typeof fetch) {
  const reviewing = new Set<string>();
  return {
    isReviewing: (id: string) => reviewing.has(id),
    async queue(status: AdminStatusFilter, page: number, pageSize: number) { try { const response = await fetcher(queueUrl(status, page, pageSize), { cache: "no-store" }); const body = await decoded(response); if (!response.ok) { const code = codeOf(body); return { kind: "error" as const, status: response.status, message: safeError(code, "Applications could not be loaded.") }; } if (!validQueue(body)) return { kind: "error" as const, status: response.status, message: "The application queue response could not be verified." }; return { kind: "success" as const, value: body }; } catch { return { kind: "error" as const, status: 0, message: "Applications could not be loaded." }; } },
    async detail(id: string) { try { const response = await fetcher(`/api/admin/operator-applications/${id}`, { cache: "no-store" }); const body = await decoded(response); if (!response.ok) { const code = codeOf(body); return { kind: "error" as const, status: response.status, code, message: safeError(code, "The application could not be loaded.") }; } if (!validDetail(body)) return { kind: "error" as const, status: response.status, code: null, message: "The application response could not be verified." }; return { kind: "success" as const, value: body.application }; } catch { return { kind: "error" as const, status: 0, code: null, message: "The application could not be loaded." }; } },
    async review(id: string, decision: ReviewDecision, reviewNote: string, refreshDetail: () => Promise<void>, refreshQueue: () => Promise<void>) {
      if (reviewing.has(id)) return { kind: "busy" as const, message: "" }; reviewing.add(id);
      try { const response = await fetcher(`/api/admin/operator-applications/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reviewPayload(decision, reviewNote)) }); const body = await decoded(response);
        if (!response.ok) { const code = codeOf(body); if (["APPLICATION_NOT_PENDING", "APPLICANT_NOT_VIEWER", "APPLICATION_NOT_FOUND"].includes(code ?? "")) await Promise.all([refreshDetail(), refreshQueue()]); return { kind: "error" as const, code, message: safeError(code, "The review could not be completed. Please try again.") }; }
        if (!validDetail(body) || body.application.status !== decision) { await Promise.all([refreshDetail(), refreshQueue()]); return { kind: "error" as const, code: null, message: "The review response could not be verified. Authoritative data has been refreshed." }; }
        await Promise.all([refreshDetail(), refreshQueue()]); return { kind: "success" as const, message: decision === "APPROVED" ? "Application approved. The applicant is now an Operator with pilot approval still pending." : "Application rejected. The applicant’s role was not changed." };
      } catch { return { kind: "error" as const, code: null, message: "The review could not be completed. Please try again." }; } finally { reviewing.delete(id); }
    },
  };
}
export { safeSupportingUrl };
export function statusDate(application: AdminApplication) { return application.reviewedAt ?? application.withdrawnAt ?? application.submittedAt; }
export function applicantName(application: AdminApplication) { return application.applicant?.name?.trim() || "Unnamed applicant"; }
export type { ApplicationStatus };
