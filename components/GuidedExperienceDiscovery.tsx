"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DiscoveryCard from "@/components/explorer/DiscoveryCard";
import { Button, LiveRegion, MetadataList, Notice, Skeleton, StatePanel, Surface } from "@/components/ui/primitives";

type Occurrence = { id: string; availabilityStart: string; availabilityEnd: string; titleSnapshot: string; descriptionSnapshot: string; publicPlaceSnapshot: string; coarseLocationSnapshot: string; durationMinutesSnapshot: number; claimable: boolean };
type Item = { id: string; occurrences: Occurrence[] };
type Claim = { id: string; expiresAt: string; occurrence: { titleSnapshot: string; publicPlaceSnapshot: string } };
type LoadState = "loading" | "refreshing" | "ready" | "failed";

export default function GuidedExperienceDiscovery({ restricted = false }: { restricted?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<LoadState>("loading");
  const status = useRef<HTMLDivElement>(null);

  const load = useCallback(async (background = false) => {
    setState(current => background && current === "ready" ? "refreshing" : "loading");
    try {
      const [listResponse, claimsResponse] = await Promise.all([
        fetch("/api/guided-experiences", { cache: "no-store" }),
        fetch("/api/guided-experience-claims", { cache: "no-store" }),
      ]);
      if (!listResponse.ok || !claimsResponse.ok) throw new Error("Guided Experiences unavailable");
      const list = await listResponse.json();
      const current = await claimsResponse.json();
      setItems(list.guidedExperiences ?? []);
      setClaims(current.claims ?? []);
      setState("ready");
    } catch { setState("failed"); }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load(true);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [load]);

  function announce(value: string) {
    setMessage(value);
    requestAnimationFrame(() => status.current?.focus());
  }

  async function claim(listingId: string, occurrence: Occurrence) {
    setBusyId(occurrence.id);
    try {
      const response = await fetch(`/api/guided-experiences/${listingId}/occurrences/${occurrence.id}/claim`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Occurrence is no longer available.");
      await load(true);
      announce("Guided Experience held for ten minutes. Review the server-authored Proposal to continue.");
    } catch (error) {
      await load(true);
      announce(error instanceof Error ? error.message : "Occurrence is no longer available.");
    } finally { setBusyId(null); }
  }

  async function abandon(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/guided-experience-claims/${id}/abandon`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error((await response.json()).error ?? "Unable to release claim.");
      await load(true);
      announce("Guided Experience claim released.");
    } catch (error) { announce(error instanceof Error ? error.message : "Unable to release claim."); }
    finally { setBusyId(null); }
  }

  const occurrences = items.flatMap(item => item.occurrences.map(occurrence => ({ listingId: item.id, occurrence })));
  return (
    <section aria-labelledby="guided-discovery-title" className="mt-10">
      <div className="max-w-prose"><h2 id="guided-discovery-title" className="text-heading-2">Guided Experiences</h2><p className="mt-2 text-body-sm text-ink-secondary">Choose a specific scheduled occurrence. Times use your local timezone; the server confirms availability.</p></div>
      <div ref={status} tabIndex={-1} className="outline-none"><LiveRegion className="mt-3">{message}</LiveRegion></div>
      {restricted && <Notice className="mt-4" variant="warning" title="Guided Experiences are read-only"><p>Your safety restriction prevents new claims. Existing claims remain visible.</p></Notice>}
      {claims.length > 0 && <div className="mt-5"><h3 className="text-heading-3">Held Guided Experiences</h3><div className="mt-3 grid gap-4 lg:grid-cols-2">{claims.map(value => <DiscoveryCard key={value.id} title={value.occurrence.titleSnapshot} typeLabel="Guided Experience claim" status="Claim active" statusTone="warning" metadata={<MetadataList items={[{ term: "Location", detail: value.occurrence.publicPlaceSnapshot }, { term: "Claim expires", detail: new Date(value.expiresAt).toLocaleString() }]} />} action={<Button variant="secondary" disabled={busyId === value.id || restricted} onClick={() => void abandon(value.id)} className="w-full sm:w-auto">{busyId === value.id ? "Releasing…" : "Release claim"}</Button>} />)}</div></div>}
      {state === "loading" && <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-busy="true"><Surface><Skeleton className="w-32"/><Skeleton className="mt-4 w-3/4"/><Skeleton className="mt-3 w-full"/></Surface><Surface><Skeleton className="w-28"/><Skeleton className="mt-4 w-2/3"/><Skeleton className="mt-3 w-full"/></Surface><span className="sr-only" role="status">Loading Guided Experiences…</span></div>}
      {state === "failed" && <StatePanel title="Guided Experiences are temporarily unavailable" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Retry Guided Experiences</Button>}><p>Live Moments and destinations remain available.</p></StatePanel>}
      {(state === "ready" || state === "refreshing") && occurrences.length === 0 && <StatePanel title="No Guided Experiences available"><p>Check Live Moments and destinations, or return later.</p></StatePanel>}
      {(state === "ready" || state === "refreshing") && occurrences.length > 0 && <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-busy={state === "refreshing" || undefined}>{occurrences.map(({ listingId, occurrence }) => { const unavailable = !occurrence.claimable; return <DiscoveryCard key={occurrence.id} title={occurrence.titleSnapshot} typeLabel="Guided Experience" status={restricted ? "Read-only" : busyId === occurrence.id ? "Creating claim" : unavailable ? "No longer available" : "Available"} statusTone={restricted || unavailable ? "warning" : busyId === occurrence.id ? "info" : "guided"} description={<p>{occurrence.descriptionSnapshot}</p>} metadata={<MetadataList items={[{ term: "Location", detail: `${occurrence.publicPlaceSnapshot}, ${occurrence.coarseLocationSnapshot}` }, { term: "When", detail: `${new Date(occurrence.availabilityStart).toLocaleString()} – ${new Date(occurrence.availabilityEnd).toLocaleString()}` }, { term: "Duration", detail: `${occurrence.durationMinutesSnapshot} minutes` }]} />} action={<Button disabled={busyId !== null || unavailable || restricted} aria-disabled={busyId !== null || unavailable || restricted} onClick={() => void claim(listingId, occurrence)} className="w-full" aria-label={`Claim Guided Experience ${occurrence.titleSnapshot}`}>{busyId === occurrence.id ? "Creating claim…" : unavailable ? "Occurrence unavailable" : "Claim and review"}</Button>} />; })}</div>}
    </section>
  );
}
