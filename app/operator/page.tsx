"use client";

import { useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import ProfileSettings from "@/components/ProfileSettings";
import { createResilientPoller, requireJsonResponse } from "@/lib/resilient-poller";

type Trip = {
  id: string;
  destination: string;
  status: "REQUESTED" | "OFFERED" | "ACCEPTED" | "IN_PROGRESS" | "ENDED" | "FEEDBACK_COMPLETED" | "CANCELLED" | "NO_OPERATOR_AVAILABLE";
  acceptedAt: string | null;
};

type Offer = {
  id: string;
  destination: string;
  meetingArea: string | null;
  requestedDuration: number;
  viewerNote: string | null;
  preferredLanguage: string | null;
  accessibilityNeeds: string[];
  customDestination: string | null;
  immediate: boolean;
  offerExpiresAt: string;
};

type DestinationOption = { id: string; name: string; city: string };
type OperatorHistory = {
  status: string;
  trip: { id: string; destination: string; status: string; requestedDuration: number | null };
};

const LANGUAGE_OPTIONS = ["English", "Spanish", "French", "Portuguese"];
const ACCESSIBILITY_OPTIONS = [
  "Wheelchair-accessible route support",
  "Low-noise environment preference",
  "Visual-description assistance",
  "Slower-paced visit",
  "Other",
];
const DURATION_OPTIONS = [15, 30, 45, 60];

export default function OperatorPage() {
  const [online, setOnline] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [destinations, setDestinations] = useState<DestinationOption[]>([]);
  const [operatingArea, setOperatingArea] = useState("Pilot City");
  const [serviceRadiusKm, setServiceRadiusKm] = useState(10);
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [supportsCustom, setSupportsCustom] = useState(false);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [accessibility, setAccessibility] = useState<string[]>([]);
  const [durations, setDurations] = useState<number[]>([30]);
  const [message, setMessage] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [offerSeconds, setOfferSeconds] = useState(0);
  const [offerAction, setOfferAction] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [history, setHistory] = useState<OperatorHistory[]>([]);
  const [videoToken, setVideoToken] = useState<{ token: string; url: string } | null>(null);
  const [mediaState, setMediaState] = useState<"idle" | "preparing" | "ready" | "failed">("idle");
  const [mediaRetry, setMediaRetry] = useState(0);
  const [tripEnded, setTripEnded] = useState(false);
  const [pilotStatus, setPilotStatus] = useState<"PENDING" | "APPROVED" | "SUSPENDED" | null>(null);
  const [pollingMessage, setPollingMessage] = useState("");
  const [pollRetry, setPollRetry] = useState(0);
  const endingRef = useRef(false);
  const endRequestRef = useRef(false);
  const teardownRef = useRef(false);
  const activeTripId = activeTrip?.id;
  const activeTripStatus = activeTrip?.status;

  useEffect(() => {
    const currentRequest = new AbortController();
    void fetch("/api/operator/settings", { cache: "no-store", signal: currentRequest.signal })
      .then(response => requireJsonResponse<{
        destinations?: DestinationOption[];
        destinationIds?: string[];
        online?: boolean;
        complete?: boolean;
        profile?: { operatingArea: string; serviceRadiusKm: number; supportsCustom: boolean; languages: string[]; accessibilityCapabilities: string[]; durationOptions: number[]; pilotStatus: "PENDING" | "APPROVED" | "SUSPENDED" };
      }>(response))
      .then((data) => {
        setDestinations(data.destinations ?? []);
        setDestinationIds(data.destinationIds ?? []);
        setOnline(Boolean(data.online));
        setSetupComplete(Boolean(data.complete));
        setEditing(!data.complete);
        if (data.profile) {
          setPilotStatus(data.profile.pilotStatus);
          setOperatingArea(data.profile.operatingArea);
          setServiceRadiusKm(data.profile.serviceRadiusKm);
          setSupportsCustom(data.profile.supportsCustom);
          setLanguages(data.profile.languages);
          setAccessibility(data.profile.accessibilityCapabilities);
          setDurations(data.profile.durationOptions);
        }
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Unable to load service settings. Please retry.");
      });
    void fetch("/api/trips/current", { cache: "no-store", signal: currentRequest.signal })
      .then(response => requireJsonResponse<{ trip: Trip | null }>(response))
      .then(data => {
        if (data.trip) {
          teardownRef.current = false;
          setOffer(null);
          setActiveTrip(data.trip);
        }
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setPollingMessage("Unable to restore the active visit. Please retry.");
        }
      });
    return () => currentRequest.abort();
  }, []);

  useEffect(() => {
    if (!activeTripId || (activeTripStatus !== "ACCEPTED" && activeTripStatus !== "IN_PROGRESS")) return;
    const request = new AbortController();
    let currentId = activeTripId;
    setMediaState("preparing");
    setVideoToken(null);

    void (async () => {
      try {
        if (activeTripStatus === "ACCEPTED") {
          const response = await fetch(`/api/trips/${currentId}/start`, { method: "POST", signal: request.signal });
          const data = await requireJsonResponse<{ trip: Trip }>(response);
          currentId = data.trip.id;
          setActiveTrip(data.trip);
        }
        const tokenResponse = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: currentId }),
          signal: request.signal,
        });
        const tokenData = await requireJsonResponse<{ token: string; url: string }>(tokenResponse);
        setVideoToken(tokenData);
        setMediaState("ready");
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setMediaState("failed");
      }
    })();

    return () => request.abort();
  }, [activeTripId, activeTripStatus, mediaRetry]);

  useEffect(() => {
    if (activeTrip) return;
    void fetch("/api/trips/history?limit=10", { cache: "no-store" })
      .then(response => requireJsonResponse<{ history: OperatorHistory[] }>(response))
      .then(data => setHistory(data.history ?? []))
      .catch(() => setMessage("Unable to load recent visit history. Please retry."));
  }, [activeTrip]);

  async function saveSettings() {
    setMessage("");
    const response = await fetch("/api/operator/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operatingArea,
        serviceRadiusKm,
        destinationIds,
        supportsCustom,
        languages,
        accessibilityCapabilities: accessibility,
        durationOptions: durations,
      }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Unable to save settings");
    setSetupComplete(true);
    setOnline(false);
    setEditing(false);
    setMessage("Service settings saved. You can now go online.");
  }

  async function toggleOnline() {
    const response = await fetch("/api/operator/online", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ online: !online }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error ?? "Unable to update availability");
    setOnline(data.online);
    setMessage("");
  }

  useEffect(() => {
    if (!online || activeTrip) return;
    setPollingMessage("");
    return createResilientPoller({
      intervalMs: 2000,
      maxIntervalMs: 16000,
      poll: async signal => {
        const response = await fetch("/api/operator/offers", { cache: "no-store", signal });
        const data = await requireJsonResponse<{ offer: Offer | null }>(response);
        setOffer(data.offer ?? null);
        return "continue";
      },
      onPersistentFailure: () => setPollingMessage("Connection interrupted. New visit offers may be delayed."),
      onRecovery: () => setPollingMessage(""),
    });
  }, [online, activeTrip, pollRetry]);

  useEffect(() => {
    if (!offer) return;
    const update = () => setOfferSeconds(Math.max(0, Math.ceil((new Date(offer.offerExpiresAt).getTime() - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [offer]);

  async function acceptOffer() {
    if (!offer || offerAction) return;
    setOfferAction(true);
    try {
      const response = await fetch(`/api/trips/${offer.id}/accept`, { method: "POST" });
      const data = await requireJsonResponse<{ trip: Trip }>(response);
      setActiveTrip(data.trip);
      setOffer(null);
      endingRef.current = false;
      endRequestRef.current = false;
      teardownRef.current = false;
      setTripEnded(false);
      setMediaState("preparing");
    } catch (error) {
      setOffer(null);
      setMessage(error instanceof Error ? error.message : "This offer is no longer available");
    } finally {
      setOfferAction(false);
    }
  }

  async function declineOffer() {
    if (!offer || offerAction) return;
    setOfferAction(true);
    await fetch(`/api/operator/offers/${offer.id}/decline`, { method: "POST" });
    setOffer(null);
    setOfferAction(false);
    setMessage("Offer declined. You remain online.");
  }

  async function endTrip() {
    if (!activeTrip || endRequestRef.current) return;
    endRequestRef.current = true;
    try {
      const response = await fetch(`/api/trips/${activeTrip.id}/end`, { method: "POST" });
      await requireJsonResponse(response);
      clearActiveCall();
    } catch {
      endRequestRef.current = false;
      setPollingMessage("Unable to end the visit. Check your connection and try again.");
    }
  }
  function clearActiveCall() {
    if (teardownRef.current) return;
    teardownRef.current = true;
    setTripEnded(false);
    setActiveTrip(null);
    setVideoToken(null);
    setMediaState("idle");
    setPollingMessage("");
  }

  useEffect(() => {
    if (!activeTripId) return;
    setPollingMessage("");
    return createResilientPoller({
      intervalMs: 1000,
      maxIntervalMs: 8000,
      poll: async signal => {
        const response = await fetch(`/api/trips/${activeTripId}`, { cache: "no-store", signal });
        const data = await requireJsonResponse<{ trip: Trip }>(response);
        setActiveTrip(data.trip);
        if (!["ACCEPTED", "IN_PROGRESS"].includes(data.trip.status) && !endingRef.current) {
          endingRef.current = true;
          setTripEnded(true);
          return "stop";
        }
        return "continue";
      },
      onPersistentFailure: () => setPollingMessage("Connection interrupted. Visit status will update when the connection returns."),
      onRecovery: () => setPollingMessage(""),
    });
  }, [activeTripId, pollRetry]);

  if (activeTrip && videoToken && activeTrip.acceptedAt && mediaState === "ready") {
    return <><PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} /><VideoRoom token={videoToken.token} serverUrl={videoToken.url} destination={activeTrip.destination} acceptedAt={activeTrip.acceptedAt} canPublishCamera canPublishMicrophone disconnect={tripEnded} onAuthoritativeDisconnect={clearActiveCall} onEnd={endTrip} /></>;
  }

  if (activeTrip) {
    return <ActiveVisitPreparation trip={activeTrip} failed={mediaState === "failed"} onRetry={() => setMediaRetry(value => value + 1)} onEnd={endTrip} />;
  }

  const toggleString = (value: string, values: string[], setValues: (values: string[]) => void) => setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold uppercase text-spartan-green">Operator marketplace</p><h1 className="text-3xl font-bold">Service dashboard</h1></div><button type="button" disabled={!setupComplete} onClick={toggleOnline} className={`min-h-12 rounded-full px-5 font-semibold disabled:opacity-40 ${online ? "bg-spartan-green text-white" : "border border-spartan-green text-spartan-green"}`}>{online ? "Online" : "Go online"}</button></div>
      {message && <p className="mt-4 rounded-lg bg-gray-100 p-3 text-sm" role="status">{message}</p>}
      <PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} />
      {pilotStatus === "PENDING" && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">Your operator profile is awaiting pilot approval.</p>}
      {pilotStatus === "SUSPENDED" && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">Your pilot participation is suspended. You cannot accept new visits.</p>}

      {(editing || !setupComplete) ? (
        <section className="mt-6 rounded-2xl border p-5"><h2 className="text-xl font-bold">Service setup</h2><p className="mt-1 text-sm text-gray-600">Complete the required settings before going online.</p>
          <label className="mt-4 block text-sm font-medium">Operating area<select value={operatingArea} onChange={(event) => setOperatingArea(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3">{[...new Set(destinations.map((destination) => destination.city))].map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label className="mt-4 block text-sm font-medium">Planning radius (km)<input type="number" min={1} max={100} value={serviceRadiusKm} onChange={(event) => setServiceRadiusKm(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><p className="mt-1 text-xs text-gray-500">Stored for future distance-aware matching. Pilot matching currently uses the selected operating area.</p>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Destinations offered</legend>{destinations.map((destination) => <label key={destination.id} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={destinationIds.includes(destination.id)} onChange={() => toggleString(destination.id, destinationIds, setDestinationIds)} />{destination.name}</label>)}</fieldset>
          <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={supportsCustom} onChange={(event) => setSupportsCustom(event.target.checked)} />Accept custom destination requests for safe, publicly accessible places</label>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Languages</legend>{LANGUAGE_OPTIONS.map((item) => <label key={item} className="mr-4 mt-2 inline-flex gap-2 text-sm"><input type="checkbox" checked={languages.includes(item)} onChange={() => toggleString(item, languages, setLanguages)} />{item}</label>)}</fieldset>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Supported durations</legend>{DURATION_OPTIONS.map((item) => <label key={item} className="mr-4 mt-2 inline-flex gap-2 text-sm"><input type="checkbox" checked={durations.includes(item)} onChange={() => setDurations(durations.includes(item) ? durations.filter((value) => value !== item) : [...durations, item])} />{item} min</label>)}</fieldset>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Accessibility capabilities</legend>{ACCESSIBILITY_OPTIONS.map((item) => <label key={item} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={accessibility.includes(item)} onChange={() => toggleString(item, accessibility, setAccessibility)} />{item}</label>)}</fieldset>
          <button type="button" onClick={saveSettings} className="mt-6 min-h-12 w-full rounded-lg bg-spartan-green font-semibold text-white">Save service setup</button>
        </section>
      ) : <button type="button" onClick={() => setEditing(true)} className="mt-5 min-h-11 rounded-lg border px-4">Edit service setup</button>}

      {!editing && online && !offer && <div className="mt-8 rounded-2xl bg-gray-950 p-6 text-white"><p className="font-semibold">Online and ready</p><p className="mt-1 text-sm text-gray-300">Waiting for a compatible visit request…</p></div>}
      {!editing && offer && <section className="mt-8 overflow-hidden rounded-2xl border-2 border-gray-950 bg-white shadow-xl"><div className="bg-gray-950 p-5 text-white"><div className="flex justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Immediate visit offer</p><h2 className="mt-1 text-2xl font-bold">{offer.customDestination || offer.destination}</h2></div><p className="shrink-0 text-lg font-bold" aria-label={`Offer expires in ${offerSeconds} seconds`}>{offerSeconds}s</p></div></div><dl className="grid gap-3 p-5 text-sm"><div><dt className="text-gray-500">Starting-point preference</dt><dd className="font-medium">{offer.meetingArea || "No starting preference provided. Choose an appropriate place to begin the video visit."}</dd></div><div><dt className="text-gray-500">Duration</dt><dd>{offer.requestedDuration} minutes</dd></div><div><dt className="text-gray-500">Language</dt><dd>{offer.preferredLanguage || "No preference"}</dd></div>{offer.accessibilityNeeds.length > 0 && <div><dt className="text-gray-500">Accessibility</dt><dd>{offer.accessibilityNeeds.join(", ")}</dd></div>}{offer.viewerNote && <div><dt className="text-gray-500">Visit instructions</dt><dd>{offer.viewerNote}</dd></div>}</dl><div className="grid grid-cols-2 gap-3 p-5 pt-0"><button type="button" disabled={offerAction || offerSeconds <= 0} onClick={declineOffer} className="min-h-12 rounded-lg border font-semibold disabled:opacity-50">Decline</button><button type="button" disabled={offerAction || offerSeconds <= 0} onClick={acceptOffer} className="min-h-12 rounded-lg bg-spartan-green font-semibold text-white disabled:opacity-50">Accept</button></div></section>}
      {!editing && !offer && <section className="mt-8" aria-labelledby="operator-history-heading"><h2 id="operator-history-heading" className="text-xl font-semibold">Recent offers and visits</h2>{history.length === 0 ? <p className="mt-2 text-sm text-gray-500">No offer history yet.</p> : <ul className="mt-3 divide-y rounded-xl border">{history.map((item, index) => <li key={`${item.trip.id}-${index}`} className="p-3"><p className="font-medium">{item.trip.destination}</p><p className="text-sm text-gray-600">Offer {item.status.toLowerCase()} · Visit {item.trip.status.replaceAll("_", " ").toLowerCase()}</p></li>)}</ul>}</section>}
      <ProfileSettings role="operator" />
    </div>
  );
}

function PollingNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  if (!message) return null;
  return <div className="m-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status"><span>{message}</span><button type="button" onClick={onRetry} className="min-h-11 shrink-0 rounded-md border border-amber-700 px-3 font-semibold">Retry</button></div>;
}

function ActiveVisitPreparation({ trip, failed, onRetry, onEnd }: { trip: Trip; failed: boolean; onRetry: () => void; onEnd: () => void }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-gray-950 p-6 text-white"><section className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 p-6 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Active visit</p><h1 className="mt-2 text-2xl font-bold">{trip.destination}</h1><p className="mt-4 text-gray-300" role="status">{failed ? "Unable to connect to live media. Your visit is still active." : "Preparing camera and microphone…"}</p>{failed && <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-full bg-white px-5 font-semibold text-gray-950">Try media again</button>}<button type="button" onClick={onEnd} className="mt-5 min-h-11 w-full rounded-full border border-red-400 px-5 font-semibold text-red-200">End visit</button></section></main>;
}
