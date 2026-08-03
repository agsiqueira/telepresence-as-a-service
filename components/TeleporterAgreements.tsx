"use client";

import { useCallback, useEffect, useState } from "react";
import type { AgreementView } from "@/components/AgreementConfirmation";
import JourneyReschedulingPanel from "@/components/JourneyReschedulingPanel";
import { ActionLink, Button, MetadataList, StatePanel, StatusBadge, Surface } from "@/components/ui/primitives";

type LoadState = "loading" | "ready" | "error";

function displayStatus(status: string) {
  return status.replaceAll("_", " ");
}

function timing(item: AgreementView) {
  if (item.agreedStartAt) return { label: "Confirmed start", value: new Date(item.agreedStartAt).toLocaleString() };
  if (item.agreedLatestStart) return { label: "Accepted start window", value: `${new Date(item.agreedEarliestStart).toLocaleString()} – ${new Date(item.agreedLatestStart).toLocaleString()}` };
  return { label: "Accepted start", value: new Date(item.agreedEarliestStart).toLocaleString() };
}

export default function TeleporterAgreements() {
  const [items, setItems] = useState<AgreementView[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      const response = await fetch("/api/operator/agreements", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load confirmed Journeys");
      setItems(data.agreements ?? []);
      setLoadState("ready");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load confirmed Journeys");
      setLoadState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <section className="mt-8" aria-labelledby="confirmed-journeys-heading">
    <h2 id="confirmed-journeys-heading" className="text-heading-2">Confirmed Journeys</h2>
    <p className="mt-2 text-body-sm text-ink-secondary">Agreement details and scheduling actions appear in the order provided by the service.</p>

    {loadState === "loading" && <div className="mt-5"><StatePanel title="Loading confirmed Journeys" busy><p role="status">Loading Agreement timing and fulfillment details…</p></StatePanel></div>}
    {loadState === "error" && <div className="mt-5"><StatePanel title="Confirmed Journeys could not be loaded" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>}><p role="alert">{error}</p></StatePanel></div>}
    {loadState === "ready" && items.length === 0 && <div className="mt-5"><StatePanel title="No confirmed Journeys" action={<ActionLink href="/operator/requests" variant="secondary">Browse Journey Requests</ActionLink>}><p role="status">Confirmed Journeys appear here after an Explorer accepts an eligible Proposal.</p></StatePanel></div>}

    {loadState === "ready" && items.length > 0 && <ul className="mt-5 grid gap-5">{items.map(item => {
      const schedule = timing(item);
      return <li key={item.id}>
        <Surface>
          <article aria-labelledby={`agreement-${item.id}`}>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><h3 id={`agreement-${item.id}`} className="break-words text-heading-3">{item.publicPlaceNameSnapshot}</h3><p className="mt-1 break-words text-body-sm text-ink-secondary">{item.coarseLocationSnapshot}</p></div>
              <StatusBadge className="max-w-full break-words text-center">{displayStatus(item.status)}</StatusBadge>
            </div>
            <MetadataList className="mt-5" items={[
              { term: schedule.label, detail: <span className="break-words">{schedule.value}</span> },
              { term: "Duration", detail: `${item.agreedDurationMinutes} minutes` },
              { term: "Agreed compensation", detail: `${item.agreedPriceMinor} ${item.currency} minor units` },
              { term: "Agreement confirmed", detail: item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : "Unavailable" },
            ]} />
            <section className="mt-6 rounded-lg border border-line bg-surface-subtle p-4" aria-labelledby={`fulfillment-${item.id}`}><h4 id={`fulfillment-${item.id}`} className="text-label">Fulfillment details</h4><p className="mt-2 whitespace-pre-wrap break-words text-body-sm text-ink-secondary">{item.privateMeetingSnapshot || "No additional fulfillment details provided."}</p></section>
            <JourneyReschedulingPanel tripId={item.tripId} onRefresh={load} />
          </article>
        </Surface>
      </li>;
    })}</ul>}
  </section>;
}
