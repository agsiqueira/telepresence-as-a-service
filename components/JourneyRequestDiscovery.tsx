"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ActionLink, Button, MetadataList, Notice, PageHeader, StatePanel, StatusBadge, Surface } from "@/components/ui/primitives";

type JourneyRequest = {
  id: string;
  publicPlaceName: string;
  coarseLocation: string;
  earliestStart: string;
  latestStart: string;
  durationMinutes: number;
  proposedPriceMinor: number;
  currency: string;
  status?: string;
};

type LoadState = "loading" | "ready" | "error";

function requestedWindow(request: JourneyRequest) {
  const earliest = new Date(request.earliestStart);
  const latest = new Date(request.latestStart);
  const sameDay = earliest.toLocaleDateString() === latest.toLocaleDateString();
  if (sameDay) {
    return `${earliest.toLocaleDateString()} · ${earliest.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${latest.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return `${earliest.toLocaleString()} – ${latest.toLocaleString()}`;
}

function AdminDiscovery({ requests, loadState, error }: { requests: JourneyRequest[]; loadState: LoadState; error: string }) {
  return <main className="mx-auto max-w-4xl px-4 py-10">
    <h1 className="text-3xl font-bold">Journey Request activity</h1>
    <p className="mt-2 text-gray-600">Safe operational visibility; private meeting details are excluded.</p>
    {loadState === "loading" && <p className="mt-6 text-gray-500" role="status">Loading requests…</p>}
    {loadState === "error" && <p className="mt-4" role="alert">{error}</p>}
    {loadState === "ready" && requests.length === 0 && <p className="mt-6 text-gray-500" role="status">No requests available.</p>}
    {requests.length > 0 && <ul className="mt-6 grid gap-4">{requests.map(request => <li key={request.id} className="rounded-xl border bg-white p-5">
      <div className="flex flex-wrap justify-between gap-3"><h2 className="min-w-0 break-words text-xl font-semibold">{request.publicPlaceName}</h2>{request.status && <span>{request.status}</span>}</div>
      <p className="mt-1 break-words text-gray-600">{request.coarseLocation}</p>
      <p className="mt-3 break-words text-sm">{new Date(request.earliestStart).toLocaleString()} – {new Date(request.latestStart).toLocaleString()}</p>
      <p className="mt-1 text-sm">{request.durationMinutes} min · {request.proposedPriceMinor} {request.currency}</p>
    </li>)}</ul>}
  </main>;
}

export default function JourneyRequestDiscovery({ admin = false }: { admin?: boolean }) {
  const [requests, setRequests] = useState<JourneyRequest[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      const response = await fetch(admin ? "/api/admin/journey-requests" : "/api/operator/journey-requests", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load requests");
      setRequests(data.requests ?? []);
      setLoadState("ready");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Unable to load requests");
      setLoadState("error");
    }
  }, [admin]);

  useEffect(() => { void load(); }, [load]);

  if (admin) return <AdminDiscovery requests={requests} loadState={loadState} error={error} />;

  return <main className="mx-auto max-w-participant px-4 py-8 sm:px-6 sm:py-10">
    <PageHeader eyebrow="Teleporter" title="Requests" description="Review compatible scheduled Journey Requests and respond with a Proposal." />

    <Notice className="mt-6" variant="info" role="status" title="Public Request information">
      <p>Discovery shows only a public place and coarse location. Private meeting details and Explorer information remain hidden.</p>
    </Notice>

    <section className="mt-8" aria-labelledby="available-requests-heading">
      <h2 id="available-requests-heading" className="text-heading-2">Available Journey Requests</h2>
      {loadState === "loading" && <StatePanel title="Loading Requests" busy><p role="status">Checking for compatible scheduled Journey Requests…</p></StatePanel>}
      {loadState === "error" && <StatePanel title="Requests could not be loaded" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Try again</Button>}><p role="alert">{error}</p></StatePanel>}
      {loadState === "ready" && requests.length === 0 && <StatePanel title="No compatible Requests"><p role="status">There are currently no compatible scheduled Journey Requests to review.</p></StatePanel>}
      {loadState === "ready" && requests.length > 0 && <ul className="mt-4 grid gap-4">{requests.map(request => <li key={request.id}>
        <Surface className="overflow-hidden">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><h3 className="break-words text-heading-3"><Link href={`/operator/requests/${request.id}`} className="text-link underline-offset-4 hover:underline">{request.publicPlaceName}</Link></h3><p className="mt-1 break-words text-body-sm text-ink-secondary">{request.coarseLocation}</p></div>
            {request.status && <StatusBadge>{request.status}</StatusBadge>}
          </div>
          <MetadataList className="mt-5" items={[
            { term: "Requested window", detail: <span className="break-words">{requestedWindow(request)}</span> },
            { term: "Duration", detail: `${request.durationMinutes} minutes` },
            { term: "Proposed compensation", detail: `${request.proposedPriceMinor} ${request.currency} (minor units)` },
          ]} />
          <ActionLink href={`/operator/requests/${request.id}`} variant="secondary" className="mt-5 w-full sm:w-auto">Review and propose</ActionLink>
        </Surface>
      </li>)}</ul>}
    </section>
  </main>;
}
