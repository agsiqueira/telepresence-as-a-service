"use client";

import { useEffect, useRef, useState } from "react";
import { cycleDialogFocus } from "@/lib/admin-role-ui";

const categories = [
  ["HARASSMENT", "Harassment"],
  ["DISCRIMINATION", "Discrimination"],
  ["THREATENING_BEHAVIOR", "Threatening behavior"],
  ["UNSAFE_CONDUCT", "Unsafe conduct"],
  ["PROPERTY_OR_PRIVACY_CONCERN", "Property or privacy concern"],
  ["OTHER", "Other"],
] as const;
const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export default function SafetyReportDialog({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [narrative, setNarrative] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"" | "submitted" | "duplicate">("");
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  const lock = useRef(false);

  useEffect(() => { if (open) first.current?.focus(); }, [open]);

  function resetAndClose() {
    if (pending) return;
    setOpen(false); setCategory(""); setSeverity(""); setNarrative(""); setError("");
    requestAnimationFrame(() => trigger.current?.focus());
  }

  async function submit() {
    const trimmed = narrative.trim();
    if (!category || !severity || trimmed.length < 10 || trimmed.length > 2000) {
      setError("Choose a category and severity and provide 10 to 2,000 meaningful characters."); return;
    }
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    try {
      const response = await fetch(`/api/trips/${tripId}/safety-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, severity, narrative }),
      });
      const body = await response.json().catch(() => null);
      if (response.ok || body?.code === "SAFETY_REPORT_ALREADY_SUBMITTED") {
        setOutcome(response.ok ? "submitted" : "duplicate");
        setOpen(false); setNarrative(""); setCategory(""); setSeverity("");
        requestAnimationFrame(() => trigger.current?.focus()); return;
      }
      if (body?.code === "INVALID_SAFETY_REPORT") setError("Check the category, severity, and description.");
      else if (body?.code === "JOURNEY_NOT_FOUND" || body?.code === "JOURNEY_REPORT_UNSUPPORTED") setError("A safety report cannot be submitted for this Journey.");
      else setError("The safety report could not be submitted. Please try again.");
    } catch { setError("The safety report could not be submitted. Please try again."); }
    finally { lock.current = false; setPending(false); }
  }

  return <>
    {outcome
      ? <p className="mt-3 text-sm" role="status" aria-live="polite">{outcome === "duplicate" ? "You have already submitted a safety report for this Journey." : "Your safety report was submitted."}</p>
      : <button ref={trigger} type="button" onClick={() => setOpen(true)} className="mt-3 min-h-11 rounded-lg border border-red-700 px-4 font-semibold text-red-800 focus-visible:ring-2">Report a safety concern</button>}
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onKeyDown={event => {
      if (event.key === "Escape") resetAndClose();
      if (event.key === "Tab" && dialog.current) {
        const elements = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
        cycleDialogFocus(event.nativeEvent, elements, elements.indexOf(document.activeElement as HTMLElement));
      }
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`safety-title-${tripId}`} aria-describedby={`safety-guidance-${tripId}`} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <h2 id={`safety-title-${tripId}`} className="text-xl font-semibold">Report a safety concern</h2>
        <div id={`safety-guidance-${tripId}`} className="mt-2 space-y-2 text-sm text-gray-700">
          <p>This confidential report is for safety concerns involving the other participant in this Journey. They will not be notified through this feature.</p>
          <p>Submitted reports cannot currently be viewed, edited, or withdrawn by participants.</p>
          <p className="font-medium">This is not an emergency service. If someone is in immediate danger, contact local emergency services.</p>
        </div>
        <label className="mt-4 block font-medium" htmlFor={`safety-category-${tripId}`}>Category</label>
        <select ref={first} id={`safety-category-${tripId}`} value={category} onChange={event => setCategory(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 focus-visible:ring-2"><option value="">Choose a category</option>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="mt-4 block font-medium" htmlFor={`safety-severity-${tripId}`}>Severity</label>
        <select id={`safety-severity-${tripId}`} value={severity} onChange={event => setSeverity(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3 focus-visible:ring-2"><option value="">Choose severity</option>{severities.map(value => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}</select>
        <p className="mt-1 text-xs text-gray-600">Severity provides context only. It does not automatically contact emergency services or trigger immediate intervention.</p>
        <label className="mt-4 block font-medium" htmlFor={`safety-narrative-${tripId}`}>Describe the concern</label>
        <textarea id={`safety-narrative-${tripId}`} required minLength={10} maxLength={2000} value={narrative} onChange={event => setNarrative(event.target.value)} aria-describedby={`safety-count-${tripId}${error ? ` safety-error-${tripId}` : ""}`} className="mt-1 min-h-32 w-full resize-y rounded-lg border px-3 py-2 focus-visible:ring-2" />
        <p id={`safety-count-${tripId}`} className="mt-1 text-xs text-gray-600">{narrative.length}/2,000 characters</p>
        {error && <p id={`safety-error-${tripId}`} role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={() => void submit()} className="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white disabled:opacity-50">{pending ? "Submitting…" : "Submit confidential report"}</button><button type="button" disabled={pending} onClick={resetAndClose} className="min-h-11 rounded-lg border px-4 disabled:opacity-50">Cancel</button></div>
        <span className="sr-only" role="status" aria-live="polite">{pending ? "Submitting safety report" : ""}</span>
      </div>
    </div>}
  </>;
}
