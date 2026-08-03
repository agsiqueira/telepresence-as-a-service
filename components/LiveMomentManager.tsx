"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Field, MetadataList, Notice, Select, StatePanel, StatusBadge, Surface } from "@/components/ui/primitives";

type Moment = { id: string; status: "DRAFT" | "PUBLISHED" | "PAUSED" | "ARCHIVED"; publicPlaceName: string; coarseLocation: string; durationMinutes: number; priceMinor: number; currency: string; capacity: number; version: number; liveMoment: { availabilityStart: string; availabilityEnd: string; expiresAt: string }; _count: { claims: number } };
type LoadState = "loading" | "ready" | "error";
type Feedback = { kind: "success" | "error"; text: string } | null;
const initial = { publicPlaceName: "", coarseLocation: "", durationMinutes: 30, priceMinor: 2500, currency: "USD", capacity: 1, availabilityStart: "", availabilityEnd: "", expiresAt: "" };

export default function LiveMomentManager() {
  const [items, setItems] = useState<Moment[]>([]);
  const [form, setForm] = useState(initial);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    try { const response = await fetch("/api/operator/live-moments", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Live Moments could not be loaded."); setItems(data.liveMoments ?? []); setLoadState("ready"); }
    catch (value) { setFeedback({ kind: "error", text: value instanceof Error ? value.message : "Live Moments could not be loaded." }); setLoadState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending) return; setPending("create"); setFeedback(null);
    try { const body = { ...form, availabilityStart: new Date(form.availabilityStart).toISOString(), availabilityEnd: new Date(form.availabilityEnd).toISOString(), expiresAt: new Date(form.expiresAt).toISOString() }; const response = await fetch("/api/operator/live-moments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Check the Live Moment details and try again."); setForm(initial); await load(); setFeedback({ kind: "success", text: "Live Moment draft created." }); }
    catch (value) { setFeedback({ kind: "error", text: value instanceof Error ? value.message : "Check the Live Moment details and try again." }); } finally { setPending(""); }
  }

  async function action(item: Moment, name: "publish" | "pause" | "resume" | "archive") {
    const key = `${item.id}:${name}`; if (pending) return; setPending(key); setFeedback(null);
    try { const response = await fetch(`/api/operator/live-moments/${item.id}/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: item.version }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error ?? `Live Moment could not ${name}. Refresh and try again.`); await load(); setFeedback({ kind: "success", text: `Live Moment ${name} succeeded.` }); }
    catch (value) { setFeedback({ kind: "error", text: value instanceof Error ? value.message : `Live Moment could not ${name}. Refresh and try again.` }); } finally { setPending(""); }
  }

  const actionLabel = (id: string, name: string, label: string) => pending === `${id}:${name}` ? `${label.replace(/e?$/, "")}ing…` : label;
  return <section aria-labelledby="live-moment-manager-title" className="mt-10"><h2 id="live-moment-manager-title" className="text-heading-2">Live Moments</h2><p className="mt-2 text-body-sm text-ink-secondary">A Live Moment is a time-bounded offering with a fixed availability window and bookable capacity.</p>
    <Surface className="mt-5"><h3 className="text-heading-3">Create Live Moment draft</h3><p className="mt-2 text-body-sm text-ink-secondary">Dates and times use this device’s timezone and are verified by the server.</p><form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
      <Field id="live-place" label="Public place"><input required value={form.publicPlaceName} onChange={event => setForm({ ...form, publicPlaceName: event.target.value })} className="unfar-control" /></Field><Field id="live-location" label="Coarse location"><input required value={form.coarseLocation} onChange={event => setForm({ ...form, coarseLocation: event.target.value })} className="unfar-control" /></Field>
      <Field id="live-start" label="Availability starts"><input required type="datetime-local" value={form.availabilityStart} onChange={event => setForm({ ...form, availabilityStart: event.target.value })} className="unfar-control" /></Field><Field id="live-end" label="Availability ends"><input required type="datetime-local" value={form.availabilityEnd} onChange={event => setForm({ ...form, availabilityEnd: event.target.value, expiresAt: event.target.value })} className="unfar-control" /></Field>
      <Field id="live-duration" label="Duration in minutes"><input required type="number" min="1" max="1440" value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: Number(event.target.value) })} className="unfar-control" /></Field><Field id="live-price" label="Price in minor units"><input required type="number" min="1" value={form.priceMinor} onChange={event => setForm({ ...form, priceMinor: Number(event.target.value) })} className="unfar-control" /></Field>
      <Field id="live-currency" label="Currency"><Select value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })}><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option><option>BRL</option></Select></Field><Field id="live-capacity" label="Bookable slots"><input required type="number" min="1" max="1000" value={form.capacity} onChange={event => setForm({ ...form, capacity: Number(event.target.value) })} className="unfar-control" /></Field>
      <Button className="sm:col-span-2 sm:w-fit" type="submit" disabled={Boolean(pending)}>{pending === "create" ? "Creating draft…" : "Create draft"}</Button>
    </form></Surface>
    {feedback && <Notice className="mt-4" variant={feedback.kind === "error" ? "danger" : "success"} role={feedback.kind === "error" ? "alert" : "status"}><p>{feedback.text}</p></Notice>}
    <section className="mt-7" aria-labelledby="existing-live-moments"><h3 id="existing-live-moments" className="text-heading-3">Existing Live Moments</h3>
      {loadState === "loading" && <StatePanel title="Loading Live Moments" busy><p role="status">Loading existing Live Moments…</p></StatePanel>}{loadState === "error" && <StatePanel title="Live Moments could not be loaded" tone="danger" action={<Button variant="secondary" onClick={() => void load()}>Retry</Button>}><p role="alert">Existing successfully loaded items remain unchanged.</p></StatePanel>}{loadState === "ready" && items.length === 0 && <StatePanel title="No Live Moments yet"><p>Create a draft to begin managing a time-bounded offering.</p></StatePanel>}
      {items.length > 0 && <ul className="mt-4 grid gap-4">{items.map(item => <li key={item.id}><Surface><div className="flex min-w-0 flex-wrap justify-between gap-3"><div className="min-w-0"><h4 className="break-words text-heading-3">{item.publicPlaceName}</h4><p className="mt-1 break-words text-body-sm text-ink-secondary">{item.coarseLocation}</p></div><StatusBadge>{item.status}</StatusBadge></div><MetadataList className="mt-5" items={[{ term: "Availability starts", detail: new Date(item.liveMoment.availabilityStart).toLocaleString() }, { term: "Availability ends", detail: new Date(item.liveMoment.availabilityEnd).toLocaleString() }, { term: "Duration", detail: `${item.durationMinutes} minutes` }, { term: "Compensation", detail: `${(item.priceMinor / 100).toFixed(2)} ${item.currency} (${item.priceMinor} minor units)` }, { term: "Claims / capacity", detail: `${item._count.claims} / ${item.capacity}` }]} /><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{item.status === "DRAFT" && <Button variant="secondary" disabled={Boolean(pending)} onClick={() => void action(item, "publish")}>{pending === `${item.id}:publish` ? "Publishing…" : "Publish Live Moment"}</Button>}{item.status === "PUBLISHED" && <Button variant="secondary" disabled={Boolean(pending)} onClick={() => void action(item, "pause")}>{actionLabel(item.id, "pause", "Pause")}</Button>}{item.status === "PAUSED" && <Button variant="secondary" disabled={Boolean(pending)} onClick={() => void action(item, "resume")}>{actionLabel(item.id, "resume", "Resume")}</Button>}{item.status !== "ARCHIVED" && <Button variant="danger" disabled={Boolean(pending)} onClick={() => void action(item, "archive")}>{pending === `${item.id}:archive` ? "Archiving…" : "Archive"}</Button>}</div></Surface></li>)}</ul>}
    </section>
    <div className="sr-only" role="status" aria-live="polite">{feedback?.kind === "success" ? feedback.text : ""}</div>
  </section>;
}
