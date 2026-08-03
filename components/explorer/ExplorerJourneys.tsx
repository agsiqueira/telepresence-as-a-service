"use client";

import { useCallback, useEffect, useState } from "react";
import FeedbackForm from "@/components/FeedbackForm";
import JourneyReviewPanel from "@/components/JourneyReviewPanel";
import SafetyReportDialog from "@/components/SafetyReportDialog";
import { Button, LiveRegion, MetadataList, Notice, PageHeader, Skeleton, StatePanel, StatusBadge, Surface } from "@/components/ui/primitives";
import { requireJsonResponse } from "@/lib/resilient-poller";

type JourneyStatus = "REQUESTED" | "OFFERED" | "ACCEPTED" | "IN_PROGRESS" | "ENDED" | "FEEDBACK_COMPLETED" | "CANCELLED" | "NO_OPERATOR_AVAILABLE";
type CurrentJourney = { id: string; destination: string; status: JourneyStatus; acceptedAt: string | null; hasOffer?: boolean };
type HistoryJourney = CurrentJourney & { requestedDuration: number | null; requestedAt: string };
type LoadState = "loading" | "ready" | "failed";

const statusLabel = (status: JourneyStatus) => ({
  REQUESTED: "Matching",
  OFFERED: "Teleporter reviewing",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "Portal active",
  ENDED: "Follow-up available",
  FEEDBACK_COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_OPERATOR_AVAILABLE: "No compatible Teleporter",
})[status];

const statusTone = (status: JourneyStatus) => status === "IN_PROGRESS" ? "live" : status === "ACCEPTED" || status === "FEEDBACK_COMPLETED" ? "success" : status === "CANCELLED" || status === "NO_OPERATOR_AVAILABLE" ? "warning" : status === "ENDED" ? "info" : "neutral";
const followUpEligible = (status: JourneyStatus) => status === "ENDED" || status === "FEEDBACK_COMPLETED";
const safetyEligible = (status: JourneyStatus) => ["ACCEPTED", "IN_PROGRESS", "ENDED", "FEEDBACK_COMPLETED", "CANCELLED"].includes(status);

export default function ExplorerJourneys() {
  const [current, setCurrent] = useState<CurrentJourney | null>(null);
  const [currentState, setCurrentState] = useState<LoadState>("loading");
  const [history, setHistory] = useState<HistoryJourney[]>([]);
  const [historyState, setHistoryState] = useState<LoadState>("loading");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const loadCurrent = useCallback(async () => {
    setCurrentState("loading");
    try {
      const data = await requireJsonResponse<{ trip: CurrentJourney | null }>(await fetch("/api/trips/current", { cache: "no-store" }));
      setCurrent(data.trip);
      setCurrentState("ready");
    } catch {
      setCurrentState("failed");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryState("loading");
    try {
      const data = await requireJsonResponse<{ history: HistoryJourney[] }>(await fetch("/api/trips/history?limit=50", { cache: "no-store" }));
      setHistory(data.history ?? []);
      setHistoryState("ready");
    } catch {
      setHistoryState("failed");
    }
  }, []);

  useEffect(() => { void loadCurrent(); void loadHistory(); }, [loadCurrent, loadHistory]);

  function toggleJourney(id: string) {
    setExpandedId(value => {
      const next = value === id ? null : id;
      setAnnouncement(next ? "Journey follow-up opened." : "Journey follow-up closed.");
      return next;
    });
  }

  return <main className="mx-auto max-w-participant px-4 py-10 sm:px-6">
    <PageHeader eyebrow="Explorer" title="Journeys" description="Restore your current Journey and revisit completed Journey follow-up." />
    <LiveRegion className="sr-only">{announcement}</LiveRegion>

    <section className="mt-8" aria-labelledby="current-journey-heading">
      <h2 id="current-journey-heading" className="text-heading-2">Current Journey</h2>
      <div className="mt-4">
        {currentState === "loading" && <Surface aria-busy="true"><Skeleton className="w-32" /><Skeleton className="mt-3 w-2/3" /><p className="sr-only" role="status">Restoring current Journey…</p></Surface>}
        {currentState === "failed" && <Notice variant="danger" title="Current Journey could not be restored"><p>Check your connection and try again.</p><Button variant="secondary" className="mt-4" onClick={() => void loadCurrent()}>Retry</Button></Notice>}
        {currentState === "ready" && !current && <StatePanel title="No active Journey"><p>Your requesting, matching, and active Portal status will appear here.</p></StatePanel>}
        {currentState === "ready" && current && <Surface><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-label text-ink-muted">Current Journey</p><h3 className="mt-1 text-heading-3">{current.destination}</h3></div><StatusBadge variant={statusTone(current.status)}>{statusLabel(current.status)}</StatusBadge></div><p className="mt-4 text-body-sm text-ink-secondary">Open Discover to continue the current immediate Journey flow or reconnect to its Portal.</p><a href="/viewer" className="mt-4 inline-flex min-h-control items-center text-link underline underline-offset-4">Continue on Discover</a></Surface>}
      </div>
    </section>

    <section className="mt-10" aria-labelledby="journey-history-heading">
      <h2 id="journey-history-heading" className="text-heading-2">Journey history</h2>
      <p className="mt-2 text-body-sm text-ink-secondary">Open one Journey at a time to access its available Feedback, Review, simulated Tip, and safety actions.</p>
      <div className="mt-4">
        {historyState === "loading" && <Surface aria-busy="true"><Skeleton className="w-40" /><Skeleton className="mt-3 w-full" /><Skeleton className="mt-2 w-3/4" /><p className="sr-only" role="status">Loading Journey history…</p></Surface>}
        {historyState === "failed" && <Notice variant="danger" title="Journey history could not be loaded"><p>Your current Journey status is unaffected.</p><Button variant="secondary" className="mt-4" onClick={() => void loadHistory()}>Retry</Button></Notice>}
        {historyState === "ready" && history.length === 0 && <StatePanel title="No Journey history"><p>Your completed and previous Journeys will appear here.</p></StatePanel>}
        {historyState === "ready" && history.length > 0 && <ul className="grid gap-3">{history.map(item => {
          const expanded = expandedId === item.id;
          const panelId = `journey-follow-up-${item.id}`;
          return <li key={item.id}><Surface className="p-0 sm:p-0"><div className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="text-heading-3">{item.destination}</h3><p className="mt-1 text-body-sm text-ink-secondary">Requested {new Date(item.requestedAt).toLocaleString()}</p></div><StatusBadge variant={statusTone(item.status)}>{statusLabel(item.status)}</StatusBadge></div><MetadataList className="mt-4" items={[{ term: "Duration", detail: item.requestedDuration ? `${item.requestedDuration} minutes` : "Not recorded" }, { term: "Status", detail: statusLabel(item.status) }]} /><Button variant="secondary" className="mt-5 w-full sm:w-auto" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggleJourney(item.id)}>{expanded ? "Close Journey details" : "Open Journey details"}</Button></div>{expanded && <div id={panelId} className="border-t border-line p-4 sm:p-5"><h4 className="text-heading-3">Journey follow-up</h4>{item.status === "ENDED" && <div className="mt-4"><p className="text-body-sm text-ink-secondary">Private Feedback is internal research Feedback. It is not shared with the Teleporter or used in Journey Reviews.</p><FeedbackForm embedded tripId={item.id} onDone={() => { setAnnouncement("Private Journey Feedback completed."); void loadHistory(); }} /></div>}{safetyEligible(item.status) && <div className="mt-4"><SafetyReportDialog tripId={item.id} /></div>}{followUpEligible(item.status) && <JourneyReviewPanel tripId={item.id} />}{!safetyEligible(item.status) && !followUpEligible(item.status) && <p className="mt-3 text-body-sm text-ink-secondary">No follow-up actions are available for this Journey.</p>}</div>}</Surface></li>;
        })}</ul>}
      </div>
    </section>
  </main>;
}
