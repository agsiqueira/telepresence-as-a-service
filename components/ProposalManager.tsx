"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ActionLink, Button, Field, MetadataList, Notice, PageHeader, StatePanel, StatusBadge, Surface } from "@/components/ui/primitives";

type RequestView = { id: string; publicPlaceName: string; coarseLocation: string; earliestStart: string; latestStart: string; currency: string; expiresAt: string; durationMinutes: number; proposedPriceMinor: number };
type Proposal = { id: string; version: number; durationMinutes: number; proposedPriceMinor: number; currency: string; status: string };
type LoadState = "loading" | "ready" | "unavailable" | "error";
type Message = { kind: "success" | "error"; text: string } | null;

function local(iso: string) { const date = new Date(iso); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function displayWindow(earliest: string, latest: string) { return `${new Date(earliest).toLocaleString()} – ${new Date(latest).toLocaleString()}`; }

export default function ProposalManager({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<RequestView | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [pendingAction, setPendingAction] = useState<"submit" | "withdraw" | null>(null);
  const [form, setForm] = useState({ earliestStart: "", latestStart: "", durationMinutes: 60, proposedPriceMinor: 0, currency: "USD", validUntil: "" });

  const load = useCallback(async ({ preserveMessage = false }: { preserveMessage?: boolean } = {}) => {
    setLoadState("loading");
    setLoadError("");
    if (!preserveMessage) setMessage(null);
    try {
      const [requestResponse, proposalResponse] = await Promise.all([
        fetch("/api/operator/journey-requests", { cache: "no-store" }),
        fetch(`/api/operator/journey-requests/${requestId}/proposals`, { cache: "no-store" }),
      ]);
      const requestData = await requestResponse.json();
      const proposalData = await proposalResponse.json();
      if (!requestResponse.ok || !proposalResponse.ok) throw new Error(requestData.error ?? proposalData.error ?? "Unable to load Journey Request");
      const selected = (requestData.requests ?? []).find((value: RequestView) => value.id === requestId);
      if (!selected) { setRequest(null); setProposals([]); setLoadState("unavailable"); return; }
      setRequest(selected);
      setProposals(proposalData.proposals ?? []);
      setForm(value => value.earliestStart ? value : {
        earliestStart: local(selected.earliestStart),
        latestStart: local(selected.latestStart),
        durationMinutes: selected.durationMinutes,
        proposedPriceMinor: selected.proposedPriceMinor,
        currency: selected.currency,
        validUntil: local(new Date(Math.min(new Date(selected.expiresAt).getTime(), new Date(selected.earliestStart).getTime()) - 3600000).toISOString()),
      });
      setLoadState("ready");
    } catch (value) {
      setLoadError(value instanceof Error ? value.message : "Unable to load Journey Request");
      setLoadState("error");
    }
  }, [requestId]);

  useEffect(() => { void load(); }, [load]);
  const active = proposals.find(value => value.status === "ACTIVE");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pendingAction) return;
    setPendingAction("submit");
    setMessage(null);
    try {
      const endpoint = active ? `/api/operator/proposals/${active.id}/revise` : `/api/operator/journey-requests/${requestId}/proposals`;
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, earliestStart: new Date(form.earliestStart).toISOString(), latestStart: form.latestStart ? new Date(form.latestStart).toISOString() : null, validUntil: new Date(form.validUntil).toISOString() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to save Proposal");
      setMessage({ kind: "success", text: active ? "New immutable Proposal version created." : "Proposal submitted." });
      await load({ preserveMessage: true });
    } catch (value) {
      setMessage({ kind: "error", text: value instanceof Error ? value.message : "Unable to save Proposal" });
    } finally { setPendingAction(null); }
  }

  async function withdraw() {
    if (!active || pendingAction) return;
    setPendingAction("withdraw");
    setMessage(null);
    try {
      const response = await fetch(`/api/operator/proposals/${active.id}/withdraw`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to withdraw Proposal");
      setMessage({ kind: "success", text: "Proposal withdrawn and preserved in history." });
      await load({ preserveMessage: true });
    } catch (value) {
      setMessage({ kind: "error", text: value instanceof Error ? value.message : "Unable to withdraw Proposal" });
    } finally { setPendingAction(null); }
  }

  if (loadState === "loading") return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10"><PageHeader eyebrow="Journey Request" title="Loading Request" /><div className="mt-6"><StatePanel title="Loading Journey Request" busy><p role="status">Loading Request details and Proposal history…</p></StatePanel></div></main>;
  if (loadState === "unavailable") return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10"><PageHeader eyebrow="Journey Request" title="Request unavailable" /><div className="mt-6"><StatePanel title="This Journey Request is no longer available." action={<ActionLink href="/operator/requests" variant="secondary">Back to Requests</ActionLink>}><p>The Request is no longer included in your authoritative discovery results.</p></StatePanel></div></main>;
  if (loadState === "error" || !request) return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10"><PageHeader eyebrow="Journey Request" title="Request could not be loaded" /><div className="mt-6"><StatePanel title="Journey Request could not be loaded" tone="danger" action={<div className="flex flex-col gap-3 sm:flex-row"><Button variant="secondary" onClick={() => void load()}>Try again</Button><ActionLink href="/operator/requests" variant="quiet">Back to Requests</ActionLink></div>}><p role="alert">{loadError}</p></StatePanel></div></main>;

  const submitting = pendingAction === "submit";
  return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10">
    <Link href="/operator/requests" className="inline-flex min-h-control items-center text-label text-link underline underline-offset-4">← Back to Requests</Link>
    <PageHeader className="mt-5" eyebrow="Journey Request" title={request.publicPlaceName} description={request.coarseLocation} />

    <Surface className="mt-6"><h2 className="text-heading-2">Explorer’s requested terms</h2><MetadataList className="mt-5" items={[
      { term: "Requested window", detail: <span className="break-words">{displayWindow(request.earliestStart, request.latestStart)}</span> },
      { term: "Requested duration", detail: `${request.durationMinutes} minutes` },
      { term: "Proposed compensation", detail: `${request.proposedPriceMinor} ${request.currency} (minor units)` },
      { term: "Request expires", detail: new Date(request.expiresAt).toLocaleString() },
    ]} /></Surface>
    <Notice className="mt-4" variant="info" role="status" title="Public Request information"><p>Only the public place and coarse location are shown. Private meeting details and Explorer information remain hidden.</p></Notice>

    <section className="mt-8" aria-labelledby="proposal-heading">
      <form onSubmit={submit} aria-busy={pendingAction !== null}>
        <Surface>
          <h2 id="proposal-heading" className="text-heading-2">{active ? "Revise Proposal" : "Your Proposal"}</h2>
          <p className="mt-2 text-body-sm text-ink-secondary">{active ? `Your active Proposal is version ${active.version}. Revising creates a new immutable version instead of editing it.` : "Propose the time window and terms you can fulfill."}</p>
          <fieldset disabled={pendingAction !== null} className="mt-6"><legend className="text-heading-3">Proposal terms</legend><div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2">
            <Field id="proposal-earliest" label="Earliest proposed start"><input required type="datetime-local" value={form.earliestStart} onChange={event => setForm({ ...form, earliestStart: event.target.value })} className="unfar-control" /></Field>
            <Field id="proposal-latest" label="Latest proposed start" optional><input type="datetime-local" value={form.latestStart} onChange={event => setForm({ ...form, latestStart: event.target.value })} className="unfar-control" /></Field>
            <Field id="proposal-duration" label="Duration" description="Minutes, from 15 to 480."><input required type="number" min={15} max={480} value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: Number(event.target.value) })} className="unfar-control" /></Field>
            <Field id="proposal-price" label="Price in minor units"><input required type="number" min={0} max={10000000} value={form.proposedPriceMinor} onChange={event => setForm({ ...form, proposedPriceMinor: Number(event.target.value) })} className="unfar-control" /></Field>
            <Field id="proposal-currency" label="Currency"><input readOnly value={form.currency} className="unfar-control bg-surface-subtle" /></Field>
            <Field id="proposal-valid-until" label="Valid until"><input required type="datetime-local" value={form.validUntil} onChange={event => setForm({ ...form, validUntil: event.target.value })} className="unfar-control" /></Field>
          </div></fieldset>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button type="submit" disabled={pendingAction !== null}>{submitting ? (active ? "Creating revision…" : "Submitting…") : (active ? "Create revised version" : "Submit Proposal")}</Button></div>
          {message && <Notice className="mt-5" variant={message.kind === "error" ? "danger" : "success"} role={message.kind === "error" ? "alert" : "status"}><p>{message.text}</p></Notice>}
        </Surface>
      </form>
      {active && <Surface className="mt-4 border-danger-fg/25"><h2 className="text-heading-3">Withdraw active Proposal</h2><p className="mt-2 text-body-sm text-ink-secondary">Withdrawal affects the active Proposal only. Every version remains preserved in Proposal history.</p><Button className="mt-4 w-full sm:w-auto" variant="danger" disabled={pendingAction !== null} onClick={() => void withdraw()}>{pendingAction === "withdraw" ? "Withdrawing…" : "Withdraw active Proposal"}</Button></Surface>}
    </section>

    <section className="mt-8" aria-labelledby="proposal-history-heading"><h2 id="proposal-history-heading" className="text-heading-2">Proposal history</h2><p className="mt-2 text-body-sm text-ink-secondary">Each revision creates a new immutable version; earlier versions are never edited or removed.</p>
      {proposals.length === 0 ? <StatePanel title="No Proposal history"><p>You have not submitted a Proposal for this Request.</p></StatePanel> : <ol className="mt-4 grid gap-3">{proposals.map(proposal => <li key={proposal.id}><Surface><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-heading-3">Version {proposal.version}</h3><StatusBadge variant={proposal.status === "ACTIVE" ? "success" : "neutral"}>{proposal.status}</StatusBadge></div>{proposal.status === "ACTIVE" && <p className="mt-2 text-label text-success-fg">Active version</p>}<MetadataList className="mt-4" items={[{ term: "Duration", detail: `${proposal.durationMinutes} minutes` }, { term: "Proposed price", detail: `${proposal.proposedPriceMinor} ${proposal.currency} (minor units)` }]} /></Surface></li>)}</ol>}
    </section>
  </main>;
}
