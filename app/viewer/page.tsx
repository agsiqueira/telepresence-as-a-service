"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import FeedbackForm from "@/components/FeedbackForm";
import SafetyReportDialog from "@/components/SafetyReportDialog";
import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
import LiveMomentDiscovery from "@/components/LiveMomentDiscovery";
import GuidedExperienceDiscovery from "@/components/GuidedExperienceDiscovery";
import DiscoveryCard from "@/components/explorer/DiscoveryCard";
import { Button, Choice, Field, LiveRegion, MetadataList, Notice, PageHeader, Select, Skeleton, StatePanel, StatusBadge, Surface, TextArea } from "@/components/ui/primitives";
import { createResilientPoller, requireJsonResponse } from "@/lib/resilient-poller";

type Trip = {
  id: string;
  destination: string;
  status: "REQUESTED" | "OFFERED" | "ACCEPTED" | "IN_PROGRESS" | "ENDED" | "FEEDBACK_COMPLETED" | "CANCELLED" | "NO_OPERATOR_AVAILABLE";
  acceptedAt: string | null;
  hasOffer?: boolean;
};

type Destination = {
  id: string;
  name: string;
  shortDescription: string;
  city: string;
  meetingArea: string;
  category: string;
  durationOptions: number[];
  custom: boolean;
};

type Phase = "browse" | "review" | "waiting" | "call" | "feedback";
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (!body) throw new Error(`The server returned an empty response (${response.status})`);
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`The server returned an unexpected response (${response.status})`);
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`The server returned invalid JSON (${response.status})`);
  }
  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data && typeof data.error === "string"
      ? data.error
      : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data as T;
}

export default function ViewerPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selected, setSelected] = useState<Destination | null>(null);
  const [meetingArea, setMeetingArea] = useState("");
  const [duration, setDuration] = useState(30);
  const [viewerNote, setViewerNote] = useState("");
  const [language, setLanguage] = useState("");
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string[]>([]);
  const [customDestination, setCustomDestination] = useState("");
  const [requestError, setRequestError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [safetyRestricted, setSafetyRestricted] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [destinationsState, setDestinationsState] = useState<"loading" | "ready" | "failed">("loading");
  const [restorationState, setRestorationState] = useState<"loading" | "ready" | "failed">("loading");
  const [bootstrapRetry, setBootstrapRetry] = useState(0);
  const [phase, setPhase] = useState<Phase>("browse");
  const [videoToken, setVideoToken] = useState<{
    token: string;
    url: string;
  } | null>(null);
  const [tripEnded, setTripEnded] = useState(false);
  const [pollingMessage, setPollingMessage] = useState("");
  const [pollRetry, setPollRetry] = useState(0);
  const endingRef = useRef(false);
  const feedbackTransitionRef = useRef(false);
  const leaveRequestRef = useRef(false);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const discoverHeadingRef = useRef<HTMLDivElement>(null);
  const tripId = trip?.id;

  useEffect(() => {
    setDestinationsState("loading");
    setRestorationState("loading");
    void fetchJson<{ destinations: Destination[] }>("/api/destinations")
      .then(data => { setDestinations(data.destinations ?? []); setDestinationsState("ready"); })
      .catch(() => setDestinationsState("failed"));
    void fetchJson<{ trip: Trip | null }>("/api/trips/current")
      .then(data => {
        setRestorationState("ready");
        if (!data.trip) return;
        setTrip(data.trip);
        setPhase("waiting");
      })
      .catch(() => setRestorationState("failed"));
  }, [bootstrapRetry]);

  function chooseDestination(destination: Destination) {
    setSelected(destination);
    setMeetingArea("");
    setDuration(destination.durationOptions[0] ?? 30);
    setRequestError("");
  }

  function enterReview() {
    setPhase("review");
    requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }

  function returnToDiscover() {
    setRequestError("");
    setPhase("browse");
    requestAnimationFrame(() => discoverHeadingRef.current?.focus());
  }

  async function requestTrip() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setRequestError("");

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationId: selected.id, meetingArea, requestedDuration: duration, viewerNote, preferredLanguage: language, accessibilityNeeds, customDestination }),
      });
      const data = await res.json();
      if (!res.ok) { setRequestError(data.error ?? "Unable to request this Journey"); return; }
      setTrip(data.trip);
      setPhase("waiting");
    } catch { setRequestError("The Journey request could not be submitted. Check your connection and try again."); }
    finally { setSubmitting(false); }
  }

  async function cancelTrip() {
    if (!trip || cancelling) return;
    setCancelling(true);
    setRequestError("");
    try {
      const response = await fetch(`/api/trips/${trip.id}/cancel`, { method: "POST" });
      if (!response.ok) { setRequestError("The Journey could not be cancelled. Refresh its status and try again."); return; }
      setTrip(null);
      setTransitionMessage("Journey request cancelled.");
      setPhase("browse");
    } catch { setRequestError("The Journey could not be cancelled. Check your connection and try again."); }
    finally { setCancelling(false); }
  }

  async function leaveCall() {
    if (!trip || leaveRequestRef.current) return;

    leaveRequestRef.current = true;
    const response = await fetch(`/api/trips/${trip.id}/end`, {
      method: "POST",
    });

    if (response.ok || response.status === 409) {
      endingRef.current = true;
      setTripEnded(true);
    } else {
      leaveRequestRef.current = false;
      setPollingMessage("The Journey could not be ended. Check your connection and try again.");
    }
  }

  function transitionToFeedback() {
    if (feedbackTransitionRef.current) return;

    feedbackTransitionRef.current = true;
    setTripEnded(false);
    setVideoToken(null);
    setPollingMessage("");
    setPhase("feedback");
  }

  function resetViewerDashboard() {
    setSelected(null);
    setMeetingArea("");
    setViewerNote("");
    setLanguage("");
    setAccessibilityNeeds([]);
    setCustomDestination("");
    setRequestError("");
    setTrip(null);
    setVideoToken(null);
    setTripEnded(false);
    setPollingMessage("");
    endingRef.current = false;
    feedbackTransitionRef.current = false;
    leaveRequestRef.current = false;
    setPhase("browse");
  }

  useEffect(() => {
    if (phase !== "waiting" || !tripId) return;
    setPollingMessage("");
    return createResilientPoller({
      intervalMs: 2500,
      maxIntervalMs: 20000,
      poll: async signal => {
        const res = await fetch(`/api/trips/${tripId}`, { cache: "no-store", signal });
        const data = await requireJsonResponse<{ trip: Trip | null }>(res);
        if (!data.trip) return "stop";
        setTrip(data.trip);

        if (data.trip.status === "IN_PROGRESS") {
          const tokenRes = await fetch("/api/livekit-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId }),
            signal,
          });
          const tokenData = await requireJsonResponse<{ token: string; url: string }>(tokenRes);
          setVideoToken({ token: tokenData.token, url: tokenData.url });
          endingRef.current = false;
          feedbackTransitionRef.current = false;
          leaveRequestRef.current = false;
          setPhase("call");
          return "stop";
        }
        if (data.trip.status === "CANCELLED" || data.trip.status === "ENDED" || data.trip.status === "FEEDBACK_COMPLETED") {
          setPhase(data.trip.status === "ENDED" ? "feedback" : "browse");
          return "stop";
        }
        return "continue";
      },
      onPersistentFailure: () => setPollingMessage("Connection interrupted. Journey status will update when the connection returns."),
      onRecovery: () => setPollingMessage(""),
    });
  }, [phase, tripId, pollRetry]);

  useEffect(() => {
    if (phase !== "call" || !tripId) return;

    setPollingMessage("");
    return createResilientPoller({
      intervalMs: 1000,
      maxIntervalMs: 8000,
      poll: async signal => {
        const res = await fetch(`/api/trips/${tripId}`, { cache: "no-store", signal });
        const data = await requireJsonResponse<{ trip: Trip | null }>(res);
        if (data.trip?.status === "ENDED" && !endingRef.current) {
          endingRef.current = true;
          setTrip(data.trip);
          setTripEnded(true);
          return "stop";
        }
        if (data.trip && data.trip.status !== "IN_PROGRESS") return "stop";
        return "continue";
      },
      onPersistentFailure: () => setPollingMessage("Connection interrupted. Journey status will update when the connection returns."),
      onRecovery: () => setPollingMessage(""),
    });
  }, [phase, tripId, pollRetry]);

  if (phase === "browse") {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <div ref={discoverHeadingRef} tabIndex={-1} className="outline-none"><PageHeader title="Discover" description="Choose a Live Moment, a Guided Experience, or an immediate destination Journey." /></div>
        {transitionMessage && <Notice className="mt-5" variant="success" title={transitionMessage}><p>You can choose another discovery option when you are ready.</p></Notice>}
        <div className="mt-6"><AccountSafetyRestrictionNotice onRestrictionChange={setSafetyRestricted} /></div>
        {restorationState === "loading" && <Surface aria-busy="true"><Skeleton className="w-48"/><Skeleton className="mt-3 w-2/3"/><p className="sr-only" role="status">Checking for a current Journey…</p></Surface>}
        {restorationState === "failed" && <Notice variant="warning" title="Current Journey could not be restored"><p>Discovery remains visible, but restore your current state before beginning another Journey.</p><Button variant="secondary" className="mt-3" onClick={() => setBootstrapRetry(value => value + 1)}>Retry current Journey restoration</Button></Notice>}

        <LiveMomentDiscovery restricted={safetyRestricted} />
        <GuidedExperienceDiscovery restricted={safetyRestricted} />

        <section className="mt-10" aria-labelledby="ordinary-destinations-heading">
          <div className="max-w-prose"><h2 id="ordinary-destinations-heading" className="text-heading-2">Explore destinations</h2><p className="mt-2 text-body-sm text-ink-secondary">Select a destination, provide the existing Journey details, then review everything before submitting.</p></div>
          {destinationsState === "loading" && <div className="mt-5 grid gap-4 md:grid-cols-2" aria-busy="true"><Surface><Skeleton className="w-24"/><Skeleton className="mt-3 w-3/4"/><Skeleton className="mt-2 w-full"/></Surface><Surface><Skeleton className="w-20"/><Skeleton className="mt-3 w-2/3"/><Skeleton className="mt-2 w-full"/></Surface><p className="sr-only" role="status">Loading destinations…</p></div>}
          {destinationsState === "failed" && <StatePanel title="Destinations are temporarily unavailable" tone="danger" action={<Button variant="secondary" onClick={() => setBootstrapRetry(value => value + 1)}>Retry destinations</Button>}><p>Live Moments and Guided Experiences remain available.</p></StatePanel>}
          {destinationsState === "ready" && destinations.length === 0 && <StatePanel title="No destinations available"><p>Check Live Moments and Guided Experiences, or return later.</p></StatePanel>}
          {destinationsState === "ready" && destinations.length > 0 && <div className="mt-5 grid gap-4 md:grid-cols-2">{destinations.map(destination => <DiscoveryCard key={destination.id} title={destination.name} typeLabel={destination.category} status={safetyRestricted ? "Read-only" : selected?.id === destination.id ? "Selected" : "Available"} statusTone={safetyRestricted ? "warning" : selected?.id === destination.id ? "info" : "success"} description={<p>{destination.shortDescription}</p>} metadata={<MetadataList items={[{ term: "Location", detail: destination.city }, { term: "Duration options", detail: destination.durationOptions.map(option => `${option} minutes`).join(", ") }]} />} action={<Button variant={selected?.id === destination.id ? "secondary" : "primary"} disabled={safetyRestricted} onClick={() => chooseDestination(destination)} className="w-full" aria-label={`Select ${destination.name} for an immediate Journey`}>{selected?.id === destination.id ? "Selected for review" : "Select destination"}</Button>} />)}</div>}

          {selected && <Surface className="mt-6" aria-labelledby="journey-details-heading"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="journey-details-heading" className="text-heading-2">Journey details</h3><StatusBadge variant="info">{selected.name}</StatusBadge></div><div className="mt-6 grid gap-5">
            <Field id="meeting-area" label="Starting-point preference" optional description="Tell the Teleporter where you would like the live video to begin, or leave this blank for them to choose."><input value={meetingArea} onChange={event => setMeetingArea(event.target.value)} maxLength={120} placeholder="Example: Begin outside the main entrance" className="unfar-control" /></Field>
            <Field id="duration" label="Expected duration"><Select value={duration} onChange={event => setDuration(Number(event.target.value))}>{selected.durationOptions.map(option => <option key={option} value={option}>{option} minutes</option>)}</Select></Field>
            {selected.custom && <Field id="custom-destination" label="Custom destination request" description="Choose a safe, publicly accessible place where a Teleporter may provide a Journey."><input value={customDestination} onChange={event => setCustomDestination(event.target.value)} maxLength={120} className="unfar-control" /></Field>}
            <Field id="language" label="Preferred language"><Select value={language} onChange={event => setLanguage(event.target.value)}><option value="">No preference</option>{["English", "Spanish", "French", "Portuguese"].map(item => <option key={item}>{item}</option>)}</Select></Field>
            <fieldset><legend className="text-label">Accessibility needs</legend><div className="mt-2 grid gap-1 sm:grid-cols-2">{[{ value: "Wheelchair-accessible route support", label: "Wheelchair-accessible route support" }, { value: "Low-noise environment preference", label: "Low-noise environment preference" }, { value: "Visual-description assistance", label: "Visual-description assistance" }, { value: "Slower-paced visit", label: "Slower-paced Journey" }, { value: "Other", label: "Other" }].map(item => <Choice key={item.value} type="checkbox" label={item.label} checked={accessibilityNeeds.includes(item.value)} onChange={event => setAccessibilityNeeds(current => event.target.checked ? [...current, item.value] : current.filter(value => value !== item.value))} />)}</div></fieldset>
            <Field id="viewer-note" label="Journey instructions" optional><TextArea value={viewerNote} onChange={event => setViewerNote(event.target.value)} maxLength={240} /></Field>
            <Button onClick={enterReview} disabled={safetyRestricted} className="w-full sm:w-auto">Review Journey request</Button>
          </div></Surface>}
        </section>
      </main>
    );
  }

  if (phase === "review" && selected) {
    return <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12"><p className="text-label uppercase tracking-wide text-brand">Immediate Journey</p><h1 ref={reviewHeadingRef} tabIndex={-1} className="mt-2 text-heading-1 outline-none">Review your Journey request</h1><p className="mt-3 text-body text-ink-secondary">Nothing is submitted until you confirm below.</p><Surface className="mt-6"><MetadataList className="sm:grid-cols-1" items={[{ term: "Destination or Experience", detail: selected.custom ? customDestination : selected.name }, { term: "Starting-point preference", detail: meetingArea || "No preference — the Teleporter will choose an appropriate place to begin." }, { term: "Journey instructions", detail: viewerNote || "No additional instructions" }, { term: "Duration", detail: `${duration} minutes` }, { term: "Language", detail: language || "No preference" }, { term: "Accessibility needs", detail: accessibilityNeeds.length ? accessibilityNeeds.join(", ") : "None specified" }]} /></Surface>{requestError && <Notice className="mt-4" variant="danger" title="Journey request not submitted"><p>{requestError}</p></Notice>}<div className="mt-6 flex flex-col gap-3 sm:flex-row"><Button disabled={submitting} onClick={requestTrip} className="w-full sm:w-auto">{submitting ? "Submitting Journey request…" : "Request this Journey"}</Button><Button variant="secondary" disabled={submitting} onClick={returnToDiscover} className="w-full sm:w-auto">Edit details</Button></div><LiveRegion className="sr-only">{submitting ? "Submitting Journey request" : ""}</LiveRegion></main>;
  }

  if (phase === "waiting") {
    if (trip?.status === "NO_OPERATOR_AVAILABLE") {
      return (
        <main className="mx-auto max-w-xl px-4 py-12"><StatePanel title="No compatible Teleporter is available" tone="warning" action={<Button disabled={retrying} onClick={async () => { setRetrying(true); setRequestError(""); try { const response = await fetch(`/api/trips/${trip.id}/retry`, { method: "POST" }); const data = await response.json(); if (response.ok) setTrip(data.trip); else setRequestError(data.error ?? "Unable to retry matching."); } catch { setRequestError("Matching could not be retried. Check your connection and try again."); } finally { setRetrying(false); } }}>{retrying ? "Retrying matching…" : "Try matching again"}</Button>}><p>No wait time or match is guaranteed. You can retry the existing request.</p></StatePanel>{requestError && <Notice className="mt-4" variant="danger" title="Matching could not restart"><p>{requestError}</p></Notice>}<LiveRegion className="sr-only">{retrying ? "Retrying matching" : ""}</LiveRegion></main>
      );
    }
    if (trip?.status === "IN_PROGRESS") {
      return <main className="grid min-h-[100dvh] place-items-center bg-gray-950 p-6 text-white"><section className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 p-6 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Active Journey</p><h1 className="mt-2 text-2xl font-bold">{trip.destination}</h1><p className="mt-4 text-gray-300" role="status">Reconnecting to the live Portal…</p>{pollingMessage && <><p className="mt-3 text-amber-200">{pollingMessage}</p><button type="button" onClick={() => setPollRetry(value => value + 1)} className="mt-5 min-h-11 rounded-full bg-white px-5 font-semibold text-gray-950">Try Portal again</button></>}<SafetyReportDialog tripId={trip.id}/><button type="button" onClick={leaveCall} className="mt-5 min-h-11 w-full rounded-full border border-red-400 px-5 font-semibold text-red-200">Leave Journey</button></section></main>;
    }
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} />
        <StatePanel title={trip?.status === "ACCEPTED" ? "Journey accepted" : trip?.status === "OFFERED" || trip?.hasOffer ? "A Teleporter is reviewing your request" : `Looking for a Teleporter for ${trip?.destination ?? "your Journey"}`} busy={trip?.status !== "ACCEPTED"} action={<Button variant="secondary" disabled={cancelling} onClick={cancelTrip}>{cancelling ? "Cancelling request…" : "Cancel request"}</Button>}><p>{trip?.status === "ACCEPTED" ? "Your request is ready. The Portal will open when the Journey begins." : "Your request was submitted and matching is in progress. Availability is confirmed by the server."}</p></StatePanel>
        {requestError && <Notice className="mt-4" variant="danger" title="Request status needs attention"><p>{requestError}</p></Notice>}
        {trip?.status === "ACCEPTED" && <SafetyReportDialog tripId={trip.id}/>}<LiveRegion className="sr-only">{cancelling ? "Cancelling Journey request" : ""}</LiveRegion>
      </main>
    );
  }

  if (phase === "call" && videoToken && trip?.acceptedAt) {
    return (
      <><PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} /><SafetyReportDialog tripId={trip.id}/><VideoRoom
        token={videoToken.token}
        serverUrl={videoToken.url}
        destination={trip.destination}
        acceptedAt={trip.acceptedAt}
        canPublishCamera={false}
        canPublishMicrophone
        viewerLayout
        disconnect={tripEnded}
        onLeave={leaveCall}
        onAuthoritativeDisconnect={transitionToFeedback}
      /></>
    );
  }

  if (phase === "feedback" && trip) {
    return <FeedbackForm tripId={trip.id} onDone={resetViewerDashboard} />;
  }

  return <main className="mx-auto max-w-md px-4 py-12"><StatePanel title="Restoring your Journey" busy><p>We are checking the latest Journey and Portal state.</p></StatePanel></main>;
}

function PollingNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  if (!message) return null;
  return <div className="m-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status"><span>{message}</span><button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-md border border-amber-700 px-3 font-semibold">Retry</button></div>;
}
