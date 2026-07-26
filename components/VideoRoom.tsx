"use client";

import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";

export default function VideoRoom({
  token,
  serverUrl,
  onDisconnected,
}: {
  token: string;
  serverUrl: string;
  onDisconnected?: () => void;
}) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      video
      audio
      data-lk-theme="default"
      style={{ height: "100dvh" }}
      onDisconnected={onDisconnected}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}
