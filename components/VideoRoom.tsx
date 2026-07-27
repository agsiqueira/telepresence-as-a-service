"use client";

import { useEffect, useRef, useState } from "react";
import {
  Chat,
  ChatToggle,
  ConnectionStateToast,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  VideoConference,
  useCreateLayoutContext,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";

function ViewerConference({ onLeave }: { onLeave: () => void }) {
  const [showChat, setShowChat] = useState(false);
  const layoutContext = useCreateLayoutContext();
  const cameraTracks = useTracks([Track.Source.Camera], {
    onlySubscribed: false,
  });

  return (
    <div className="lk-video-conference">
      <LayoutContextProvider
        value={layoutContext}
        onWidgetChange={(state) => setShowChat(state.showChat)}
      >
        <div className="lk-video-conference-inner">
          <div className="lk-grid-layout-wrapper">
            <GridLayout tracks={cameraTracks}>
              <ParticipantTile />
            </GridLayout>
          </div>
          <div className="lk-control-bar">
            <TrackToggle source={Track.Source.Microphone}>
              Microphone
            </TrackToggle>
            <ChatToggle>Chat</ChatToggle>
            <button className="lk-button" onClick={onLeave}>
              Leave visit
            </button>
          </div>
        </div>
        <Chat style={{ display: showChat ? "grid" : "none" }} />
      </LayoutContextProvider>
      <RoomAudioRenderer />
      <ConnectionStateToast />
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
  canPublishCamera,
  canPublishMicrophone,
  viewerLayout = false,
  onLeave,
  disconnect = false,
  onAuthoritativeDisconnect,
  onDisconnected,
}: {
  token: string;
  serverUrl: string;
  canPublishCamera: boolean;
  canPublishMicrophone: boolean;
  viewerLayout?: boolean;
  onLeave?: () => void;
  disconnect?: boolean;
  onAuthoritativeDisconnect?: () => void;
  onDisconnected?: () => void;
}) {
  const authoritativeDisconnectRef = useRef(false);

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={!disconnect}
      video={canPublishCamera}
      audio={canPublishMicrophone}
      data-lk-theme="default"
      style={{ height: "100dvh" }}
      onDisconnected={() => {
        if (authoritativeDisconnectRef.current || disconnect) {
          onAuthoritativeDisconnect?.();
        } else {
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
      {viewerLayout ? (
        <ViewerConference onLeave={() => onLeave?.()} />
      ) : (
        <VideoConference />
      )}
    </LiveKitRoom>
  );
}
