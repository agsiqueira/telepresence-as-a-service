"use client";

import { useEffect, useRef, useState } from "react";
import { cycleDialogFocus } from "@/lib/admin-role-ui";
import { createAdministratorGovernanceController, type AdministratorAction } from "@/lib/administrator-governance-ui";

type Props = {
  reference: string; displayName: string; role: "VIEWER" | "OPERATOR" | "ADMIN"; accountStatus: "ACTIVE" | "DEACTIVATED";
  isCurrentAdmin: boolean; canAssignAdministrator: boolean; canRemoveAdministrator: boolean; administratorActionBlockedReason: string | null;
  onChanged: () => Promise<unknown>; onUnauthorized: () => void;
};

export default function AdministratorGovernanceControls(props: Props) {
  const [action, setAction] = useState<AdministratorAction | null>(null); const [reason, setReason] = useState(""); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [announcement, setAnnouncement] = useState("");
  const trigger = useRef<HTMLButtonElement>(null); const confirm = useRef<HTMLButtonElement>(null); const dialog = useRef<HTMLDivElement>(null);
  const controller = useRef(createAdministratorGovernanceController((input, init) => fetch(input, init)));
  useEffect(() => { if (action) confirm.current?.focus(); else trigger.current?.focus(); }, [action]);
  function open(next: AdministratorAction) { setAction(next); setReason(""); setError(""); setAnnouncement(""); }
  function close() { if (pending) return; setAction(null); setReason(""); setError(""); }
  async function submit() {
    if (!action || pending) return;
    const normalizedReason = reason.trim().replace(/\s+/g, " ");
    if (!normalizedReason || normalizedReason.length > 500) { setError("Enter a reason between 1 and 500 characters."); return; }
    setPending(true); setError(""); setAnnouncement("");
    try {
      const outcome = await controller.current.submit({ reference: props.reference, displayName: props.displayName, action, reason: normalizedReason, refresh: props.onChanged });
      if (outcome.kind === "unauthorized") props.onUnauthorized();
      if (outcome.kind === "success") { setAction(null); setReason(""); setAnnouncement(outcome.message); }
      else if (outcome.kind !== "busy") setError(outcome.message);
    } finally { setPending(false); }
  }
  if (props.isCurrentAdmin || props.administratorActionBlockedReason === "SELF_ACTION") return <span className="self-center text-sm text-gray-600">You cannot change your own administrator role.</span>;
  const canAssign = props.canAssignAdministrator && props.accountStatus === "ACTIVE" && (props.role === "VIEWER" || props.role === "OPERATOR");
  const canRemove = props.canRemoveAdministrator && props.role === "ADMIN";
  return <>
    {canAssign && <button ref={trigger} disabled={pending} className="min-h-11 rounded-lg border px-3 disabled:opacity-50" onClick={() => open("ASSIGN_ADMINISTRATOR")}>Assign as Administrator</button>}
    {canRemove && <button ref={trigger} disabled={pending} className="min-h-11 rounded-lg border border-red-500 px-3 text-red-700 disabled:opacity-50" onClick={() => open("REMOVE_ADMINISTRATOR")}>Remove Administrator</button>}
    {props.administratorActionBlockedReason === "TARGET_INACTIVE" && <span className="self-center text-sm text-gray-600">Reactivate this participant before assigning administrator status.</span>}
    {announcement && <span className="self-center text-sm text-green-800" role="status">{announcement}</span>}
    {action && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onKeyDown={event => { if (event.key === "Escape") close(); if (event.key === "Tab" && dialog.current) { const elements = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]; cycleDialogFocus(event.nativeEvent, elements, elements.indexOf(document.activeElement as HTMLElement)); } }}><div ref={dialog} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="administrator-governance-title" aria-describedby="administrator-governance-description"><h2 id="administrator-governance-title" className="text-xl font-semibold">{action === "ASSIGN_ADMINISTRATOR" ? "Assign Administrator" : "Remove Administrator"}</h2><div id="administrator-governance-description" className="mt-3 space-y-2 text-sm text-gray-700">{action === "ASSIGN_ADMINISTRATOR" ? <><p>Assign {props.displayName} from {props.role} to ADMIN?</p><p>Operational data and history are preserved. The participant will be forced offline.</p><p>Displayed availability is only a hint; current obligations or a pending application may still block this action.</p></> : <><p>Remove administrator status from {props.displayName} and return them to VIEWER?</p><p>This does not assign OPERATOR status. Dormant profiles and history remain preserved.</p><p>{props.accountStatus === "DEACTIVATED" ? "This participant will remain deactivated." : "The participant will be forced offline."}</p><p>The last ACTIVE ADMIN cannot be removed.</p></>}</div><label className="mt-4 block text-sm font-medium" htmlFor={`administrator-reason-${props.reference}`}>Reason <span className="font-normal text-gray-600">(required, 500 characters maximum)</span><textarea id={`administrator-reason-${props.reference}`} required maxLength={500} aria-describedby={`administrator-reason-help-${props.reference}${error ? ` administrator-reason-error-${props.reference}` : ""}`} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2 focus-visible:ring-2" /></label><p id={`administrator-reason-help-${props.reference}`} className="mt-1 text-xs text-gray-600">{reason.length}/500 characters</p>{error && <p id={`administrator-reason-error-${props.reference}`} className="mt-3 text-sm text-red-700" role="alert" aria-live="assertive">{error}</p>}<div className="mt-5 flex flex-wrap gap-2"><button ref={confirm} disabled={pending || !reason.trim()} className="min-h-11 rounded-lg bg-gray-950 px-4 text-white disabled:opacity-50" onClick={() => void submit()}>{pending ? "Updating…" : action === "ASSIGN_ADMINISTRATOR" ? "Confirm assignment" : "Confirm removal"}</button><button disabled={pending} className="min-h-11 rounded-lg border px-4 disabled:opacity-50" onClick={close}>Cancel</button></div><span className="sr-only" role="status" aria-live="polite">{pending ? "Updating administrator status" : ""}</span></div></div>}
  </>;
}
