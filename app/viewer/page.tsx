"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import FeedbackForm from "@/components/FeedbackForm";
import SafetyReportDialog from "@/components/SafetyReportDialog";
import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
import LiveMomentDiscovery from "@/components/LiveMomentDiscovery";
import GuidedExperienceDiscovery from "@/components/GuidedExperienceDiscovery";
import { Button, Notice, PageHeader, Skeleton, StatePanel, Surface } from "@/components/ui/primitives";
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

  async function requestTrip() {
    if (!selected || submitting) return;
    setSubmitting(true);
    setRequestError("");

    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationId: selected.id,
        meetingArea,
        requestedDuration: duration,
        viewerNote,
        preferredLanguage: language,
        accessibilityNeeds,
        customDestination,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setRequestError(data.error ?? "Unable to request this Journey");
      return;
    }
    setTrip(data.trip);
    setPhase("waiting");
  }

  async function cancelTrip() {
    if (!trip) return;
    const response = await fetch(`/api/trips/${trip.id}/cancel`, { method: "POST" });
    if (!response.ok) { setRequestError("The Journey could not be cancelled. Refresh its status and try again."); return; }
    setTrip(null);
    setPhase("browse");
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
      <div className="mx-auto max-w-3xl px-4 py-10">
        <PageHeader eyebrow="Explorer" title="Discover" description="Browse available destinations, Live Moments, and Guided Experiences for your next Journey." />
        <div className="mt-6"><AccountSafetyRestrictionNotice /></div>
        {restorationState === "loading" && <Surface className="mb-6" aria-busy="true"><Skeleton className="w-48"/><Skeleton className="mt-3 w-2/3"/><p className="sr-only" role="status">Restoring your current Journey…</p></Surface>}
        {restorationState === "failed" && <Notice className="mb-6" variant="warning" title="Current Journey could not be restored"><p>Discovery remains available. Retry before starting another Journey.</p><Button variant="secondary" className="mt-3" onClick={() => setBootstrapRetry(value => value + 1)}>Retry restoration</Button></Notice>}
        <LiveMomentDiscovery />
        <GuidedExperienceDiscovery />
        <section className="mt-8" aria-labelledby="ordinary-destinations-heading"><h2 id="ordinary-destinations-heading" className="text-heading-2">Destinations</h2><p className="mt-2 text-body-sm text-ink-secondary">Request an immediate Journey to an active pilot destination.</p>
        {destinationsState === "loading" && <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-busy="true"><Surface><Skeleton className="w-24"/><Skeleton className="mt-3 w-3/4"/><Skeleton className="mt-2 w-full"/></Surface><Surface><Skeleton className="w-20"/><Skeleton className="mt-3 w-2/3"/><Skeleton className="mt-2 w-full"/></Surface><p className="sr-only" role="status">Loading destinations…</p></div>}
        {destinationsState === "failed" && <Notice className="mt-4" variant="danger" title="Destinations could not be loaded"><Button variant="secondary" className="mt-3" onClick={() => setBootstrapRetry(value => value + 1)}>Retry destinations</Button></Notice>}
        {destinationsState === "ready" && destinations.length === 0 && <StatePanel title="No destinations available"><p>Check Live Moments and Guided Experiences, or return later.</p></StatePanel>}
        {destinationsState === "ready" && destinations.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {destinations.map((destination) => (
            <button
              key={destination.id}
              type="button"
              onClick={() => chooseDestination(destination)}
              className={`min-h-28 rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-spartan-green ${
                selected?.id === destination.id ? "border-spartan-green bg-green-50" : "border-gray-200"
              }`}
            >
              <span className="text-xs font-semibold uppercase text-gray-500">{destination.category}</span>
              <span className="mt-1 block font-semibold">{destination.name}</span>
              <span className="mt-1 block text-sm text-gray-600">{destination.shortDescription}</span>
            </button>
          ))}
        </div>}
        {selected && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium" htmlFor="meeting-area">Starting-point preference (optional)</label>
            <p className="mt-1 text-xs text-gray-500">If you know where you would like the live video to begin, tell the Teleporter. Otherwise, the Teleporter will choose an appropriate starting point.</p>
            <input id="meeting-area" value={meetingArea} onChange={(event) => setMeetingArea(event.target.value)} maxLength={120} placeholder="Example: Begin outside the main entrance" className="mt-2 min-h-11 w-full rounded-lg border px-3" />
            <label className="mt-4 block text-sm font-medium" htmlFor="duration">Expected duration</label>
            <select id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border px-3">
              {selected.durationOptions.map((option) => <option key={option} value={option}>{option} minutes</option>)}
            </select>
            {selected.custom && <><label className="mt-4 block text-sm font-medium" htmlFor="custom-destination">Custom destination request</label><p className="mt-1 text-xs text-gray-500">Choose a safe, publicly accessible place where a Teleporter may provide a Journey.</p><input id="custom-destination" value={customDestination} onChange={(event) => setCustomDestination(event.target.value)} maxLength={120} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></>}
            <label className="mt-4 block text-sm font-medium" htmlFor="language">Preferred language</label>
            <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">No preference</option>{["English", "Spanish", "French", "Portuguese"].map((item) => <option key={item}>{item}</option>)}</select>
            <fieldset className="mt-4"><legend className="text-sm font-medium">Accessibility needs</legend>{["Wheelchair-accessible route support", "Low-noise environment preference", "Visual-description assistance", "Slower-paced visit", "Other"].map((item) => <label key={item} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={accessibilityNeeds.includes(item)} onChange={(event) => setAccessibilityNeeds((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} />{item}</label>)}</fieldset>
            <label className="mt-4 block text-sm font-medium" htmlFor="viewer-note">Journey instructions (optional)</label>
            <textarea id="viewer-note" value={viewerNote} onChange={(event) => setViewerNote(event.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border p-3" />
            <button type="button" onClick={() => setPhase("review")} className="mt-5 min-h-12 w-full rounded-lg bg-spartan-green px-5 font-semibold text-white">Review Journey request</button>
          </div>
        )}
        </section>
      </div>
    );
  }

  if (phase === "review" && selected) {
    return <div className="mx-auto max-w-md px-4 py-10"><p className="text-sm font-semibold uppercase text-spartan-green">Immediate Journey</p><h1 className="mt-1 text-2xl font-bold">Review your request</h1><dl className="mt-6 space-y-3 rounded-xl border p-4"><div><dt className="text-xs text-gray-500">Destination or Experience</dt><dd>{selected.custom ? customDestination : selected.name}</dd></div><div><dt className="text-xs text-gray-500">Starting-point preference</dt><dd>{meetingArea || "No preference — the Teleporter will choose an appropriate place to begin."}</dd></div><div><dt className="text-xs text-gray-500">Journey instructions</dt><dd>{viewerNote || "No additional instructions"}</dd></div><div><dt className="text-xs text-gray-500">Duration</dt><dd>{duration} minutes</dd></div><div><dt className="text-xs text-gray-500">Language</dt><dd>{language || "No preference"}</dd></div></dl>{requestError && <p className="mt-4 text-sm text-red-600" role="alert">{requestError}</p>}<button type="button" disabled={submitting} onClick={requestTrip} className="mt-6 min-h-12 w-full rounded-lg bg-spartan-green font-semibold text-white disabled:opacity-50">{submitting ? "Requesting…" : "Request this Journey"}</button><button type="button" onClick={() => setPhase("browse")} className="mt-3 min-h-11 w-full rounded-lg border">Edit details</button></div>;
  }

  if (phase === "waiting") {
    if (trip?.status === "NO_OPERATOR_AVAILABLE") {
      return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-spartan-green">No compatible Teleporter is available</h1>
          <p className="mb-8 mt-2 text-gray-500">You can try again with a new request.</p>
          <button type="button" onClick={async () => {
            const response = await fetch(`/api/trips/${trip.id}/retry`, { method: "POST" });
            const data = await response.json();
            if (response.ok) setTrip(data.trip);
            else setRequestError(data.error ?? "Unable to retry");
          }} className="min-h-11 rounded-md bg-spartan-green px-5 text-white">Try again</button>
          {requestError && <p className="mt-3 text-sm text-red-600" role="alert">{requestError}</p>}
        </div>
      );
    }
    if (trip?.status === "IN_PROGRESS") {
      return <main className="grid min-h-[100dvh] place-items-center bg-gray-950 p-6 text-white"><section className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 p-6 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Active Journey</p><h1 className="mt-2 text-2xl font-bold">{trip.destination}</h1><p className="mt-4 text-gray-300" role="status">Reconnecting to the live Portal…</p>{pollingMessage && <><p className="mt-3 text-amber-200">{pollingMessage}</p><button type="button" onClick={() => setPollRetry(value => value + 1)} className="mt-5 min-h-11 rounded-full bg-white px-5 font-semibold text-gray-950">Try Portal again</button></>}<SafetyReportDialog tripId={trip.id}/><button type="button" onClick={leaveCall} className="mt-5 min-h-11 w-full rounded-full border border-red-400 px-5 font-semibold text-red-200">Leave Journey</button></section></main>;
    }
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} />
        <h1 className="text-xl font-semibold text-spartan-green mb-2">
          {trip?.status === "ACCEPTED" ? "Request accepted. Waiting for the Journey to begin" : trip?.status === "OFFERED" || trip?.hasOffer ? "A Teleporter is reviewing your request" : `Looking for a Teleporter for ${trip?.destination}…`}
        </h1>
        <p className="text-gray-500 mb-8">This usually takes a moment.</p>
        {trip?.status === "ACCEPTED" && <SafetyReportDialog tripId={trip.id}/>}<button
          onClick={cancelTrip}
          className="border border-gray-300 px-5 py-2 rounded-md"
        >
          Cancel request
        </button>
      </div>
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
