"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chat,
  ChatToggle,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  useConnectionState,
  useCreateLayoutContext,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";
import "@livekit/components-styles";

type VisitRole = "viewer" | "operator";

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
  return <span aria-label={`Visit duration ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</span>;
}

function connectionLabel(state: ConnectionState) {
  switch (state) {
    case ConnectionState.Connected:
      return "Connected";
    case ConnectionState.Reconnecting:
      return "Connection interrupted—reconnecting…";
    case ConnectionState.Disconnected:
      return "Disconnected";
    default:
      return "Connecting to your visit…";
  }
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
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirming]);

  return (
    <>
      <button
        type="button"
        className="min-h-12 rounded-full bg-red-600 px-5 font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
        onClick={() => setConfirming(true)}
      >
        {label}
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="visit-confirm-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-gray-950 shadow-2xl">
            <h2 id="visit-confirm-title" className="text-xl font-bold">
              {title}
            </h2>
            <p className="mt-2 text-sm text-gray-600">{description}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="min-h-11 rounded-full border border-gray-300 px-5 font-medium focus-visible:ring-2 focus-visible:ring-black"
                onClick={() => setConfirming(false)}
                autoFocus
              >
                Keep visiting
              </button>
              <button
                type="button"
                className="min-h-11 rounded-full bg-red-600 px-5 font-semibold text-white focus-visible:ring-2 focus-visible:ring-black"
                onClick={() => {
                  setConfirming(false);
                  onConfirm();
                }}
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
          Active visit
        </p>
        <h1 className="truncate text-xl font-bold text-white">{destination}</h1>
      </div>
      <div className="shrink-0 text-right text-sm text-gray-200">
        <VisitTimer acceptedAt={acceptedAt} />
        <p className="mt-1" aria-live="polite" aria-atomic="true">
          {visitEnded ? "Visit ended" : connectionLabel(connectionState)}
        </p>
      </div>
    </header>
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
}: {
  role: VisitRole;
  destination: string;
  acceptedAt: string;
  onEnd: () => void;
  connectionError: boolean;
  onRetry: () => void;
  visitEnded: boolean;
}) {
  const [showChat, setShowChat] = useState(false);
  const layoutContext = useCreateLayoutContext();
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
    otherParticipant?.name || (role === "viewer" ? "Your operator" : "Your viewer");
  const microphoneDetail = otherParticipant
    ? otherParticipant.getTrackPublication(Track.Source.Microphone)
      ? otherParticipant.isMicrophoneEnabled
        ? "Microphone active"
        : "Microphone muted"
      : "Microphone unavailable"
    : role === "operator"
      ? "Waiting for viewer audio"
      : undefined;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#101010] text-white">
      <VisitHeader
        destination={destination}
        acceptedAt={acceptedAt}
        connectionState={connectionState}
        visitEnded={visitEnded}
      />

      <LayoutContextProvider
        value={layoutContext}
        onWidgetChange={(state) => setShowChat(state.showChat)}
      >
        <div className="relative min-h-0 flex-1 sm:grid sm:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative h-full min-h-0 bg-black">
            <GridLayout tracks={cameraTracks} className="h-full">
              <ParticipantTile />
            </GridLayout>
            {cameraTracks.length === 0 && (
              <div className="absolute inset-0 grid place-items-center p-8 text-center text-gray-300">
                {connectionError
                  ? "Unable to connect. Check your connection and try again."
                  : role === "viewer"
                    ? "Waiting for operator video…"
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

          <aside className="border-t border-white/10 bg-[#181818] p-4 sm:border-l sm:border-t-0 sm:p-5">
            <ParticipantIdentity
              name={participantName}
              designation={role === "viewer" ? "Operator" : "Viewer"}
              detail={role === "operator" ? microphoneDetail : undefined}
            />
            <p className="mt-4 hidden text-sm text-gray-400 sm:block">
              {role === "viewer"
                ? "Your operator is sharing this visit live."
                : "The viewer can hear you and speak through their microphone."}
            </p>
          </aside>
        </div>

        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-[#181818] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:gap-3">
          <TrackToggle
            source={Track.Source.Microphone}
            className="min-h-12 min-w-12 rounded-full focus-visible:ring-2 focus-visible:ring-white"
          >
            Microphone
          </TrackToggle>
          {role === "operator" && (
            <TrackToggle
              source={Track.Source.Camera}
              className="min-h-12 min-w-12 rounded-full focus-visible:ring-2 focus-visible:ring-white"
            >
              Camera
            </TrackToggle>
          )}
          <ChatToggle className="min-h-12 min-w-12 rounded-full focus-visible:ring-2 focus-visible:ring-white">
            Chat
          </ChatToggle>
          <ConfirmVisitAction
            label={role === "viewer" ? "Leave visit" : "End visit"}
            title={role === "viewer" ? "Leave this visit?" : "End this visit?"}
            description={
              role === "viewer"
                ? "The operator will be disconnected and you’ll continue to feedback."
                : "The viewer will be disconnected and invited to share feedback."
            }
            onConfirm={onEnd}
          />
        </div>

        <Chat
          className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] border-t border-white/10 bg-[#181818] sm:inset-y-0 sm:left-auto sm:w-96 sm:max-h-none sm:border-l sm:border-t-0"
          style={{ display: showChat ? "grid" : "none" }}
        />
      </LayoutContextProvider>
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
}) {
  const authoritativeDisconnectRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  const [connectionError, setConnectionError] = useState(false);
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
      onConnected={() => setConnectionError(false)}
      onError={() => setConnectionError(true)}
      onDisconnected={() => {
        if (authoritativeDisconnectRef.current || disconnect) {
          onAuthoritativeDisconnect?.();
        } else {
          setConnectionError(true);
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
        onRetry={() => {
          setConnectionError(false);
          setRetryKey((key) => key + 1);
        }}
        onEnd={() => endAction?.()}
      />
    </LiveKitRoom>
  );
}
