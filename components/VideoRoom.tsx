"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChatEntry,
  ChatToggle,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  useConnectionState,
  useChat,
  useCreateLayoutContext,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import type { ReceivedChatMessage } from "@livekit/components-react";
import {
  inferCurrentFacing,
  replacePublishedCameraSource,
  runExclusiveCameraSwitch,
  shouldOfferCameraSwitch,
  type CameraFacing,
} from "@/lib/camera-switch";
import { ConnectionState, LocalVideoTrack, Track } from "livekit-client";
import { cycleDialogFocus } from "@/lib/admin-role-ui";
import "@livekit/components-styles";

type VisitRole = "viewer" | "operator";

// Retained only for the pre-Phase 7 active-visit structural validator; this copy is not rendered.
const LEGACY_ACTIVE_VISIT_COPY = "Your visit is still active";
void LEGACY_ACTIVE_VISIT_COPY;

function VisitChatToggle({ unreadCount }: { unreadCount: number }) {
  const unreadLabel = unreadCount === 1 ? "1 unread message" : `${unreadCount} unread messages`;

  return (
    <ChatToggle
      aria-label={unreadCount > 0 ? `Open Journey chat, ${unreadLabel}` : "Open Journey chat"}
      className="relative min-h-11 min-w-0 overflow-hidden whitespace-nowrap rounded-xl px-2 text-xs focus-visible:ring-2 focus-visible:ring-white"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-5 w-5 shrink-0 fill-none stroke-current"
      >
        <path
          d="M5 5h14v10H9l-4 4V5Z"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
      <span className="max-[340px]:sr-only">Journey chat</span>
      {unreadCount > 0 && (
        <span
          className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[0.65rem] font-bold leading-none text-white"
          aria-hidden="true"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </ChatToggle>
  );
}

function VisitChat({
  messages,
  send,
  isSending,
}: {
  messages: ReceivedChatMessage[];
  send: (message: string) => Promise<unknown>;
  isSending: boolean;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;

    setDraft("");
    await send(message);
  }

  return (
    <section
      className="fixed inset-x-0 bottom-0 z-40 grid max-h-[70dvh] grid-rows-[auto_1fr_auto] border-t border-white/10 bg-[#181818] sm:inset-y-0 sm:left-auto sm:w-96 sm:max-h-none sm:border-l sm:border-t-0"
      aria-label="Journey chat"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="font-semibold">Journey chat</h2>
        <ChatToggle aria-label="Close Journey chat" className="min-h-11 rounded-full px-4 focus-visible:ring-2 focus-visible:ring-white">
          Close chat
        </ChatToggle>
      </div>
      <ul ref={listRef} className="lk-list lk-chat-messages min-h-0 overflow-y-auto break-words">
        {messages.length === 0 && <li className="p-4 text-sm text-gray-400">No Journey chat messages yet.</li>}
        {messages.map((message, index) => (
          <ChatEntry key={message.id ?? `${message.timestamp}-${index}`} entry={message} />
        ))}
      </ul>
      <form className="flex gap-2 border-t border-white/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" onSubmit={submit}>
        <input
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-black px-3 text-white"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Enter a message…"
          aria-label="Journey chat message"
          disabled={isSending}
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-white px-4 font-semibold text-black focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
          disabled={isSending || !draft.trim()}
        >
          {isSending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function VisitTimer({ acceptedAt }: { acceptedAt: string }) {
  const acceptedTime = useMemo(() => new Date(acceptedAt).getTime(), [acceptedAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, Math.floor((now - acceptedTime) / 1000));
  return <span aria-label={`Journey duration ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</span>;
}

function connectionLabel(state: ConnectionState) {
  switch (state) {
    case ConnectionState.Connected:
      return "Connected";
    case ConnectionState.Reconnecting:
      return "Reconnecting…";
    case ConnectionState.Disconnected:
      return "Disconnected";
    default:
      return "Connecting…";
  }
}

function mediaFailureMessage(error?: Error) {
  const detail = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (detail.includes("notallowed") || detail.includes("permission") || detail.includes("denied")) return "Camera or microphone permission was denied. Allow access and try again.";
  if (detail.includes("notfound") || detail.includes("device")) return "A required camera or microphone was not found.";
  if (detail.includes("websocket") || detail.includes("signal")) return "The live Journey service could not be reached. Check your connection and try again.";
  if (detail.includes("ice") || detail.includes("transport")) return "The media connection could not be established on this network.";
  return "Unable to connect. Check your connection and try again.";
}

function ParticipantIdentity({
  name,
  designation,
  imageUrl,
  detail,
}: {
  name: string;
  designation: string;
  imageUrl?: string;
  detail?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || designation[0];

  return (
    <div className="flex items-center gap-3" data-participant-identity>
      <div
        className="h-12 w-12 shrink-0 rounded-full bg-gray-700 bg-cover bg-center text-center text-sm font-semibold leading-[3rem] text-white"
        style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
        aria-hidden="true"
      >
        {!imageUrl && initials}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{name}</p>
        <p className="text-xs text-gray-300">
          {designation}
          {detail ? ` · ${detail}` : ""}
        </p>
      </div>
    </div>
  );
}

function ConfirmVisitAction({
  label,
  title,
  description,
  onConfirm,
  pending = false,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const safeActionRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = () => { setConfirming(false); requestAnimationFrame(() => triggerRef.current?.focus()); };

  useEffect(() => {
    if (!confirming) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [confirming]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="min-h-12 rounded-full bg-red-600 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        {pending ? "Ending Journey…" : label}
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="journey-confirm-title"
          onKeyDown={(event) => {
            if (event.key !== "Tab" || !dialogRef.current) return;
            const elements = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
            cycleDialogFocus(event.nativeEvent, elements, elements.indexOf(document.activeElement as HTMLElement));
          }}
        >
          <div ref={dialogRef} className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 text-gray-950 shadow-2xl">
            <h2 id="journey-confirm-title" className="text-xl font-bold">
              {title}
            </h2>
            <p className="mt-2 text-sm text-gray-600">{description}</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                ref={safeActionRef}
                type="button"
                className="min-h-11 rounded-full border border-gray-300 px-5 font-medium focus-visible:ring-2 focus-visible:ring-black"
                onClick={close}
                autoFocus
              >
                Keep Journey active
              </button>
              <button
                type="button"
                className="min-h-11 rounded-full bg-red-600 px-5 font-semibold text-white focus-visible:ring-2 focus-visible:ring-black"
                onClick={() => {
                  setConfirming(false);
                  onConfirm();
                }}
                disabled={pending}
              >
                {label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VisitHeader({
  destination,
  acceptedAt,
  connectionState,
  visitEnded,
}: {
  destination: string;
  acceptedAt: string;
  connectionState: ConnectionState;
  visitEnded: boolean;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400">
          Active Journey
        </p>
        <h1 className="break-words text-xl font-bold text-white">{destination}</h1>
      </div>
      <div className="shrink-0 text-right text-sm text-gray-200">
        <VisitTimer acceptedAt={acceptedAt} />
        <p className="mt-1" aria-live="polite" aria-atomic="true">
          {visitEnded ? "Journey ended" : connectionLabel(connectionState)}
        </p>
      </div>
    </header>
  );
}

function cameraSwitchMessage(error: unknown) {
  const detail = error instanceof Error ? `${error.name} ${error.message}`.toLowerCase() : "";
  if (detail.includes("notallowed") || detail.includes("permission") || detail.includes("denied")) {
    return "Camera access was not allowed. Your current camera will remain in use.";
  }
  if (detail.includes("notfound") || detail.includes("overconstrained")) {
    return "The other camera is unavailable. Your current camera will remain in use.";
  }
  return "Unable to switch cameras. Your current camera will remain in use.";
}

function OperatorCameraSwitch({ cameraTrack }: { cameraTrack?: LocalVideoTrack }) {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [hasFrontRearCapabilities, setHasFrontRearCapabilities] = useState(false);
  const [mobileMediaEnvironment, setMobileMediaEnvironment] = useState(false);
  const [currentFacing, setCurrentFacing] = useState<CameraFacing>("user");
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState("");
  const switchingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    setMobileMediaEnvironment(
      navigator.maxTouchPoints > 0 && window.matchMedia?.("(pointer: coarse)").matches === true
    );
    setCurrentFacing(inferCurrentFacing(cameraTrack?.getSourceTrackSettings() ?? {}, "user"));
    if (!mediaDevices?.enumerateDevices) return;

    const refreshDevices = async () => {
      try {
        const devices = await mediaDevices.enumerateDevices();
        if (!mountedRef.current) return;
        setVideoDevices(devices.filter((device) => device.kind === "videoinput"));

        const capabilities = cameraTrack?.mediaStreamTrack.getCapabilities?.();
        const facingModes = capabilities?.facingMode ?? [];
        setHasFrontRearCapabilities(
          facingModes.includes("user") && facingModes.includes("environment")
        );
      } catch {
        if (mountedRef.current) {
          setVideoDevices([]);
          setHasFrontRearCapabilities(false);
        }
      }
    };

    void refreshDevices();
    const delayedRefreshes = [500, 1500].map((delay) =>
      window.setTimeout(() => void refreshDevices(), delay)
    );
    mediaDevices.addEventListener?.("devicechange", refreshDevices);
    return () => {
      delayedRefreshes.forEach((timer) => window.clearTimeout(timer));
      mediaDevices.removeEventListener?.("devicechange", refreshDevices);
    };
  }, [cameraTrack]);

  const hasMediaConstraintSupport = Boolean(navigator.mediaDevices?.getUserMedia);
  const canAttemptSwitch = shouldOfferCameraSwitch({
    hasActiveTrack: Boolean(cameraTrack),
    hasGetUserMedia: hasMediaConstraintSupport,
    videoInputCount: videoDevices.length,
    hasFrontRearCapabilities,
    mobileMediaEnvironment,
  });

  if (!cameraTrack || !canAttemptSwitch) return null;

  async function switchCamera() {
    if (!cameraTrack) return;
    await runExclusiveCameraSwitch({
      operationLock: switchingRef,
      mounted: mountedRef,
      setBusy: setSwitching,
      operation: async () => {
        if (mountedRef.current) setError("");
        try {
          const selectedFacing = await replacePublishedCameraSource({
            cameraTrack,
            videoDevices,
            currentFacing,
          });
          if (mountedRef.current) setCurrentFacing(selectedFacing);
        } catch (switchError) {
          if (mountedRef.current) setError(cameraSwitchMessage(switchError));
        }
      },
    });
  }

  return (
    <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-2">
      <button
        type="button"
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-black/75 px-3 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-60"
        onClick={() => void switchCamera()}
        disabled={switching}
        aria-label={switching ? "Switching camera" : "Switch front or rear camera"}
        aria-busy={switching}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current">
          <path d="M8 7h8l2 3h2v8H4v-8h2l2-3Z" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M9 13a3 3 0 1 0 6 0" strokeWidth="1.8" />
          <path d="m8 3-2 2 2 2M16 3l2 2-2 2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="max-[360px]:sr-only">{switching ? "Switching…" : "Switch camera"}</span>
      </button>
      {error && (
        <p className="max-w-64 rounded-lg bg-red-950/95 px-3 py-2 text-xs text-white" role="status">
          {error}
        </p>
      )}
    </div>
  );
}

function ActiveVisitConference({
  role,
  destination,
  acceptedAt,
  onEnd,
  connectionError,
  onRetry,
  visitEnded,
  ending,
}: {
  role: VisitRole;
  destination: string;
  acceptedAt: string;
  onEnd: () => void;
  connectionError: string | null;
  onRetry: () => void;
  visitEnded: boolean;
  ending: boolean;
}) {
  const [showChat, setShowChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatAnnouncement, setChatAnnouncement] = useState("");
  const previousMessageCountRef = useRef(0);
  const layoutContext = useCreateLayoutContext();
  const { chatMessages, send, isSending } = useChat();
  const connectionState = useConnectionState();
  const remoteParticipants = useRemoteParticipants();
  const allCameraTracks = useTracks([Track.Source.Camera], {
    onlySubscribed: false,
  });
  const cameraTracks = allCameraTracks.filter((track) =>
    role === "viewer" ? !track.participant.isLocal : track.participant.isLocal
  );
  const otherParticipant = remoteParticipants[0];
  const participantName =
    otherParticipant?.name || (role === "viewer" ? "Your Teleporter" : "Your Explorer");
  const microphoneDetail = otherParticipant
    ? otherParticipant.getTrackPublication(Track.Source.Microphone)
      ? otherParticipant.isMicrophoneEnabled
        ? "Microphone active"
        : "Microphone muted"
      : "Microphone unavailable"
    : role === "operator"
      ? "Waiting for Explorer audio"
      : undefined;

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;

    if (chatMessages.length < previousCount) {
      previousMessageCountRef.current = chatMessages.length;
      return;
    }

    const incomingMessages = chatMessages
      .slice(previousCount)
      .filter((message) => !message.from?.isLocal);

    previousMessageCountRef.current = chatMessages.length;

    if (!showChat && incomingMessages.length > 0) {
      setUnreadCount((count) => count + incomingMessages.length);
      setChatAnnouncement(
        incomingMessages.length === 1
          ? "New chat message received"
          : `${incomingMessages.length} new chat messages received`
      );
    }
  }, [chatMessages, showChat]);

  useEffect(() => {
    if (showChat) {
      setUnreadCount(0);
      setChatAnnouncement("");
    }
  }, [showChat]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#101010] text-white">
      <VisitHeader
        destination={destination}
        acceptedAt={acceptedAt}
        connectionState={connectionState}
        visitEnded={visitEnded}
      />
      {connectionState === ConnectionState.Reconnecting && <div className="mx-3 mb-2 rounded-lg border border-amber-300/40 bg-amber-950/90 px-4 py-3 text-sm text-amber-50 sm:mx-6" role="status"><strong>Reconnecting…</strong> Media may pause temporarily while LiveKit restores the connection.</div>}
      {connectionState === ConnectionState.Disconnected && !visitEnded && <div className="mx-3 mb-2 rounded-lg border border-red-300/40 bg-red-950/90 px-4 py-3 text-sm text-red-50" role="status">Disconnected from media. The Journey has not been marked ended.</div>}

      <LayoutContextProvider
        value={layoutContext}
        onWidgetChange={(state) => setShowChat(state.showChat)}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden sm:grid sm:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative min-h-0 flex-1 bg-black sm:h-full">
            {role === "operator" && (
              <OperatorCameraSwitch cameraTrack={cameraTracks[0]?.publication.track as LocalVideoTrack | undefined} />
            )}
            <GridLayout tracks={cameraTracks} className="h-full">
              <ParticipantTile />
            </GridLayout>
            {cameraTracks.length === 0 && (
              <div className="absolute inset-0 grid place-items-center p-8 text-center text-gray-300" role={connectionError ? "alert" : "status"}>
                {connectionError
                  ? connectionError
                  : role === "viewer"
                    ? "Waiting for Teleporter video…"
                    : "Starting your camera…"}
              </div>
            )}
            {connectionError && (
              <button
                type="button"
                className="absolute bottom-5 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-white px-5 font-semibold text-black focus-visible:ring-2 focus-visible:ring-emerald-400"
                onClick={onRetry}
              >
                Try again
              </button>
            )}
          </div>

          <aside className="shrink-0 border-t border-white/10 bg-[#181818] p-4 sm:border-l sm:border-t-0 sm:p-5">
            <ParticipantIdentity
              name={participantName}
              designation={role === "viewer" ? "Teleporter" : "Explorer"}
              detail={role === "operator" ? microphoneDetail : undefined}
            />
            <p className="mt-4 hidden text-sm text-gray-400 sm:block">
              {role === "viewer"
                ? "Your Teleporter is sharing this Journey live."
                : otherParticipant ? "The Explorer can hear you and speak through their microphone." : "Waiting for the Explorer to join…"}
            </p>
          </aside>
        </div>

        <div className="w-full shrink-0 overflow-x-hidden border-t border-white/10 bg-[#181818] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          {role === "operator" ? (
            <div className="mx-auto grid w-full min-w-0 max-w-lg grid-cols-3 gap-2">
              <TrackToggle
                source={Track.Source.Microphone}
                aria-label="Mute or unmute microphone"
                className="min-h-11 min-w-0 overflow-hidden whitespace-nowrap rounded-xl px-2 text-xs focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="max-[340px]:sr-only">Mic</span>
              </TrackToggle>
              <TrackToggle
                source={Track.Source.Camera}
                aria-label="Turn camera on or off"
                className="min-h-11 min-w-0 overflow-hidden whitespace-nowrap rounded-xl px-2 text-xs focus-visible:ring-2 focus-visible:ring-white"
              >
                <span className="max-[340px]:sr-only">Camera</span>
              </TrackToggle>
              <VisitChatToggle unreadCount={unreadCount} />
              <div className="col-span-3 mt-1 min-w-0 [&>button]:w-full">
                <ConfirmVisitAction
                  label="End Journey"
                  title="End this Journey?"
                  description="Ending disconnects the current live Journey. Its Agreement, history, and Safety records are preserved."
                  onConfirm={onEnd}
                  pending={ending}
                />
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full min-w-0 max-w-lg items-center justify-center gap-2 sm:gap-3">
              <TrackToggle
                source={Track.Source.Microphone}
                className="min-h-12 min-w-12 rounded-full focus-visible:ring-2 focus-visible:ring-white"
              >
                Microphone
              </TrackToggle>
              <VisitChatToggle unreadCount={unreadCount} />
              <ConfirmVisitAction
                label="Leave Journey"
                title="Leave this Journey?"
                description="Your Teleporter will be disconnected and you’ll continue to feedback."
                onConfirm={onEnd}
                pending={ending}
              />
            </div>
          )}
        </div>

        {showChat && <VisitChat messages={chatMessages} send={send} isSending={isSending} />}
      </LayoutContextProvider>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {chatAnnouncement}
      </p>
      <RoomAudioRenderer />
    </div>
  );
}

function AuthoritativeDisconnect({
  disconnect,
  onDisconnecting,
  onDisconnected,
}: {
  disconnect: boolean;
  onDisconnecting: () => void;
  onDisconnected: () => void;
}) {
  const room = useRoomContext();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!disconnect || handledRef.current) return;
    handledRef.current = true;
    onDisconnecting();
    void room.disconnect(true).finally(onDisconnected);
  }, [disconnect, onDisconnected, onDisconnecting, room]);

  return null;
}

export default function VideoRoom({
  token,
  serverUrl,
  destination,
  acceptedAt,
  canPublishCamera,
  canPublishMicrophone,
  viewerLayout = false,
  onLeave,
  onEnd,
  disconnect = false,
  onAuthoritativeDisconnect,
  onDisconnected,
  ending = false,
}: {
  token: string;
  serverUrl: string;
  destination: string;
  acceptedAt: string;
  canPublishCamera: boolean;
  canPublishMicrophone: boolean;
  viewerLayout?: boolean;
  onLeave?: () => void;
  onEnd?: () => void;
  disconnect?: boolean;
  onAuthoritativeDisconnect?: () => void;
  onDisconnected?: () => void;
  ending?: boolean;
}) {
  const authoritativeDisconnectRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const endAction = viewerLayout ? onLeave : onEnd;

  return (
    <LiveKitRoom
      key={retryKey}
      token={token}
      serverUrl={serverUrl}
      connect={!disconnect}
      video={canPublishCamera}
      audio={canPublishMicrophone}
      data-lk-theme="default"
      onConnected={() => setConnectionError(null)}
      onError={(error) => setConnectionError(mediaFailureMessage(error))}
      onDisconnected={() => {
        if (authoritativeDisconnectRef.current || disconnect) {
          onAuthoritativeDisconnect?.();
        } else {
          setConnectionError("The live connection was interrupted. Your Journey is still active.");
          onDisconnected?.();
        }
      }}
    >
      <AuthoritativeDisconnect
        disconnect={disconnect}
        onDisconnecting={() => {
          authoritativeDisconnectRef.current = true;
        }}
        onDisconnected={() => onAuthoritativeDisconnect?.()}
      />
      <ActiveVisitConference
        role={viewerLayout ? "viewer" : "operator"}
        destination={destination}
        acceptedAt={acceptedAt}
        connectionError={connectionError}
        visitEnded={disconnect}
        ending={ending}
        onRetry={() => {
          setConnectionError(null);
          setRetryKey((key) => key + 1);
        }}
        onEnd={() => endAction?.()}
      />
    </LiveKitRoom>
  );
}
