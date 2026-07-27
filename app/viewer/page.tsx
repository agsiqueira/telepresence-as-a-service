"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import FeedbackForm from "@/components/FeedbackForm";

type Trip = {
  id: string;
  destination: string;
  status: "REQUESTED" | "ACCEPTED" | "ENDED" | "CANCELLED";
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
  const [phase, setPhase] = useState<Phase>("browse");
  const [videoToken, setVideoToken] = useState<{
    token: string;
    url: string;
  } | null>(null);
  const [tripEnded, setTripEnded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endingRef = useRef(false);
  const feedbackTransitionRef = useRef(false);
  const leaveRequestRef = useRef(false);
  const tripId = trip?.id;

  useEffect(() => {
    void fetch("/api/destinations", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setDestinations(data.destinations ?? []));
  }, []);

  function chooseDestination(destination: Destination) {
    setSelected(destination);
    setMeetingArea(destination.meetingArea);
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
      console.error("Unable to end trip");
    }
  }

  function transitionToFeedback() {
    if (feedbackTransitionRef.current) return;

    feedbackTransitionRef.current = true;
    setTripEnded(false);
    setVideoToken(null);
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
    endingRef.current = false;
    feedbackTransitionRef.current = false;
    leaveRequestRef.current = false;
    setPhase("browse");
  }

  useEffect(() => {
    if (phase !== "waiting" || !tripId) return;

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/trips/${tripId}`);
      const data = await res.json();
      if (!data.trip) return;
      setTrip(data.trip);

      if (data.trip.status === "ACCEPTED") {
        const tokenRes = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId }),
        });
        const tokenData = await tokenRes.json();
        setVideoToken({ token: tokenData.token, url: tokenData.url });
        endingRef.current = false;
        feedbackTransitionRef.current = false;
        leaveRequestRef.current = false;
        setPhase("call");
      } else if (data.trip.status === "CANCELLED") {
        setPhase("browse");
      }
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, tripId]);

  useEffect(() => {
    if (phase !== "call" || !tripId) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;

    async function poll() {
      request = new AbortController();

      try {
        const res = await fetch(`/api/trips/${tripId}`, {
          cache: "no-store",
          signal: request.signal,
        });
        const data = await res.json();

        if (
          !stopped &&
          data.trip?.status === "ENDED" &&
          !endingRef.current
        ) {
          endingRef.current = true;
          setTrip(data.trip);
          setTripEnded(true);
          return;
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to refresh trip status");
        }
      }

      if (!stopped) timer = setTimeout(poll, 1000);
    }

    void poll();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      request?.abort();
    };
  }, [phase, tripId]);

  if (phase === "browse") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-spartan-green">Choose a destination</h1>
        <p className="mb-6 mt-2 text-gray-600">Browse active pilot destinations for an immediate virtual visit.</p>
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
            <label className="block text-sm font-medium" htmlFor="meeting-area">Meeting instructions within {selected.city}</label>
            <p className="mt-1 text-xs text-gray-500">Describe where to meet. Operator matching uses the destination&apos;s operating area, not this free-text note.</p>
            <input id="meeting-area" value={meetingArea} onChange={(event) => setMeetingArea(event.target.value)} maxLength={120} className="mt-1 min-h-11 w-full rounded-lg border px-3" />
            <label className="mt-4 block text-sm font-medium" htmlFor="duration">Expected duration</label>
            <select id="duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border px-3">
              {selected.durationOptions.map((option) => <option key={option} value={option}>{option} minutes</option>)}
            </select>
            {selected.custom && <><label className="mt-4 block text-sm font-medium" htmlFor="custom-destination">Custom public destination</label><input id="custom-destination" value={customDestination} onChange={(event) => setCustomDestination(event.target.value)} maxLength={120} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></>}
            <label className="mt-4 block text-sm font-medium" htmlFor="language">Preferred language</label>
            <select id="language" value={language} onChange={(event) => setLanguage(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3"><option value="">No preference</option>{["English", "Spanish", "French", "Portuguese"].map((item) => <option key={item}>{item}</option>)}</select>
            <fieldset className="mt-4"><legend className="text-sm font-medium">Accessibility needs</legend>{["Wheelchair-accessible route support", "Low-noise environment preference", "Visual-description assistance", "Slower-paced visit", "Other"].map((item) => <label key={item} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={accessibilityNeeds.includes(item)} onChange={(event) => setAccessibilityNeeds((current) => event.target.checked ? [...current, item] : current.filter((value) => value !== item))} />{item}</label>)}</fieldset>
            <label className="mt-4 block text-sm font-medium" htmlFor="viewer-note">Note for the operator (optional)</label>
            <textarea id="viewer-note" value={viewerNote} onChange={(event) => setViewerNote(event.target.value)} maxLength={240} className="mt-1 w-full rounded-lg border p-3" />
            <button type="button" onClick={() => setPhase("review")} className="mt-5 min-h-12 w-full rounded-lg bg-spartan-green px-5 font-semibold text-white">Review request</button>
          </div>
        )}
      </div>
    );
  }

  if (phase === "review" && selected) {
    return <div className="mx-auto max-w-md px-4 py-10"><p className="text-sm font-semibold uppercase text-spartan-green">Immediate visit</p><h1 className="mt-1 text-2xl font-bold">Review your request</h1><dl className="mt-6 space-y-3 rounded-xl border p-4"><div><dt className="text-xs text-gray-500">Destination</dt><dd>{selected.custom ? customDestination : selected.name}</dd></div><div><dt className="text-xs text-gray-500">Meeting instructions</dt><dd>{meetingArea}</dd></div><div><dt className="text-xs text-gray-500">Duration</dt><dd>{duration} minutes</dd></div><div><dt className="text-xs text-gray-500">Language</dt><dd>{language || "No preference"}</dd></div></dl>{requestError && <p className="mt-4 text-sm text-red-600" role="alert">{requestError}</p>}<button type="button" disabled={submitting} onClick={requestTrip} className="mt-6 min-h-12 w-full rounded-lg bg-spartan-green font-semibold text-white disabled:opacity-50">{submitting ? "Requesting…" : "Request this visit"}</button><button type="button" onClick={() => setPhase("browse")} className="mt-3 min-h-11 w-full rounded-lg border">Edit details</button></div>;
  }

  if (phase === "waiting") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-spartan-green mb-2">
          {trip?.hasOffer ? "An operator is reviewing your request" : `Looking for an operator for ${trip?.destination}…`}
        </h1>
        <p className="text-gray-500 mb-8">This usually takes a moment.</p>
        <button
          onClick={cancelTrip}
          className="border border-gray-300 px-5 py-2 rounded-md"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (phase === "call" && videoToken && trip?.acceptedAt) {
    return (
      <VideoRoom
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
      />
    );
  }

  if (phase === "feedback" && trip) {
    return <FeedbackForm tripId={trip.id} onDone={resetViewerDashboard} />;
  }

  return null;
}
