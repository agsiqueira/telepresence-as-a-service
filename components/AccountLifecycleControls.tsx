"use client";

import { useEffect, useRef, useState } from "react";
import { cycleDialogFocus } from "@/lib/admin-role-ui";
import { requireJsonResponse } from "@/lib/resilient-poller";

type Props = { reference: string; displayName: string; accountStatus: "ACTIVE" | "DEACTIVATED"; isCurrentAdmin: boolean; onChanged: () => Promise<unknown> };

export default function AccountLifecycleControls({ reference, displayName, accountStatus, isCurrentAdmin, onChanged }: Props) {
  const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [announcement, setAnnouncement] = useState("");
  const dialog = useRef<HTMLDivElement>(null); const trigger = useRef<HTMLButtonElement>(null); const confirm = useRef<HTMLButtonElement>(null);
  const operation = accountStatus === "ACTIVE" ? "deactivate" : "reactivate";
  useEffect(() => { if (open) confirm.current?.focus(); else trigger.current?.focus(); }, [open]);
  async function submit() {
    if (pending || !reason.trim() || reason.trim().length > 500) return;
    setPending(true); setError(""); setAnnouncement("");
    try {
      await requireJsonResponse(await fetch(`/api/admin/participants/${reference}/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }));
      setOpen(false); setReason(""); setAnnouncement(operation === "deactivate" ? "Account deactivated." : "Account reactivated."); await onChanged();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Account status could not be updated."); }
    finally { setPending(false); }
  }
  if (accountStatus === "ACTIVE" && isCurrentAdmin) return <span className="self-center text-sm text-gray-600">You cannot deactivate your own account.</span>;
  return <><button ref={trigger} disabled={pending} className={`min-h-11 rounded-lg border px-3 disabled:opacity-50 ${operation === "deactivate" ? "border-red-500 text-red-700" : ""}`} onClick={() => { setError(""); setReason(""); setAnnouncement(""); setOpen(true); }}>{operation === "deactivate" ? "Deactivate" : "Reactivate"}</button>{announcement && <span className="self-center text-sm text-green-800" role="status">{announcement}</span>}{open && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onKeyDown={event => { if (event.key === "Escape" && !pending) setOpen(false); if (event.key === "Tab" && dialog.current) { const elements = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]; cycleDialogFocus(event.nativeEvent, elements, elements.indexOf(document.activeElement as HTMLElement)); } }}><div ref={dialog} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="lifecycle-title" aria-describedby="lifecycle-description"><h2 id="lifecycle-title" className="text-xl font-semibold">{operation === "deactivate" ? "Deactivate" : "Reactivate"} account</h2><div id="lifecycle-description" className="mt-3 text-sm text-gray-700"><p>{operation === "deactivate" ? `Deactivate application access for ${displayName}?` : `Reactivate application access for ${displayName}?`}</p>{operation === "deactivate" ? <><p className="mt-2">Their role and history will be preserved. Unfinished visits or marketplace activity may block the action.</p></> : <p className="mt-2">Reactivation does not restore online availability, eligibility, pilot status, or other operational state.</p>}</div><label className="mt-4 block text-sm font-medium" htmlFor={`reason-${reference}`}>Reason <span className="font-normal text-gray-600">(required, 500 characters maximum)</span><textarea id={`reason-${reference}`} required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2 focus-visible:ring-2" /></label><p className="mt-1 text-xs text-gray-600">{reason.length}/500 characters</p>{error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}<div className="mt-5 flex flex-wrap gap-2"><button ref={confirm} disabled={pending || !reason.trim()} className="min-h-11 rounded-lg bg-gray-950 px-4 text-white disabled:opacity-50" onClick={() => void submit()}>{pending ? "Updating…" : `Confirm ${operation}`}</button><button disabled={pending} className="min-h-11 rounded-lg border px-4 disabled:opacity-50" onClick={() => setOpen(false)}>Cancel</button></div><span className="sr-only" role="status" aria-live="polite">{pending ? "Updating account status" : ""}</span></div></div>}</>;
}
