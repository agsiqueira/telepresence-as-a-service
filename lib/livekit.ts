import { AccessToken, type TrackSource } from "livekit-server-sdk";

const apiKey = process.env.LIVEKIT_API_KEY!;
const apiSecret = process.env.LIVEKIT_API_SECRET!;

export async function mintLiveKitToken(opts: {
  room: string;
  identity: string;
  name?: string;
  canPublishSources: TrackSource[];
}) {
  const token = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
  });

  token.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: opts.canPublishSources.length > 0,
    canPublishSources: opts.canPublishSources,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}
