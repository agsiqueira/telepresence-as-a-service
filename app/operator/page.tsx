"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";

type Trip = {
  id: string;
  destination: string;
  status: "REQUESTED" | "ACCEPTED" | "ENDED" | "CANCELLED";
};

export default function OperatorPage() {
  const [online, setOnline] = useState(false);
  const [pending, setPending] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [videoToken, setVideoToken] = useState<{
    token: string;
    url: string;
  } | null>(null);
  const [tripEnded, setTripEnded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endingRef = useRef(false);
  const endRequestRef = useRef(false);
  const teardownRef = useRef(false);

  async function toggleOnline() {
    const next = !online;
    await fetch("/api/operator/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: next }),
    });
    setOnline(next);
  }

  async function accept(tripId: string) {
    const res = await fetch(`/api/trips/${tripId}/accept`, {
      method: "POST",
    });
    if (res.status === 409) {
      setPending((p) => p.filter((t) => t.id !== tripId));
      return;
    }
    const data = await res.json();
    setActiveTrip(data.trip);
    endingRef.current = false;
    endRequestRef.current = false;
    teardownRef.current = false;
    setTripEnded(false);

    const tokenRes = await fetch("/api/livekit-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripId }),
    });
    const tokenData = await tokenRes.json();
    setVideoToken({ token: tokenData.token, url: tokenData.url });
  }

  async function endTrip() {
    if (!activeTrip || endRequestRef.current) return;

    endRequestRef.current = true;
    await fetch(`/api/trips/${activeTrip.id}/end`, { method: "POST" });
    clearActiveCall();
  }

  function clearActiveCall() {
    if (teardownRef.current) return;

    teardownRef.current = true;
    setTripEnded(false);
    setActiveTrip(null);
    setVideoToken(null);
  }

  useEffect(() => {
    if (!online || activeTrip) return;

    async function poll() {
      const res = await fetch("/api/trips?status=REQUESTED");
      const data = await res.json();
      setPending(data.trips ?? []);
    }

    poll();
    pollRef.current = setInterval(poll, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [online, activeTrip]);

  const activeTripId = activeTrip?.id;

  useEffect(() => {
    if (!activeTripId) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;

    async function poll() {
      request = new AbortController();

      try {
        const res = await fetch(`/api/trips/${activeTripId}`, {
          cache: "no-store",
          signal: request.signal,
        });
        const data = await res.json();

        if (
          !stopped &&
          res.ok &&
          data.trip &&
          data.trip?.status !== "ACCEPTED" &&
          !endingRef.current
        ) {
          endingRef.current = true;
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
  }, [activeTripId]);

  if (activeTrip && videoToken) {
    return (
      <VideoRoom
        token={videoToken.token}
        serverUrl={videoToken.url}
        canPublishCamera
        canPublishMicrophone
        disconnect={tripEnded}
        onAuthoritativeDisconnect={clearActiveCall}
        onDisconnected={endTrip}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-spartan-green">Operator</h1>
        <button
          onClick={toggleOnline}
          className={`px-4 py-2 rounded-md font-medium ${
            online
              ? "bg-spartan-green text-white"
              : "border border-spartan-green text-spartan-green"
          }`}
        >
          {online ? "Online" : "Go online"}
        </button>
      </div>

      {online && pending.length === 0 && (
        <p className="text-gray-500">Waiting for requests…</p>
      )}

      <div className="flex flex-col gap-3">
        {pending.map((trip) => (
          <div
            key={trip.id}
            className="border border-gray-200 rounded-md px-4 py-3 flex items-center justify-between"
          >
            <span>{trip.destination}</span>
            <button
              onClick={() => accept(trip.id)}
              className="bg-spartan-green text-white px-4 py-1.5 rounded-md text-sm font-medium"
            >
              Accept
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
