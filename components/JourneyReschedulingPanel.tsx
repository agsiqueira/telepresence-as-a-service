"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { localTimezone, parseLocalStart } from "@/lib/rescheduling-ui";
import { Button, Field, Notice, Skeleton } from "@/components/ui/primitives";

type Proposal = { id: string; proposedStartAt: string; proposedEndAt: string; status: "PENDING"; createdAt: string; resolvedAt: null; proposerParty: "EXPLORER" | "TELEPORTER"; canAccept: boolean; canDecline: boolean; canWithdraw: boolean };
type State = { eligible: boolean; currentStartAt: string | null; currentEndAt: string | null; durationMinutes: number | null; canPropose: boolean; proposal: Proposal | null };
type LoadState = "loading" | "ready" | "error";
type Action = "submitting" | "accepting" | "declining" | "withdrawing" | null;
const format = (value: string) => new Date(value).toLocaleString();

export default function JourneyReschedulingPanel({ tripId, onRefresh }: { tripId: string; onRefresh: () => void | Promise<void> }) {
  const [state, setState] = useState<State | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [review, setReview] = useState<{ start: Date; end: Date } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState<Action>(null);
  const busy = useRef(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch(`/api/trips/${tripId}/reschedule`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load rescheduling details");
      setState(body.rescheduling);
      setLoadState("ready");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load rescheduling details");
      setLoadState("error");
    }
  }, [tripId]);

  useEffect(() => { void load(); }, [load]);

  async function refresh(text: string) {
    await load();await onRefresh();
    setOpen(false);
    setReview(null);
    setInput("");
    setMessage(text);
  }

  async function mutate(path: string, success: string, activeAction: Exclude<Action, null>, body?: object) {
    if (busy.current) return;
    busy.current = true;
    setAction(activeAction);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/trips/${tripId}/reschedule${path}`, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Unable to update the reschedule proposal"); await load(); return; }
      await refresh(success);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to update the reschedule proposal");
      await load().catch(() => undefined);
    } finally { busy.current = false; setAction(null); }
  }

  function prepare(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!state?.durationMinutes) return;
    const parsed = parseLocalStart(input);
    if (!parsed.ok) return setError(parsed.error);
    const end = new Date(parsed.value.getTime() + state.durationMinutes * 60_000);
    if (state.currentStartAt && state.currentEndAt && parsed.value.getTime() === new Date(state.currentStartAt).getTime() && end.getTime() === new Date(state.currentEndAt).getTime()) return setError("Choose a different Journey time.");
    setReview({ start: parsed.value, end });
  }

  function cancel() { setOpen(false); setReview(null); setError(""); }

  if (loadState === "loading") return <section className="mt-6 border-t border-line pt-5" aria-labelledby={`reschedule-${tripId}`} aria-busy="true"><h3 id={`reschedule-${tripId}`} className="text-heading-3">Schedule changes</h3><Skeleton className="mt-3 w-2/3" /><span className="sr-only" role="status">Loading rescheduling details…</span></section>;
  if (loadState === "error") return <section className="mt-6 border-t border-line pt-5" aria-labelledby={`reschedule-${tripId}`}><h3 id={`reschedule-${tripId}`} className="text-heading-3">Schedule changes</h3><Notice className="mt-3" variant="danger" role="alert"><p>{error}</p><Button className="mt-3" variant="secondary" onClick={() => { setError(""); void load(); }}>Try again</Button></Notice></section>;
  if (!state?.eligible) return null;

  const proposal = state.proposal;
  const currentTime = state.currentStartAt && state.currentEndAt ? `${format(state.currentStartAt)} – ${format(state.currentEndAt)}` : "Unavailable";
  const working = action !== null;

  return <section className="mt-6 border-t border-line pt-5" aria-labelledby={`reschedule-${tripId}`}>
    <h3 id={`reschedule-${tripId}`} className="text-heading-3">Schedule changes</h3>
    <p className="mt-3 break-words text-body-sm"><strong>Confirmed time:</strong> {currentTime}</p>
    <p className="mt-2 text-body-sm text-ink-secondary">The confirmed Journey time remains unchanged until the other party accepts a proposal and the replacement interval is successfully confirmed.</p>

    {proposal ? <div className="mt-4 rounded-lg border border-warning-fg/25 bg-warning-bg p-4">
      <p className="text-label">Proposed new time — pending</p>
      <p className="mt-1 break-words text-body-sm">{format(proposal.proposedStartAt)} – {format(proposal.proposedEndAt)}</p>
      <p className="mt-2 text-body-sm">Proposed by the {proposal.proposerParty === "EXPLORER" ? "Explorer" : "Teleporter"}.</p>
      {proposal.canWithdraw && <><p className="mt-2 text-body-sm">Approval from the other party is pending. Withdrawing leaves the confirmed time unchanged.</p><Button className="mt-4 w-full sm:w-auto" variant="danger" disabled={working} onClick={() => void mutate(`/${proposal.id}/withdraw`, "The proposal was withdrawn. The confirmed time is unchanged.", "withdrawing")}>{action === "withdrawing" ? "Withdrawing…" : "Withdraw proposal"}</Button></>}
      {(proposal.canAccept || proposal.canDecline) && <><p className="mt-2 text-body-sm">Accepting replaces the confirmed interval. Declining leaves it unchanged.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {proposal.canAccept && <Button className="min-h-11" disabled={working} onClick={() => void mutate(`/${proposal.id}/accept`, "The proposed time was accepted and is now confirmed.", "accepting")}>{action === "accepting" ? "Accepting…" : "Accept new time"}</Button>}
        {proposal.canDecline && <Button variant="secondary" disabled={working} onClick={() => void mutate(`/${proposal.id}/decline`, "The proposal was declined. The confirmed time is unchanged.", "declining")}>{action === "declining" ? "Declining…" : "Decline"}</Button>}
      </div></>}
    </div> : state.canPropose && (!open ? <div className="mt-4"><p className="text-body-sm text-ink-secondary">A proposed replacement does not change the confirmed time until it is accepted.</p><Button className="mt-3 w-full sm:w-auto" variant="secondary" onClick={() => setOpen(true)}>Propose a new time</Button></div> : <form onSubmit={prepare} className="mt-4 rounded-lg border border-line bg-surface-subtle p-4">
      <Field id={`new-start-${tripId}`} label="Proposed replacement start" description={`Enter the date and time in ${localTimezone()}. Availability is confirmed only after acceptance succeeds.`}><input required type="datetime-local" value={input} onChange={event => { setInput(event.target.value); setReview(null); }} className="unfar-control" /></Field>
      {review ? <div className="mt-4 rounded-lg border border-line bg-surface p-4"><p className="text-label">Review proposed new time</p><p className="mt-2 break-words text-body-sm"><strong>Start:</strong> {review.start.toLocaleString()}</p><p className="mt-1 break-words text-body-sm"><strong>Calculated end:</strong> {review.end.toLocaleString()}</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><Button disabled={working} onClick={() => void mutate("", "Proposal sent. The confirmed time is unchanged while approval is pending.", "submitting", { proposedStartAt: review.start.toISOString(), proposedEndAt: review.end.toISOString() })}>{action === "submitting" ? "Submitting…" : "Submit proposal"}</Button><Button variant="secondary" disabled={working} onClick={() => setReview(null)}>Edit</Button></div></div> : <Button className="mt-4 w-full sm:w-auto" type="submit" disabled={working}>Review proposed time</Button>}
      <Button className="mt-3 w-full sm:w-auto" variant="quiet" disabled={working} onClick={cancel}>Cancel</Button>
    </form>)}
    {message && <p role="status" aria-live="polite" className="mt-4 text-body-sm text-success-fg">{message}</p>}
    {error && <p role="alert" className="mt-4 text-body-sm text-danger-fg">{error}</p>}
  </section>;
}
