import type { VideoCaptureOptions } from "livekit-client";

export type CameraFacing = "user" | "environment";

type MobileFacingConstraint = CameraFacing | { exact: CameraFacing } | { ideal: CameraFacing };
type MobileVideoCaptureOptions = Omit<VideoCaptureOptions, "facingMode"> & {
  facingMode?: MobileFacingConstraint;
};

export type SwitchableCameraTrack = {
  mediaStreamTrack: MediaStreamTrack;
  getSourceTrackSettings(): MediaTrackSettings;
  restartTrack(options?: VideoCaptureOptions): Promise<void>;
};

type BooleanRef = { current: boolean };

export async function runExclusiveCameraSwitch({
  operationLock,
  mounted,
  setBusy,
  operation,
}: {
  operationLock: BooleanRef;
  mounted: BooleanRef;
  setBusy: (busy: boolean) => void;
  operation: () => Promise<void>;
}) {
  if (operationLock.current) return false;
  operationLock.current = true;
  if (mounted.current) setBusy(true);

  try {
    await operation();
    return true;
  } finally {
    operationLock.current = false;
    if (mounted.current) setBusy(false);
  }
}

function restartWithMobileConstraints(
  cameraTrack: SwitchableCameraTrack,
  options: MobileVideoCaptureOptions
) {
  // LiveKit 2.5 forwards this value to MediaTrackConstraints, but its public type
  // predates exact/ideal facingMode constraint objects.
  return cameraTrack.restartTrack(options as unknown as VideoCaptureOptions);
}

function inferredDeviceFacing(label: string): CameraFacing | null {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return null;
  if (/\b(front|user|facetime|selfie)\b/.test(normalized)) return "user";
  if (/\b(back|rear|environment|world)\b/.test(normalized)) return "environment";
  return null;
}

function verifiedAlternateDevice(
  videoDevices: MediaDeviceInfo[],
  targetFacing: CameraFacing,
  currentDeviceId?: string
) {
  return videoDevices.find(
    (device) =>
      device.deviceId !== currentDeviceId && inferredDeviceFacing(device.label) === targetFacing
  );
}

export function inferCurrentFacing(
  settings: MediaTrackSettings,
  defaultFacing: CameraFacing = "user"
): CameraFacing {
  return settings.facingMode === "environment" || settings.facingMode === "user"
    ? settings.facingMode
    : defaultFacing;
}

export function shouldOfferCameraSwitch({
  hasActiveTrack,
  hasGetUserMedia,
  videoInputCount,
  hasFrontRearCapabilities,
  mobileMediaEnvironment,
}: {
  hasActiveTrack: boolean;
  hasGetUserMedia: boolean;
  videoInputCount: number;
  hasFrontRearCapabilities: boolean;
  mobileMediaEnvironment: boolean;
}) {
  return (
    hasActiveTrack &&
    hasGetUserMedia &&
    (videoInputCount > 1 || hasFrontRearCapabilities || mobileMediaEnvironment)
  );
}

export async function replacePublishedCameraSource({
  cameraTrack,
  videoDevices,
  currentFacing,
}: {
  cameraTrack: SwitchableCameraTrack;
  videoDevices: MediaDeviceInfo[];
  currentFacing: CameraFacing;
}) {
  const previousMediaTrack = cameraTrack.mediaStreamTrack;
  const previousSettings = cameraTrack.getSourceTrackSettings();
  const nextFacing: CameraFacing = currentFacing === "environment" ? "user" : "environment";
  const alternateDevice = verifiedAlternateDevice(
    videoDevices,
    nextFacing,
    previousSettings.deviceId
  );

  try {
    let switched = false;
    for (const facingMode of [{ exact: nextFacing }, { ideal: nextFacing }] as const) {
      try {
        await restartWithMobileConstraints(cameraTrack, { facingMode });
        switched = true;
        break;
      } catch {
        // Android implementations vary; proceed from exact to ideal constraints.
      }
    }

    if (!switched && alternateDevice) {
      await cameraTrack.restartTrack({ deviceId: { exact: alternateDevice.deviceId } });
      switched = true;
    }
    if (!switched) throw new Error("No alternate camera could be selected");

    if (
      previousMediaTrack !== cameraTrack.mediaStreamTrack &&
      previousMediaTrack.readyState !== "ended"
    ) {
      previousMediaTrack.stop();
    }
    return nextFacing;
  } catch (switchError) {
    const failedMediaTrack = cameraTrack.mediaStreamTrack;
    if (failedMediaTrack !== previousMediaTrack && failedMediaTrack.readyState !== "ended") {
      failedMediaTrack.stop();
    }

    if (previousMediaTrack.readyState === "ended") {
      try {
        await restartWithMobileConstraints(cameraTrack, {
          ...(previousSettings.deviceId
            ? { deviceId: { exact: previousSettings.deviceId } }
            : {}),
          facingMode: { ideal: currentFacing },
        });
      } catch {
        // The caller reports a recoverable error; camera failure does not affect visit lifecycle.
      }
    }
    throw switchError;
  }
}
