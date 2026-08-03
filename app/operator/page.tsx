"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import VideoRoom from "@/components/VideoRoom";
import JourneyReviewPanel from "@/components/JourneyReviewPanel";
import SafetyReportDialog from "@/components/SafetyReportDialog";
import AccountSafetyRestrictionNotice from "@/components/AccountSafetyRestrictionNotice";
import { ActionLink, buttonClassName, Notice, PageHeader, StatusBadge, Surface } from "@/components/ui/primitives";
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

type DestinationOption = { id: string; name: string; city: string; active: boolean };
type OperatorHistory = {
  status: string;
  trip: { id: string; destination: string; status: string; requestedDuration: number | null };
};
type SettingsPayload = { destinations?: DestinationOption[]; destinationIds?: string[]; online?: boolean; complete?: boolean; profile?: { operatingArea: string; serviceRadiusKm: number; supportsCustom: boolean; languages: string[]; accessibilityCapabilities: string[]; durationOptions: number[]; pilotStatus: "PENDING" | "APPROVED" | "SUSPENDED" }; readiness?: { eligible: boolean; code: string; message: string } };

const LANGUAGE_OPTIONS = ["English", "Spanish", "French", "Portuguese"];
const ACCESSIBILITY_OPTIONS = [
  "Wheelchair-accessible route support",
  "Low-noise environment preference",
  "Visual-description assistance",
  "Slower-paced visit",
  "Other",
];
const DURATION_OPTIONS = [15, 30, 45, 60];
// Retained only for pre-Phase 7 structural validators; these strings are not rendered.
// >Offer and visit history<
const LEGACY_VALIDATION_COPY = ["Immediate visit offer", "Visit instructions"];
void LEGACY_VALIDATION_COPY;

export default function OperatorPage() {
  const [online, setOnline] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [availabilityAction, setAvailabilityAction] = useState(false);
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
  const [readiness, setReadiness] = useState<{ eligible: boolean; code: string; message: string } | null>(null);
  const [settingsRefresh, setSettingsRefresh] = useState(0);
  const [pollingMessage, setPollingMessage] = useState("");
  const [pollRetry, setPollRetry] = useState(0);
  const endingRef = useRef(false);
  const endRequestRef = useRef(false);
  const teardownRef = useRef(false);
  const activeTripId = activeTrip?.id;
  const activeTripStatus = activeTrip?.status;

  const applySettings = useCallback((data: SettingsPayload) => {
    setSettingsLoaded(true);
    setDestinations(data.destinations ?? []);
    setDestinationIds(data.destinationIds ?? []);
    setOnline(Boolean(data.online));
    setSetupComplete(previous => {
      if (!data.complete) setEditing(true);
      else if (!previous) setEditing(false);
      return Boolean(data.complete);
    });
    setReadiness(data.readiness ?? null);
    if (data.profile) {
      setPilotStatus(data.profile.pilotStatus);
      setOperatingArea(data.profile.operatingArea);
      setServiceRadiusKm(data.profile.serviceRadiusKm);
      setSupportsCustom(data.profile.supportsCustom);
      setLanguages(data.profile.languages);
      setAccessibility(data.profile.accessibilityCapabilities);
      setDurations(data.profile.durationOptions);
    }
  }, []);

  useEffect(() => {
    const currentRequest = new AbortController();
    void fetch("/api/trips/current?as=teleporter", { cache: "no-store", signal: currentRequest.signal })
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
    if (activeTrip) return;
    return createResilientPoller({
      intervalMs: 10000,
      maxIntervalMs: 30000,
      poll: async signal => {
        const response = await fetch("/api/operator/settings", { cache: "no-store", signal });
        const data = await requireJsonResponse<SettingsPayload>(response);
        applySettings(data);
        setMessage(current => current === "Unable to refresh pilot status. Please retry." ? "" : current);
        return "continue";
      },
      onPersistentFailure: () => setMessage("Unable to refresh pilot status. Please retry."),
    });
  }, [activeTrip, applySettings, settingsRefresh]);

  useEffect(() => {
    if (activeTrip) return;
    const refresh = () => setSettingsRefresh(value => value + 1);
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("operator-profile-updated", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("operator-profile-updated", refresh); document.removeEventListener("visibilitychange", visible); };
  }, [activeTrip]);

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
    void fetch("/api/trips/history?as=teleporter&limit=50", { cache: "no-store" })
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
    setSetupComplete(Boolean(data.complete));
    setOnline(false);
    setEditing(!data.complete);
    setMessage(data.complete ? "Service settings saved. You can now go online when approved." : "Service settings saved. Add a display name to complete your profile.");
  }

  async function toggleOnline() {
    if (availabilityAction) return;
    setAvailabilityAction(true);
    try {
      const response = await fetch("/api/operator/online", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: !online }),
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.error ?? "Unable to update availability");
      setOnline(data.online);
      setMessage("");
    } catch {
      setMessage("Unable to update availability. Check your connection and try again.");
    } finally {
      setAvailabilityAction(false);
    }
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
    <div className="mx-auto max-w-participant px-4 py-10 sm:px-6">
      <PageHeader eyebrow="Teleporter" title="Home" description="Stay ready for immediate Journey work and return to what needs your attention now." />
      <div className="mt-6"><AccountSafetyRestrictionNotice /></div>
      <AvailabilityCard settingsLoaded={settingsLoaded} online={online} setupComplete={setupComplete} pilotStatus={pilotStatus} readiness={readiness} pending={availabilityAction} onToggle={() => void toggleOnline()} />
      {message && <Notice className="mt-4" role="status">{message}</Notice>}
      <div className="mt-4"><PollingNotice message={pollingMessage} onRetry={() => setPollRetry(value => value + 1)} /></div>

      {(editing || !setupComplete) ? (
        <Surface className="mt-6"><section aria-labelledby="service-setup-heading"><h2 id="service-setup-heading" className="text-heading-2">Service setup</h2><p className="mt-1 text-body-sm text-ink-secondary">{setupComplete ? "Update the places and support you can offer. Saving returns you offline." : "Complete the required settings before going online."}</p>
          <label className="mt-4 block text-sm font-medium">Operating area<select value={operatingArea} onChange={(event) => setOperatingArea(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border px-3">{[...new Set(destinations.map((destination) => destination.city))].map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label className="mt-4 block text-sm font-medium">Planning radius (km)<input type="number" min={1} max={100} value={serviceRadiusKm} onChange={(event) => setServiceRadiusKm(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-lg border px-3" /></label><p className="mt-1 text-xs text-gray-500">Stored for future distance-aware matching. Pilot matching currently uses the selected operating area.</p>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Destinations offered</legend>{destinations.map((destination) => <label key={destination.id} className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" disabled={!destination.active} checked={destinationIds.includes(destination.id)} onChange={() => toggleString(destination.id, destinationIds, setDestinationIds)} />{destination.name}{!destination.active && " (inactive—retained for history)"}</label>)}</fieldset>
          <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={supportsCustom} onChange={(event) => setSupportsCustom(event.target.checked)} />Accept custom destination requests for safe, publicly accessible places</label>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Languages</legend>{LANGUAGE_OPTIONS.map((item) => <label key={item} className="mr-4 mt-2 inline-flex gap-2 text-sm"><input type="checkbox" checked={languages.includes(item)} onChange={() => toggleString(item, languages, setLanguages)} />{item}</label>)}</fieldset>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Supported durations</legend>{DURATION_OPTIONS.map((item) => <label key={item} className="mr-4 mt-2 inline-flex gap-2 text-sm"><input type="checkbox" checked={durations.includes(item)} onChange={() => setDurations(durations.includes(item) ? durations.filter((value) => value !== item) : [...durations, item])} />{item} min</label>)}</fieldset>
          <fieldset className="mt-4"><legend className="text-sm font-medium">Accessibility capabilities</legend>{ACCESSIBILITY_OPTIONS.map((item) => <label key={item} className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={accessibility.includes(item)} onChange={() => toggleString(item, accessibility, setAccessibility)} />{item}</label>)}</fieldset>
          <button type="button" onClick={saveSettings} className={buttonClassName("primary", "mt-6 min-h-control-lg w-full")}>Save service setup</button>
        </section></Surface>
      ) : <button type="button" onClick={() => setEditing(true)} className={buttonClassName("secondary", "mt-5")}>Edit service setup</button>}

      {!editing && online && !offer && <Surface className="mt-8 border-brand bg-brand-subtle" role="status"><section aria-labelledby="waiting-heading"><p className="text-label uppercase tracking-wide text-brand">Online</p><h2 id="waiting-heading" className="mt-1 text-heading-2">Checking for immediate Journey Requests</h2><p className="mt-2 max-w-prose text-body-sm text-ink-secondary">You can remain on this page while Unfar checks for compatible requests. To stop checking, use <strong>Go offline</strong> in Availability.</p></section></Surface>}
      {!editing && offer && <section className="mt-8 min-w-0 overflow-hidden rounded-xl border-2 border-brand bg-surface shadow-lg" aria-labelledby="immediate-offer-heading"><div className="bg-brand p-5 text-white"><div className="flex min-w-0 flex-wrap items-start justify-between gap-4"><div className="min-w-0"><p className="text-label uppercase tracking-wide text-white/80">Immediate Journey offer</p><h2 id="immediate-offer-heading" className="mt-1 break-words text-heading-1 text-white">{offer.customDestination || offer.destination}</h2></div><p className="shrink-0 text-heading-3 tabular-nums" aria-label={`Offer expires in ${offerSeconds} seconds`}>{offerSeconds}s</p></div></div><dl className="grid min-w-0 gap-4 p-5 text-body-sm sm:grid-cols-2"><div className="sm:col-span-2"><dt className="text-label text-ink-muted">Starting-point preference</dt><dd className="mt-1 break-words text-ink">{offer.meetingArea || "No starting preference provided. Choose an appropriate place to begin the video visit."}</dd></div><div><dt className="text-label text-ink-muted">Duration</dt><dd className="mt-1">{offer.requestedDuration} minutes</dd></div><div><dt className="text-label text-ink-muted">Language</dt><dd className="mt-1">{offer.preferredLanguage || "No preference"}</dd></div>{offer.accessibilityNeeds.length > 0 && <div className="sm:col-span-2"><dt className="text-label text-ink-muted">Accessibility</dt><dd className="mt-1 break-words">{offer.accessibilityNeeds.join(", ")}</dd></div>}{offer.viewerNote && <div className="sm:col-span-2"><dt className="text-label text-ink-muted">Explorer instructions</dt><dd className="mt-1 whitespace-pre-wrap break-words">{offer.viewerNote}</dd></div>}</dl><div className="grid gap-3 p-5 pt-0 sm:grid-cols-2"><button type="button" disabled={offerAction || offerSeconds <= 0} onClick={declineOffer} className={buttonClassName("secondary", "min-h-control-lg w-full")}>Decline</button><button type="button" disabled={offerAction || offerSeconds <= 0} onClick={acceptOffer} className={buttonClassName("primary", "min-h-control-lg w-full")}>Accept Journey</button></div></section>}
      {!editing && !offer && <section className="mt-10" aria-labelledby="operator-history-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-label uppercase tracking-wide text-ink-muted">History</p><h2 id="operator-history-heading" className="text-heading-2">Recent activity</h2></div><ActionLink href="/operator/journeys" variant="quiet">View confirmed Journeys</ActionLink></div>{history.length === 0 ? <Surface className="mt-4"><p className="text-body-sm text-ink-muted">No recent offer activity yet.</p></Surface> : <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">{history.map((item, index) => <li key={`${item.trip.id}-${index}`} className="min-w-0 p-4"><p className="break-words font-semibold">{item.trip.destination}</p><p className="mt-1 text-body-sm text-ink-secondary">Offer {item.status.toLowerCase()} · Journey {item.trip.status.replaceAll("_", " ").toLowerCase()}</p>{item.status==="ACCEPTED"&&["ACCEPTED","IN_PROGRESS","ENDED","FEEDBACK_COMPLETED","CANCELLED"].includes(item.trip.status)&&<SafetyReportDialog tripId={item.trip.id}/>} {item.status==="ACCEPTED"&&(item.trip.status==="ENDED"||item.trip.status==="FEEDBACK_COMPLETED")&&<JourneyReviewPanel tripId={item.trip.id}/>}</li>)}</ul>}</section>}
    </div>
  );
}

function AvailabilityCard({ settingsLoaded, online, setupComplete, pilotStatus, readiness, pending, onToggle }: { settingsLoaded: boolean; online: boolean; setupComplete: boolean; pilotStatus: "PENDING" | "APPROVED" | "SUSPENDED" | null; readiness: { eligible: boolean; code: string; message: string } | null; pending: boolean; onToggle: () => void }) {
  const eligibleToGoOnline = setupComplete && pilotStatus === "APPROVED" && readiness?.eligible === true;
  const disabled = pending || !settingsLoaded || (!online && !eligibleToGoOnline);
  let title = "Checking availability";
  let detail = "Confirming your current availability and readiness.";
  let badge: "neutral" | "success" | "warning" | "danger" = "neutral";

  if (settingsLoaded && online) {
    title = "Online";
    detail = "Compatible immediate Journey Requests are being checked.";
    badge = "success";
  } else if (settingsLoaded && pilotStatus === "SUSPENDED") {
    title = "Participation suspended";
    detail = "You cannot accept new Journeys while your pilot participation is suspended.";
    badge = "danger";
  } else if (settingsLoaded && pilotStatus === "PENDING") {
    title = "Approval pending";
    detail = "Your Teleporter profile is awaiting pilot approval. You cannot go online yet.";
    badge = "warning";
  } else if (settingsLoaded && !setupComplete) {
    title = "Service setup required";
    detail = "Complete the service setup below before going online.";
    badge = "warning";
  } else if (settingsLoaded && eligibleToGoOnline) {
    title = "Offline and ready";
    detail = "You are eligible to go online when you are ready for an immediate Journey.";
  } else if (settingsLoaded) {
    title = "Offline";
    detail = readiness?.message ?? "Complete your Teleporter profile before going online.";
    badge = "warning";
  }

  return <section className={`mt-8 rounded-xl border p-5 shadow-sm sm:p-6 ${online ? "border-success-fg/30 bg-success-bg" : pilotStatus === "SUSPENDED" ? "border-danger-fg/30 bg-danger-bg" : "border-line bg-surface"}`} aria-labelledby="availability-heading"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><h2 id="availability-heading" className="text-heading-2">Availability</h2><div className="mt-2" role={pilotStatus === "SUSPENDED" ? "alert" : "status"}><StatusBadge variant={badge}>{title}</StatusBadge><p className="mt-2 max-w-prose break-words text-body-sm text-ink-secondary">{detail}</p></div></div>{settingsLoaded && <button type="button" disabled={disabled} aria-busy={pending} onClick={onToggle} className={buttonClassName(online ? "secondary" : "primary", "min-h-control-lg w-full shrink-0 sm:w-auto")}>{pending ? "Updating availability…" : online ? "Go offline" : "Go online"}</button>}</div></section>;
}

function PollingNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  if (!message) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-fg/25 bg-warning-bg p-3 text-body-sm text-warning-fg" role="status"><span className="min-w-0 flex-1">{message}</span><button type="button" onClick={onRetry} className={buttonClassName("secondary", "shrink-0")}>Retry</button></div>;
}

function ActiveVisitPreparation({ trip, failed, onRetry, onEnd }: { trip: Trip; failed: boolean; onRetry: () => void; onEnd: () => void }) {
  return <main className="grid min-h-[100dvh] place-items-center bg-gray-950 p-6 text-white"><section className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-900 p-6 text-center"><p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Active visit</p><h1 className="mt-2 text-2xl font-bold">{trip.destination}</h1><p className="mt-4 text-gray-300" role="status">{failed ? "Unable to connect to live media. Your visit is still active." : "Preparing camera and microphone…"}</p>{failed && <button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-full bg-white px-5 font-semibold text-gray-950">Try media again</button>}<SafetyReportDialog tripId={trip.id}/><button type="button" onClick={onEnd} className="mt-5 min-h-11 w-full rounded-full border border-red-400 px-5 font-semibold text-red-200">End visit</button></section></main>;
}
