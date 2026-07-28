import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inferCurrentFacing,
  replacePublishedCameraSource,
  runExclusiveCameraSwitch,
  shouldOfferCameraSwitch,
} from "../lib/camera-switch.ts";

const room = readFileSync("components/VideoRoom.tsx", "utf8");
const cameraSwitch = readFileSync("lib/camera-switch.ts", "utf8");
const operator = readFileSync("app/operator/page.tsx", "utf8");

function mediaTrack(name, readyState = "live") {
  return {
    name,
    readyState,
    stopped: false,
    stop() {
      this.stopped = true;
      this.readyState = "ended";
    },
  };
}

function device(deviceId, label = "") {
  return { kind: "videoinput", deviceId, label };
}

// Android-like post-permission state: one unlabeled input and no facing capabilities.
assert.equal(shouldOfferCameraSwitch({
  hasActiveTrack: true,
  hasGetUserMedia: true,
  videoInputCount: 1,
  hasFrontRearCapabilities: false,
  mobileMediaEnvironment: true,
}), true);
assert.equal(shouldOfferCameraSwitch({
  hasActiveTrack: true,
  hasGetUserMedia: true,
  videoInputCount: 0,
  hasFrontRearCapabilities: false,
  mobileMediaEnvironment: true,
}), true, "missing capability and enumeration details do not hide mobile switching");
assert.equal(shouldOfferCameraSwitch({
  hasActiveTrack: true,
  hasGetUserMedia: true,
  videoInputCount: 1,
  hasFrontRearCapabilities: false,
  mobileMediaEnvironment: false,
}), false, "a truly single-camera desktop does not get a misleading control");
assert.equal(shouldOfferCameraSwitch({
  hasActiveTrack: false,
  hasGetUserMedia: true,
  videoInputCount: 2,
  hasFrontRearCapabilities: true,
  mobileMediaEnvironment: true,
}), false, "permission and an active local track are required");

assert.equal(inferCurrentFacing({}, "user"), "user");
assert.equal(inferCurrentFacing({ facingMode: "environment" }, "user"), "environment");

const operationLock = { current: false };
const mounted = { current: true };
const busyStates = [];
assert.equal(await runExclusiveCameraSwitch({
  operationLock,
  mounted,
  setBusy: busy => busyStates.push(busy),
  operation: async () => {},
}), true);
assert.deepEqual(busyStates, [true, false], "success clears the busy presentation");
assert.equal(operationLock.current, false, "success releases the operation lock");

await assert.rejects(() => runExclusiveCameraSwitch({
  operationLock,
  mounted,
  setBusy: busy => busyStates.push(busy),
  operation: async () => { throw new Error("switch failed"); },
}));
assert.deepEqual(busyStates.slice(-2), [true, false], "exceptions clear the busy presentation");
assert.equal(operationLock.current, false, "exceptions release the operation lock");

let releasePending;
const pendingOperation = new Promise(resolve => { releasePending = resolve; });
const pendingRun = runExclusiveCameraSwitch({
  operationLock,
  mounted,
  setBusy: busy => busyStates.push(busy),
  operation: () => pendingOperation,
});
assert.equal(await runExclusiveCameraSwitch({
  operationLock,
  mounted,
  setBusy: busy => busyStates.push(busy),
  operation: async () => { throw new Error("must not run"); },
}), false, "a genuinely pending replacement cannot overlap");
releasePending();
await pendingRun;
assert.equal(operationLock.current, false);

const unmountedBusyStates = [];
await runExclusiveCameraSwitch({
  operationLock,
  mounted: { current: false },
  setBusy: busy => unmountedBusyStates.push(busy),
  operation: async () => {},
});
assert.deepEqual(unmountedBusyStates, [], "unmounted cleanup does not update React state");

const remounted = { current: false };
remounted.current = true;
const remountedBusyStates = [];
await runExclusiveCameraSwitch({
  operationLock,
  mounted: remounted,
  setBusy: busy => remountedBusyStates.push(busy),
  operation: async () => {},
});
assert.deepEqual(remountedBusyStates, [true, false], "a Strict Mode-style remount still clears busy state");

async function assertFacingSwitch(currentFacing, expectedFacing) {
  const previous = mediaTrack(currentFacing);
  const replacement = mediaTrack(expectedFacing);
  const calls = [];
  const track = {
    mediaStreamTrack: previous,
    getSourceTrackSettings: () => ({ facingMode: currentFacing }),
    async restartTrack(options) {
      calls.push(options);
      this.mediaStreamTrack = replacement;
    },
  };
  const selected = await replacePublishedCameraSource({
    cameraTrack: track,
    videoDevices: [device("", "")],
    currentFacing,
  });
  assert.equal(selected, expectedFacing);
  assert.deepEqual(calls, [{ facingMode: { exact: expectedFacing } }]);
  assert.equal(previous.stopped, true);
}

await assertFacingSwitch("user", "environment");
await assertFacingSwitch("environment", "user");

const exactPrevious = mediaTrack("front");
const idealReplacement = mediaTrack("rear");
const exactFallbackCalls = [];
const exactFallbackTrack = {
  mediaStreamTrack: exactPrevious,
  getSourceTrackSettings: () => ({ facingMode: "user" }),
  async restartTrack(options) {
    exactFallbackCalls.push(options);
    if (options.facingMode?.exact) throw new Error("exact unsupported");
    this.mediaStreamTrack = idealReplacement;
  },
};
await replacePublishedCameraSource({
  cameraTrack: exactFallbackTrack,
  videoDevices: [device("", "")],
  currentFacing: "user",
});
assert.deepEqual(exactFallbackCalls, [
  { facingMode: { exact: "environment" } },
  { facingMode: { ideal: "environment" } },
]);

// An arbitrary next lens is never selected; device fallback requires an opposite-facing label.
const devicePrevious = mediaTrack("front");
const deviceReplacement = mediaTrack("rear");
const deviceCalls = [];
const deviceFallbackTrack = {
  mediaStreamTrack: devicePrevious,
  getSourceTrackSettings: () => ({ deviceId: "front-id", facingMode: "user" }),
  async restartTrack(options) {
    deviceCalls.push(options);
    if (options.facingMode) throw new Error("facing unsupported");
    this.mediaStreamTrack = deviceReplacement;
  },
};
await replacePublishedCameraSource({
  cameraTrack: deviceFallbackTrack,
  videoDevices: [device("front-id", "Front camera"), device("rear-id", "Back camera")],
  currentFacing: "user",
});
assert.deepEqual(deviceCalls.at(-1), { deviceId: { exact: "rear-id" } });

const retained = mediaTrack("working-front");
const audio = mediaTrack("audio");
const failingTrack = {
  mediaStreamTrack: retained,
  getSourceTrackSettings: () => ({ facingMode: "user" }),
  async restartTrack() {
    throw new Error("camera unavailable");
  },
};
await assert.rejects(() => replacePublishedCameraSource({
  cameraTrack: failingTrack,
  videoDevices: [device("", "")],
  currentFacing: "user",
}));
assert.equal(retained.stopped, false, "a still-live working camera is retained on failure");
assert.equal(audio.stopped, false, "camera switching never affects audio");

const originalEnded = mediaTrack("ended-original", "ended");
const unused = mediaTrack("unused");
let restoreAttempted = false;
const partialFailureTrack = {
  mediaStreamTrack: originalEnded,
  getSourceTrackSettings: () => ({ deviceId: "front-id", facingMode: "user" }),
  async restartTrack(options) {
    if (!restoreAttempted && options.facingMode?.exact) {
      this.mediaStreamTrack = unused;
      throw new Error("replacement failed");
    }
    if (!restoreAttempted && options.facingMode?.ideal === "environment") {
      throw new Error("fallback failed");
    }
    restoreAttempted = true;
  },
};
await assert.rejects(() => replacePublishedCameraSource({
  cameraTrack: partialFailureTrack,
  videoDevices: [device("front-id", "")],
  currentFacing: "user",
}));
assert.equal(unused.stopped, true, "new unusable tracks are disposed");
assert.equal(restoreAttempted, true, "previous direction and device constraints are restored");

// UI and lifecycle invariants at the LiveKit/browser boundary.
assert.match(room, /navigator\.maxTouchPoints > 0/);
assert.match(room, /matchMedia\?\.\("\(pointer: coarse\)"\)/);
assert.match(room, /\[500, 1500\]/);
assert.match(room, /addEventListener\?\.\("devicechange", refreshDevices\)/);
assert.match(room, /removeEventListener\?\.\("devicechange", refreshDevices\)/);
assert.match(room, /mountedRef\.current = true;\s*return \(\) => \{\s*mountedRef\.current = false;/);
assert.match(room, /runExclusiveCameraSwitch\(\{/);
const switchHandler = room.slice(room.indexOf("async function switchCamera"), room.indexOf("return (", room.indexOf("async function switchCamera")));
assert.doesNotMatch(switchHandler, /enumerateDevices|refreshDevices/, "enumeration never blocks the switch promise");
assert.match(room, /disabled=\{switching\}/);
assert.doesNotMatch(cameraSwitch, /publishTrack\(|unpublishTrack\(/);
assert.match(room, /role === "operator" && \(\s*<OperatorCameraSwitch/);
assert.doesNotMatch(room.slice(room.indexOf("function OperatorCameraSwitch"), room.indexOf("function ActiveVisitConference")), /onEnd|disconnect\(/);
assert.match(operator, /<VideoRoom[\s\S]*canPublishCamera canPublishMicrophone/);
assert.doesNotMatch(operator, /viewerLayout/);
assert.match(operator, /if \(activeTrip\) return;/);
assert.match(operator, /if \(!online \|\| activeTrip\) return;/);

console.log("Operator mobile camera-switching executable assertions passed.");
