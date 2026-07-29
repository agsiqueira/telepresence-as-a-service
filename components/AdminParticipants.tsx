"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canCancelRoleDialog, createAdminRoleChangeController, cycleDialogFocus, roleActionFor, type AdminRoleAction } from "@/lib/admin-role-ui";
import { requireJsonResponse } from "@/lib/resilient-poller";
import AccountLifecycleControls from "@/components/AccountLifecycleControls";
import AdministratorGovernanceControls from "@/components/AdministratorGovernanceControls";

type Participant = {
  reference: string;
  displayName: string;
  role: "VIEWER" | "OPERATOR" | "ADMIN";
  accountStatus: "ACTIVE" | "DEACTIVATED";
  deactivatedAt: string | null;
  isCurrentAdmin: boolean;
  canAssignAdministrator: boolean;
  canRemoveAdministrator: boolean;
  administratorActionBlockedReason: "SELF_ACTION" | "TARGET_INACTIVE" | "UNSUPPORTED_ROLE" | null;
  joinedDate: string;
  pilotStatus?: "PENDING" | "APPROVED" | "SUSPENDED";
  online?: boolean;
  activeState?: string;
  profileComplete?: boolean;
};

type Confirmation = {
  participant: Participant;
  action: "ASSIGN_OPERATOR" | "RETURN_TO_VIEWER" | "SUSPENDED" | "APPROVED" | "OFFLINE";
};

export default function AdminParticipants() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unauthorized" | "failed">("loading");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState<Confirmation | null>(null);
  const [pendingReference, setPendingReference] = useState<string | null>(null);
  const mutating = useRef(new Set<string>());
  const confirmButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const roleController = useRef(createAdminRoleChangeController((input, init) => fetch(input, init)));

  const load = useCallback((signal?: AbortSignal) => {
    setState("loading");
    const query = new URLSearchParams({ limit: "20", page: String(page), ...(role && { role }), ...(status && { status }), ...(accountStatus && { accountStatus }), ...(search.trim() && { search: search.trim() }) });
    return fetch(`/api/admin/participants?${query}`, { cache: "no-store", signal }).then(async response => {
      if ([401, 403].includes(response.status)) { setState("unauthorized"); return; }
      const data = await requireJsonResponse<{ participants: Participant[]; hasNext: boolean }>(response);
      setParticipants(data.participants);
      setHasNext(data.hasNext);
      setState("ready");
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setState("failed");
    });
  }, [accountStatus, page, role, search, status]);

  useEffect(() => {
    const request = new AbortController();
    void load(request.signal);
    return () => request.abort();
  }, [load]);

  useEffect(() => {
    if (confirm) confirmButton.current?.focus();
    else returnFocus.current?.focus();
  }, [confirm]);

  function openConfirmation(participant: Participant, action: Confirmation["action"]) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirm({ participant, action });
  }

  async function mutate(reference: string, path: string, init: RequestInit) {
    if (mutating.current.has(reference)) return;
    mutating.current.add(reference);
    setPendingReference(reference);
    setMessage("");
    try {
      await requireJsonResponse(await fetch(`/api/admin/participants/${reference}/${path}`, init));
      setMessage("Participant updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Participant could not be updated.");
    } finally {
      mutating.current.delete(reference);
      setPendingReference(null);
      setConfirm(null);
    }
  }

  function statusChange(participant: Participant, next: string) {
    return mutate(participant.reference, "pilot-status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pilotStatus: next, expectedStatus: participant.pilotStatus }) });
  }

  async function changeRole(participant: Participant, action: AdminRoleAction) {
    if (mutating.current.has(participant.reference)) return;
    mutating.current.add(participant.reference);
    setPendingReference(participant.reference);
    setMessage("");
    try {
      const outcome = await roleController.current.submit({ reference: participant.reference, displayName: participant.displayName, action, refresh: load });
      if (outcome.kind === "unauthorized") setState("unauthorized");
      if (outcome.kind !== "busy") setMessage(outcome.message);
      if (outcome.kind === "success") setConfirm(null);
    } finally {
      mutating.current.delete(participant.reference);
      setPendingReference(null);
    }
  }

  function confirmAction() {
    if (!confirm) return;
    const { participant, action } = confirm;
    if (action === "ASSIGN_OPERATOR" || action === "RETURN_TO_VIEWER") void changeRole(participant, action);
    else if (action === "OFFLINE") void mutate(participant.reference, "offline", { method: "POST" });
    else void statusChange(participant, action);
  }

  return <section className="mt-6">
    <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-5" onSubmit={event => { event.preventDefault(); setPage(1); void load(); }}>
      <label className="text-sm font-medium sm:col-span-2">Search display names<input value={search} maxLength={80} onChange={event => setSearch(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label>
      <label className="text-sm font-medium">Account role<select value={role} onChange={event => { setRole(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">All</option><option>VIEWER</option><option>OPERATOR</option><option>ADMIN</option></select></label>
      <label className="text-sm font-medium">Operator pilot status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">All</option><option>PENDING</option><option>APPROVED</option><option>SUSPENDED</option></select></label>
      <label className="text-sm font-medium">Account status<select value={accountStatus} onChange={event => { setAccountStatus(event.target.value); setPage(1); }} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">All</option><option>ACTIVE</option><option>DEACTIVATED</option></select></label>
      <button className="min-h-11 rounded-lg bg-gray-950 px-4 text-white sm:col-span-5">Apply filters</button>
    </form>
    {state === "loading" && <p className="mt-5" aria-busy="true">Loading participants…</p>}
    {state === "unauthorized" && <p className="mt-5 text-red-700" role="alert">Administrator authorization is required. Sign in again to continue.</p>}
    {state === "failed" && <p className="mt-5 text-red-700" role="alert">Participants could not be loaded. <button className="underline" onClick={() => void load()}>Retry</button></p>}
    {state === "ready" && participants.length === 0 && <p className="mt-5">No participants match these filters.</p>}
    <ul className="mt-5 grid gap-4">{state === "ready" && participants.map(participant => {
      const pending = pendingReference === participant.reference;
      return <li key={participant.reference} className="min-w-0 rounded-xl border bg-white p-4">
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><h2 className="break-words font-semibold">{participant.displayName}</h2><p className="text-sm text-gray-600">Joined {participant.joinedDate}{participant.deactivatedAt ? ` · Deactivated ${new Date(participant.deactivatedAt).toLocaleDateString()}` : ""}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-sm font-semibold ${participant.role === "ADMIN" ? "border-purple-600 bg-purple-50 text-purple-900" : ""}`}>Account role: {participant.role}</span><span className={`rounded-full border px-3 py-1 text-sm font-semibold ${participant.accountStatus === "ACTIVE" ? "border-green-600 text-green-800" : "border-red-600 text-red-800"}`}>Account status: {participant.accountStatus}</span></div></div>
        {participant.role === "OPERATOR" && <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="font-medium">Operator pilot status</dt><dd>{participant.pilotStatus}</dd></div><div><dt className="font-medium">Online availability</dt><dd>{participant.online ? "Online" : "Offline"}</dd></div><div><dt className="font-medium">Operator readiness</dt><dd>Profile {participant.profileComplete ? "complete" : "incomplete"} · {participant.activeState?.replaceAll("_", " ").toLowerCase()}</dd></div></dl>}
        <div className="mt-4 flex flex-wrap gap-2">
          {roleActionFor(participant.role) === "ASSIGN_OPERATOR" && <button disabled={pending} className="min-h-11 rounded-lg border px-3 disabled:opacity-50" onClick={() => openConfirmation(participant, "ASSIGN_OPERATOR")}>{pending ? "Updating…" : "Assign as Operator"}</button>}
          {roleActionFor(participant.role) === "RETURN_TO_VIEWER" && <button disabled={pending} className="min-h-11 rounded-lg border px-3 disabled:opacity-50" onClick={() => openConfirmation(participant, "RETURN_TO_VIEWER")}>{pending ? "Updating…" : "Return to Viewer"}</button>}
          {participant.role === "OPERATOR" && participant.pilotStatus === "PENDING" && <button disabled={pending} className="min-h-11 rounded-lg border px-3" onClick={() => void statusChange(participant, "APPROVED")}>Approve</button>}
          {participant.role === "OPERATOR" && participant.pilotStatus !== "SUSPENDED" && <button disabled={pending} className="min-h-11 rounded-lg border border-red-500 px-3 text-red-700" onClick={() => openConfirmation(participant, "SUSPENDED")}>Suspend</button>}
          {participant.role === "OPERATOR" && participant.pilotStatus === "SUSPENDED" && <button disabled={pending} className="min-h-11 rounded-lg border px-3" onClick={() => openConfirmation(participant, "APPROVED")}>Restore approval</button>}
          {participant.role === "OPERATOR" && participant.online && <button disabled={pending} className="min-h-11 rounded-lg border px-3" onClick={() => openConfirmation(participant, "OFFLINE")}>Take offline</button>}
          <AdministratorGovernanceControls reference={participant.reference} displayName={participant.displayName} role={participant.role} accountStatus={participant.accountStatus} isCurrentAdmin={participant.isCurrentAdmin} canAssignAdministrator={participant.canAssignAdministrator} canRemoveAdministrator={participant.canRemoveAdministrator} administratorActionBlockedReason={participant.administratorActionBlockedReason} onChanged={load} onUnauthorized={() => setState("unauthorized")} />
          <AccountLifecycleControls reference={participant.reference} displayName={participant.displayName} accountStatus={participant.accountStatus} isCurrentAdmin={participant.isCurrentAdmin} onChanged={load} />
        </div>
      </li>;
    })}</ul>
    {state === "ready" && <nav className="mt-6 flex items-center justify-between" aria-label="Participant pages"><button disabled={page === 1} className="min-h-11 rounded-lg border px-4 disabled:opacity-40" onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button disabled={!hasNext} className="min-h-11 rounded-lg border px-4 disabled:opacity-40" onClick={() => setPage(value => value + 1)}>Next</button></nav>}
    {message && <p className="mt-4" role="status">{message}</p>}
    {confirm && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" role="presentation" onKeyDown={event => { if (event.key === "Escape" && canCancelRoleDialog(Boolean(pendingReference))) setConfirm(null); if (event.key === "Tab" && dialog.current) { const elements = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]; cycleDialogFocus(event.nativeEvent, elements, elements.indexOf(document.activeElement as HTMLElement)); } }}><div ref={dialog} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description"><h2 id="admin-confirm-title" className="text-xl font-semibold">Confirm participant change</h2><div id="admin-confirm-description" className="mt-3 text-sm text-gray-700">{confirm.action === "ASSIGN_OPERATOR" ? <><p>Assign {confirm.participant.displayName} as an Operator?</p><p className="mt-2">They will remain offline, and approval will not be granted automatically.</p></> : confirm.action === "RETURN_TO_VIEWER" ? <><p>Return {confirm.participant.displayName} to Viewer?</p><p className="mt-2">Current destination assignments will be removed. The dormant Operator profile will be retained.</p></> : <p>Confirm this eligibility or availability change for {confirm.participant.displayName}.</p>}</div>{message && <p className="mt-3 text-sm text-red-700" role="alert">{message}</p>}<div className="mt-5 flex flex-wrap gap-2"><button ref={confirmButton} disabled={Boolean(pendingReference)} className="min-h-11 rounded-lg bg-gray-950 px-4 text-white disabled:opacity-50" onClick={confirmAction}>{pendingReference ? "Updating…" : "Confirm change"}</button><button disabled={Boolean(pendingReference)} className="min-h-11 rounded-lg border px-4 disabled:opacity-50" onClick={() => setConfirm(null)}>Cancel</button></div></div></div>}
  </section>;
}
