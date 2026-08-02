"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import FeedbackForm from "@/components/FeedbackForm";
import JourneyReviewPanel from "@/components/JourneyReviewPanel";
import SafetyReportDialog from "@/components/SafetyReportDialog";
import ProfileSettings from "@/components/ProfileSettings";
import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
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
type HistoryTrip = Pick<Trip, "id" | "destination" | "status"> & {
  requestedDuration: number | null;
  requestedAt: string;
};

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
  const [history, setHistory] = useState<HistoryTrip[]>([]);
  const [feedbackTripId, setFeedbackTripId] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
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
    void fetchJson<{ destinations: Destination[] }>("/api/destinations")
      .then(data => setDestinations(data.destinations ?? []))
      .catch(() => setLoadErrors(current => [...new Set([...current, "Unable to load destinations. Please try again."])]));
    void fetchJson<{ trip: Trip | null }>("/api/trips/current")
      .then(data => {
        if (!data.trip) return;
        setTrip(data.trip);
        setPhase("waiting");
      })
      .catch(() => setLoadErrors(current => [...new Set([...current, "Unable to restore your current visit. Please try again."])]));
  }, []);

  useEffect(() => {
    if (phase !== "browse") return;
    void fetchJson<{ history: HistoryTrip[] }>("/api/trips/history?limit=50")
      .then(data => setHistory(data.history ?? []))
      .catch(() => setLoadErrors(current => [...new Set([...current, "Unable to load visit history. Please try again."])]));
  }, [phase, historyRefresh]);

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
      setRequestError(data.error ?? "Unable to request this visit");
      return;
    }
    setTrip(data.trip);
    setPhase("waiting");
  }

  async function cancelTrip() {
    if (!trip) return;
    await fetch(`/api/trips/${trip.id}/cancel`, { method: "POST" });
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
      console.error("Unable to end visit");
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
      onPersistentFailure: () => setPollingMessage("Connection interrupted. Visit status will update when the connection returns."),
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
      onPersistentFailure: () => setPollingMessage("Connection interrupted. Visit status will update when the connection returns."),
      onRecovery: () => setPollingMessage(""),
    });
  }, [phase, tripId, pollRetry]);

  if (phase === "browse") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <AccountSafetyRestrictionNotice />
        <h1 className="text-3xl font-bold text-spartan-green">Choose a destination</h1>
        <p className="mb-6 mt-2 text-gray-600">Browse active pilot destinations for an immediate virtual visit.</p>
        {loadErrors.length > 0 && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert"><p className="font-semibold">Some visit information could not be loaded.</p><ul className="mt-1 list-disc pl-5">{loadErrors.map(message => <li key={message}>{message}</li>)}</ul></div>}
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>
        {selected && (
          <div className="mt-6 rounded-xl border border-gray-200 p-4">
            <label className="block text-sm font-medium" htmlFor="meeting-area">Starting-point preference (optional)</label>
            <p className="mt-1 text-xs text-gray-500">If you know where you would like the live video to begin, tell the operator. Otherwise, the operator will choose an appropriate starting point.</p>
            <input id="meeting-area" value={meetingArea} onChange={(event) => setMeetingArea(event.target.value)} maxLength={120} placeholder="Example: Begin outside the main entrance" className="mt-2 min-h-11 w-full rounded-lg border px-3" />
            <label className="mt-4 block text-sm font-medium" htmlFor="duration">Expected duration</label>
            <select id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border px-3">
              {selected.durationOptions.map((option) => <option key={option} value={option}>{option} minutes</option>)}
            </select>
            {selected.custom && <><label className="mt-4 block text-sm font-medium" htmlFor="custom-destination">Custom destination request</label><p className="mt-1 text-xs text-gray-500">Choose a safe, publicly accessible place where an operator may provide a video visit.</p><input id="custom-destination" value={customDestination} onChange={(event) => setCustomDestination(event.target.value)} maxLength={120} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></>}
            <label className="mt-4 block text-sm font-medium" htmlFor="language">Preferred language</label>
            <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">No preference</option>{["English", "Spanish", "French", "Portuguese"].map((item) => <option key={item}>{item}</option>)}</select>
            <fieldset className="mt-4"><legend className="text-sm font-medium">Accessibility needs</legend>{["Wheelchair-accessible route support", "Low-noise environment preference", "Visual-description assistance", "Slower-paced visit", "Other"].map((item) => <label key={item} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={accessibilityNeeds.includes(item)} onChange={(event) => setAccessibilityNeeds((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} />{item}</label>)}</fieldset>
            <label className="mt-4 block text-sm font-medium" htmlFor="viewer-note">Visit instructions (optional)</label>
            <textarea id="viewer-note" value={viewerNote} onChange={(event) => setViewerNote(event.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border p-3" />
            <button type="button" onClick={() => setPhase("review")} className="mt-5 min-h-12 w-full rounded-lg bg-spartan-green px-5 font-semibold text-white">Review request</button>
          </div>
        )}
        <section className="mt-10" aria-labelledby="viewer-history-heading">
          <h2 id="viewer-history-heading" className="text-xl font-semibold">Visit history</h2>
          {history.length === 0 ? <p className="mt-2 text-sm text-gray-500">No visits yet.</p> : <ul className="mt-3 divide-y rounded-xl border">{history.map(item => <li key={item.id} className="p-3"><p className="font-medium">{item.destination}</p><p className="text-sm text-gray-600">{item.status.replaceAll("_", " ").toLowerCase()} · {item.requestedDuration ?? "—"} min</p>{item.status==="ENDED"&&<section className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3" aria-labelledby={`private-feedback-${item.id}`}><h3 id={`private-feedback-${item.id}`} className="font-semibold text-blue-950">Private visit feedback</h3><p className="mt-1 text-sm text-blue-950">Help evaluate the visit experience. Your answers are internal research feedback and are not shared with the Teleporter or used in Journey reviews.</p><button type="button" aria-expanded={feedbackTripId===item.id} aria-controls={`private-feedback-form-${item.id}`} onClick={()=>setFeedbackTripId(current=>current===item.id?null:item.id)} className="mt-3 min-h-11 rounded-lg border border-blue-800 bg-white px-4 font-semibold text-blue-950 focus-visible:ring-2">{feedbackTripId===item.id?"Close private feedback":"Complete private feedback"}</button>{feedbackTripId===item.id&&<div id={`private-feedback-form-${item.id}`}><FeedbackForm tripId={item.id} onDone={()=>{setFeedbackTripId(null);setHistoryRefresh(value=>value+1)}}/></div>}</section>}{["ACCEPTED","IN_PROGRESS","ENDED","FEEDBACK_COMPLETED","CANCELLED"].includes(item.status)&&<SafetyReportDialog tripId={item.id}/>} {(item.status==="ENDED"||item.status==="FEEDBACK_COMPLETED")&&<JourneyReviewPanel tripId={item.id}/>}</li>)}</ul>}
        </section>
        <ProfileSettings role="viewer" />
      </div>
    );
  }

  if (phase === "review" && selected) {
    return <div className="mx-auto max-w-md px-4 py-10"><p className="text-sm font-semibold uppercase text-spartan-green">Immediate visit</p><h1 className="mt-1 text-2xl font-bold">Review your request</h1><dl className="mt-6 space-y-3 rounded-xl border p-4"><div><dt className="text-xs text-gray-500">Destination or experience</dt><dd>{selected.custom ? customDestination : selected.name}</dd></div><div><dt className="text-xs text-gray-500">Starting-point preference</dt><dd>{meetingArea || "No preference — the operator will choose an appropriate place to begin."}</dd></div><div><dt className="text-xs text-gray-500">Visit instructions</dt><dd>{viewerNote || "No additional instructions"}</dd></div><div><dt className="text-xs text-gray-500">Duration</dt><dd>{duration} minutes</dd></div><div><dt className="text-xs text-gray-500">Language</dt><dd>{language || "No preference"}</dd></div></dl>{requestError && <p className="mt-4 text-sm text-red-600" role="alert">{requestError}</p>}<button type="button" disabled={submitting} onClick={requestTrip} className="mt-6 min-h-12 w-full rounded-lg bg-spartan-green font-semibold text-white disabled:opacity-50">{submitting ? "Requesting…" : "Request this visit"}</button><button type="button" onClick={() => setPhase("browse")} className="mt-3 min-h-11 w-full rounded-lg border">Edit details</button></div>;
  }

  if (phase === "waiting") {
    if (trip?.status === "NO_OPERATOR_AVAILABLE") {
      return (
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-spartan-green">No operator is available</h1>
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
      return <main className="grid min-h-[100dvh] place-items-center bg-gray-950 p-6 text-white"><section className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 p-6 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Active visit</p><h1 className="mt-2 text-2xl font-bold">{trip.destination}</h1><p className="mt-4 text-gray-300" role="status">Reconnecting to the live visit…</p>{pollingMessage && <><p className="mt-3 text-amber-200">{pollingMessage}</p><button type="button" onClick={() => setPollRetry(value => value + 1)} className="mt-5 min-h-11 rounded-full bg-white px-5 font-semibold text-gray-950">Try media again</button></>}<SafetyReportDialog tripId={trip.id}/><button type="button" onClick={leaveCall} className="mt-5 min-h-11 w-full rounded-full border border-red-400 px-5 font-semibold text-red-200">Leave visit</button></section></main>;
    }
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} />
        <h1 className="text-xl font-semibold text-spartan-green mb-2">
          {trip?.status === "ACCEPTED" ? "Request accepted. Waiting for the visit to begin" : trip?.status === "OFFERED" || trip?.hasOffer ? "An operator is reviewing your request" : `Looking for an operator for ${trip?.destination}…`}
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

  return null;
}

function PollingNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  if (!message) return null;
  return <div className="m-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status"><span>{message}</span><button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-md border border-amber-700 px-3 font-semibold">Retry</button></div>;
}
