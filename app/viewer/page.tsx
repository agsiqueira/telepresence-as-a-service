"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import FeedbackForm from "@/components/FeedbackForm";

type Trip = {
  id: string;
  destination: string;
  status: "REQUESTED" | "ACCEPTED" | "ENDED" | "CANCELLED";
  acceptedAt: string | null;
};

type Phase = "form" | "waiting" | "call" | "feedback";

export default function ViewerPage() {
  const [destination, setDestination] = useState("");
  const [trip, setTrip] = useState<Trip | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
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

  async function requestTrip() {
    if (!destination.trim()) return;

    let lat: number | undefined;
    let lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 3000,
        })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // best-effort — a denied/unavailable geolocation just means no coordinates
    }

    const res = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, lat, lng }),
    });
    const data = await res.json();
    setTrip(data.trip);
    setPhase("waiting");
  }

  async function cancelTrip() {
    if (!trip) return;
    await fetch(`/api/trips/${trip.id}/cancel`, { method: "POST" });
    setTrip(null);
    setPhase("form");
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
    setDestination("");
    setTrip(null);
    setVideoToken(null);
    setTripEnded(false);
    endingRef.current = false;
    feedbackTransitionRef.current = false;
    leaveRequestRef.current = false;
    setPhase("form");
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
        setPhase("form");
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

  if (phase === "form") {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-2xl font-bold text-spartan-green mb-6">
          Where would you like to visit?
        </h1>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="e.g. Riverside Park"
          className="w-full border border-gray-300 rounded-md px-4 py-2 mb-4"
        />
        <button
          onClick={requestTrip}
          className="w-full bg-spartan-green text-white px-5 py-3 rounded-md font-medium"
        >
          Request a visit
        </button>
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-spartan-green mb-2">
          Finding someone to show you {trip?.destination}…
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
