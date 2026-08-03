import { ALLOWED_LANGUAGES } from "./marketplace-vocabulary";

export type ApplicationStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
export type ViewerApplication = {
  id: string; qualifications: string; relevantExperience: string; languages: string[];
  availability: string; supportingUrl: string | null; additionalNote: string | null;
  status: ApplicationStatus; reviewNote: string | null; submittedAt: string;
  reviewedAt: string | null; withdrawnAt: string | null; updatedAt: string;
};
export type ApplicationForm = { qualifications: string; relevantExperience: string; languages: string[]; availability: string; supportingUrl: string; additionalNote: string };
export type FieldErrors = Partial<Record<keyof ApplicationForm, string>>;
export const emptyApplicationForm = (): ApplicationForm => ({ qualifications: "", relevantExperience: "", languages: [], availability: "", supportingUrl: "", additionalNote: "" });
export const statusCopy: Record<ApplicationStatus, { label: string; next: string }> = {
  PENDING: { label: "Pending", next: "Your application is awaiting administrator review. You may withdraw it while it remains pending." },
  APPROVED: { label: "Approved", next: "Your application was approved and your account now has Teleporter access." },
  REJECTED: { label: "Rejected", next: "You may review the feedback and submit a new application if you remain an Explorer." },
  WITHDRAWN: { label: "Withdrawn", next: "This application remains in your history. You may submit a new application." },
};

export function validateApplicationForm(form: ApplicationForm): FieldErrors {
  const errors: FieldErrors = {};
  const bounded = (key: "qualifications" | "relevantExperience", label: string) => {
    const length = form[key].trim().length;
    if (length < 20 || length > 2000) errors[key] = `${label} must be between 20 and 2,000 characters.`;
  };
  bounded("qualifications", "Qualifications"); bounded("relevantExperience", "Relevant experience");
  const availabilityLength = form.availability.trim().length;
  if (availabilityLength < 10 || availabilityLength > 1000) errors.availability = "Availability must be between 10 and 1,000 characters.";
  const uniqueLanguages = new Set(form.languages);
  if (uniqueLanguages.size !== form.languages.length || uniqueLanguages.size < 1 || uniqueLanguages.size > 4 || form.languages.some(value => !ALLOWED_LANGUAGES.includes(value as typeof ALLOWED_LANGUAGES[number]))) errors.languages = "Choose 1 to 4 available languages.";
  if (form.supportingUrl) {
    try { const url = new URL(form.supportingUrl); if (url.protocol !== "https:" || form.supportingUrl.length > 500) throw new Error(); }
    catch { errors.supportingUrl = "Enter an HTTPS URL no longer than 500 characters."; }
  }
  if (form.additionalNote.trim().length > 1000) errors.additionalNote = "Additional note must be no longer than 1,000 characters.";
  return errors;
}

export function submissionPayload(form: ApplicationForm) {
  return { qualifications: form.qualifications, relevantExperience: form.relevantExperience, languages: [...new Set(form.languages)], availability: form.availability, supportingUrl: form.supportingUrl, additionalNote: form.additionalNote };
}
const safeMessages: Record<string, string> = {
  VALIDATION_FAILED: "Check the highlighted application details.", PENDING_APPLICATION_EXISTS: "You already have a pending application.",
  APPLICATION_NOT_FOUND: "This application is no longer available.", APPLICATION_NOT_PENDING: "This application’s status changed and it can no longer be withdrawn.",
  APPLICANT_NOT_VIEWER: "Only Viewer accounts can submit or withdraw applications.", UNFINISHED_VIEWER_OBLIGATION: "Complete your unfinished Viewer activity before this application can be approved.",
  SERIALIZATION_RETRY_EXHAUSTED: "The application changed repeatedly. Please try again.",
};
async function responseCode(response: Response) { if (!response.headers.get("content-type")?.includes("application/json")) return null; try { const body: unknown = await response.json(); return body && typeof body === "object" && "code" in body && typeof body.code === "string" ? body.code : null; } catch { return null; } }
export function safeApplicationError(code: string | null, fallback: string) { return code ? safeMessages[code] ?? fallback : fallback; }

export function createOperatorApplicationController(fetcher: typeof fetch) {
  let submitting = false; const withdrawing = new Set<string>();
  return {
    isSubmitting: () => submitting, isWithdrawing: (id: string) => withdrawing.has(id),
    async submit(form: ApplicationForm, refresh: () => Promise<void>) {
      if (submitting) return { kind: "busy" as const, message: "" }; submitting = true;
      try { const response = await fetcher("/api/operator-applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submissionPayload(form)) });
        if (!response.ok) { const code = await responseCode(response); if (code === "PENDING_APPLICATION_EXISTS") await refresh(); return { kind: "error" as const, code, message: safeApplicationError(code, "The application could not be submitted. Please try again.") }; }
        await refresh(); return { kind: "success" as const, message: "Your Teleporter application was submitted." };
      } catch { return { kind: "error" as const, code: null, message: "The application could not be submitted. Please try again." }; } finally { submitting = false; }
    },
    async withdraw(id: string, refresh: () => Promise<void>) {
      if (withdrawing.has(id)) return { kind: "busy" as const, message: "" }; withdrawing.add(id);
      try { const response = await fetcher(`/api/operator-applications/${id}/withdraw`, { method: "POST" });
        if (!response.ok) { const code = await responseCode(response); if (code === "APPLICATION_NOT_PENDING") await refresh(); return { kind: "error" as const, code, message: safeApplicationError(code, "The application could not be withdrawn. Please try again.") }; }
        await refresh(); return { kind: "success" as const, message: "Your application was withdrawn." };
      } catch { return { kind: "error" as const, code: null, message: "The application could not be withdrawn. Please try again." }; } finally { withdrawing.delete(id); }
    },
  };
}

export function safeSupportingUrl(value: string | null) { if (!value) return null; try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }
