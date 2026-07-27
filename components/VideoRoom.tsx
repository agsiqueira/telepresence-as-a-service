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
import { ConnectionState, Track } from "livekit-client";
import "@livekit/components-styles";

type VisitRole = "viewer" | "operator";

function VisitChatToggle({ unreadCount }: { unreadCount: number }) {
  const unreadLabel = unreadCount === 1 ? "1 unread message" : `${unreadCount} unread messages`;

  return (
    <ChatToggle
      aria-label={unreadCount > 0 ? `Open chat, ${unreadLabel}` : "Open or close chat"}
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
      <span className="max-[340px]:sr-only">Chat</span>
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
      aria-label="Visit chat"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="font-semibold">Messages</h2>
        <ChatToggle className="min-h-11 rounded-full px-4 focus-visible:ring-2 focus-visible:ring-white">
          Close
        </ChatToggle>
      </div>
      <ul ref={listRef} className="lk-list lk-chat-messages min-h-0 overflow-y-auto">
        {messages.map((message, index) => (
          <ChatEntry key={message.id ?? `${message.timestamp}-${index}`} entry={message} />
        ))}
      </ul>
      <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={submit}>
        <input
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-black px-3 text-white"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Enter a message…"
          aria-label="Chat message"
          disabled={isSending}
        />
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-white px-4 font-semibold text-black focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50"
          disabled={isSending || !draft.trim()}
        >
          Send
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

      <LayoutContextProvider
        value={layoutContext}
        onWidgetChange={(state) => setShowChat(state.showChat)}
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden sm:grid sm:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative min-h-0 flex-1 bg-black sm:h-full">
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

          <aside className="shrink-0 border-t border-white/10 bg-[#181818] p-4 sm:border-l sm:border-t-0 sm:p-5">
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
                  label="End visit"
                  title="End this visit?"
                  description="The viewer will be disconnected and invited to share feedback."
                  onConfirm={onEnd}
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
                label="Leave visit"
                title="Leave this visit?"
                description="The operator will be disconnected and you’ll continue to feedback."
                onConfirm={onEnd}
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
