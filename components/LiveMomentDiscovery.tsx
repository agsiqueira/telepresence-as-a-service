"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DiscoveryCard from "@/components/explorer/DiscoveryCard";
import { ActionLink, Button, LiveRegion, MetadataList, Notice, Skeleton, StatePanel, Surface } from "@/components/ui/primitives";
import { liveMomentStartBounds } from "@/lib/datetime-local";

type Moment = { id: string; publicPlaceName: string; coarseLocation: string; durationMinutes: number; liveMoment: { availabilityStart: string; availabilityEnd: string; expiresAt: string } };
type Claim = { id: string; startAt: string; endAt: string; expiresAt: string; journeyRequestId: string; proposalId: string; listing: { publicPlaceName: string } };
type LoadState = "loading" | "refreshing" | "ready" | "failed";

export default function LiveMomentDiscovery({ restricted = false }: { restricted?: boolean }) {
  const [items, setItems] = useState<Moment[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [starts, setStarts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [state, setState] = useState<LoadState>("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const status = useRef<HTMLDivElement>(null);

  const load = useCallback(async (background = false) => {
    setState(current => background && current === "ready" ? "refreshing" : "loading");
    try {
      const [availableResponse, claimsResponse] = await Promise.all([
        fetch("/api/live-moments", { cache: "no-store" }),
        fetch("/api/live-moment-claims", { cache: "no-store" }),
      ]);
      if (!availableResponse.ok || !claimsResponse.ok) throw new Error("Live Moments unavailable");
      const available = await availableResponse.json();
      const current = await claimsResponse.json();
      setItems(available.liveMoments ?? []);
      setClaims(current.claims ?? []);
      setState("ready");
    } catch {
      setState("failed");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  useEffect(() => {
    setStarts(current => Object.fromEntries(Object.entries(current).filter(([id, value]) => {
      const item = items.find(candidate => candidate.id === id);
      if (!item) return false;
      const bounds = liveMomentStartBounds(item.liveMoment.availabilityStart, item.liveMoment.availabilityEnd, item.durationMinutes);
      const selected = new Date(value);
      return Boolean(bounds && Number.isFinite(selected.getTime()) && selected >= bounds.start && selected <= bounds.latestStart);
    })));
  }, [items]);

  function announce(value: string) {
    setMessage(value);
    requestAnimationFrame(() => status.current?.focus());
  }

  async function claim(item: Moment) {
    const bounds = liveMomentStartBounds(item.liveMoment.availabilityStart, item.liveMoment.availabilityEnd, item.durationMinutes);
    if (!bounds) { announce(`No valid start fits within the window for ${item.publicPlaceName}.`); return; }
    const start = starts[item.id];
    if (!start) { announce(`Choose a start time for ${item.publicPlaceName} first.`); return; }
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/live-moments/${item.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startAt: new Date(start).toISOString() }) });
      if (!response.ok) throw new Error("That start is no longer available. Refreshing Live Moments.");
      announce("Live Moment held for ten minutes. Review the Proposal to continue.");
      await load(true);
    } catch (error) {
      announce(error instanceof Error ? error.message : "Live Moment is temporarily unavailable.");
      await load(true);
    } finally { setBusyId(null); }
  }

  async function abandon(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/live-moment-claims/${id}/abandon`, { method: "POST" });
      if (!response.ok) throw new Error("The hold could not be released. Refresh and try again.");
      announce("Live Moment hold released.");
      await load(true);
    } catch (error) { announce(error instanceof Error ? error.message : "The hold could not be released."); }
    finally { setBusyId(null); }
  }

  return (
    <section aria-labelledby="live-moment-discovery-title" className="mt-10">
      <div className="max-w-prose"><h2 id="live-moment-discovery-title" className="text-heading-2">Live Moments</h2><p className="mt-2 text-body-sm text-ink-secondary">Choose an exact start within a published window. A successful server hold lasts ten minutes.</p></div>
      <div ref={status} tabIndex={-1} className="outline-none"><LiveRegion className="mt-3">{message}</LiveRegion></div>
      {restricted && <Notice className="mt-4" variant="warning" title="Live Moments are read-only"><p>Your safety restriction prevents new holds. Existing holds remain visible.</p></Notice>}
      {claims.length > 0 && <div className="mt-5"><h3 className="text-heading-3">Active Live Moment holds</h3><div className="mt-3 grid gap-4 lg:grid-cols-2">{claims.map(claim => <DiscoveryCard key={claim.id} title={claim.listing.publicPlaceName} typeLabel="Live Moment hold" status="Hold active" statusTone="warning" metadata={<MetadataList items={[{ term: "Journey time", detail: `${new Date(claim.startAt).toLocaleString()} – ${new Date(claim.endAt).toLocaleTimeString()}` }, { term: "Hold expires", detail: new Date(claim.expiresAt).toLocaleString() }]} />} action={<div className="flex flex-col gap-2 sm:flex-row"><ActionLink href={`/viewer/requests/${claim.journeyRequestId}`} className="w-full sm:w-auto" aria-label={`Review Proposal for ${claim.listing.publicPlaceName}`}>Review Proposal</ActionLink><Button variant="secondary" disabled={busyId === claim.id || restricted} onClick={() => void abandon(claim.id)} className="w-full sm:w-auto">{busyId === claim.id ? "Releasing…" : "Release hold"}</Button></div>} />)}</div></div>}
      {state === "loading" && <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-busy="true"><Surface><Skeleton className="w-28"/><Skeleton className="mt-4 w-3/4"/><Skeleton className="mt-3 w-full"/></Surface><Surface><Skeleton className="w-24"/><Skeleton className="mt-4 w-2/3"/><Skeleton className="mt-3 w-full"/></Surface><span className="sr-only" role="status">Loading Live Moments…</span></div>}
      {state === "failed" && <StatePanel title="Live Moments are temporarily unavailable" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Retry Live Moments</Button>}><p>Other discovery options remain available.</p></StatePanel>}
      {(state === "ready" || state === "refreshing") && items.length === 0 && <StatePanel title="No Live Moments available"><p>Check Guided Experiences and destinations, or return later.</p></StatePanel>}
      {(state === "ready" || state === "refreshing") && items.length > 0 && <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-busy={state === "refreshing" || undefined}>{items.map(item => { const bounds = liveMomentStartBounds(item.liveMoment.availabilityStart, item.liveMoment.availabilityEnd, item.durationMinutes), unavailable = !bounds; return <DiscoveryCard key={item.id} title={item.publicPlaceName} typeLabel="Live Moment" status={restricted ? "Read-only" : unavailable ? "No valid start" : busyId === item.id ? "Creating hold" : "Available"} statusTone={restricted || unavailable ? "warning" : busyId === item.id ? "info" : "success"} metadata={<MetadataList items={[{ term: "Location", detail: item.coarseLocation }, { term: "Available window", detail: `${new Date(item.liveMoment.availabilityStart).toLocaleString()} – ${new Date(item.liveMoment.availabilityEnd).toLocaleString()}` }, { term: "Duration", detail: `${item.durationMinutes} minutes` }]} />} action={<div><label className="text-label" htmlFor={`live-start-${item.id}`}>Start time</label><input id={`live-start-${item.id}`} type="datetime-local" {...(bounds ? { min: bounds.min, max: bounds.max } : {})} value={starts[item.id] ?? ""} onChange={event => setStarts(current => ({ ...current, [item.id]: event.target.value }))} className="unfar-control mt-2" aria-describedby={`window-${item.id}`} disabled={restricted || unavailable}/><p id={`window-${item.id}`} className="mt-2 text-body-sm text-ink-muted">{unavailable ? "No valid start fits within this availability window." : `The full ${item.durationMinutes}-minute Journey must fit inside this window.`}</p><Button disabled={busyId !== null || restricted || unavailable} onClick={() => void claim(item)} className="mt-4 w-full" aria-label={`Hold Live Moment at ${item.publicPlaceName}`}>{busyId === item.id ? "Creating hold…" : "Hold and review"}</Button></div>} />; })}</div>}
    </section>
  );
}
