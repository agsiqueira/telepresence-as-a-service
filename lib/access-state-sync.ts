export type SafeAccessState = { role: "VIEWER" | "OPERATOR" | "ADMIN"; accountStatus: "ACTIVE" | "DEACTIVATED"; explorer: boolean; teleporter: boolean; teleporterObligation: boolean; updatedAt: string };

export const ACCESS_STATE_POLL_INTERVAL_MS = 15_000;
export const ACCESS_STATE_MESSAGE_MAX_AGE_MS = 5 * 60_000;
export const accessStateDestinations = { VIEWER: "/viewer", OPERATOR: "/operator", ADMIN: "/admin/participants" } as const;
export const accessStateMessages = {
  OPERATOR_APPROVED: "Your operator application was approved. Operator tools are now available.",
  ADMIN_ASSIGNED: "You have been assigned as an administrator. Administrator tools are now available.",
  ADMIN_REMOVED: "Your administrator access was removed. Your account remains active as a viewer.",
  OPERATOR_REMOVED: "Your operator access was removed. Your account remains active as a viewer.",
  DEACTIVATED: "Your account has been deactivated. You no longer have access to the application.",
  REACTIVATED: "Your account has been reactivated. Your access has been restored.",
} as const;
const safeMessages = new Set<string>(Object.values(accessStateMessages));

export function serializeAccessStateMessage(message: string, now = Date.now()) { return safeMessages.has(message) ? JSON.stringify({ message, createdAt: now }) : null; }
export function parseAccessStateMessage(value: string | null, now = Date.now()) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const item = parsed as Record<string, unknown>;
    if (Object.keys(item).length !== 2 || typeof item.message !== "string" || !safeMessages.has(item.message) || typeof item.createdAt !== "number" || !Number.isFinite(item.createdAt) || item.createdAt > now || now - item.createdAt > ACCESS_STATE_MESSAGE_MAX_AGE_MS) return null;
    return item.message;
  } catch { return null; }
}

export function accessStateChangeMessage(previous: SafeAccessState, next: SafeAccessState) {
  if (previous.accountStatus === "ACTIVE" && next.accountStatus === "DEACTIVATED") return accessStateMessages.DEACTIVATED;
  if (previous.accountStatus === "DEACTIVATED" && next.accountStatus === "ACTIVE") return accessStateMessages.REACTIVATED;
  if (!previous.teleporter && next.teleporter) return accessStateMessages.OPERATOR_APPROVED;
  if ((previous.role === "VIEWER" || previous.role === "OPERATOR") && next.role === "ADMIN") return accessStateMessages.ADMIN_ASSIGNED;
  if (previous.role === "ADMIN" && next.role === "VIEWER") return accessStateMessages.ADMIN_REMOVED;
  if (previous.teleporter && !next.teleporter) return accessStateMessages.OPERATOR_REMOVED;
  return null;
}

type Options = {
  fetchState: (signal: AbortSignal) => Promise<SafeAccessState>;
  onChange: (previous: SafeAccessState, next: SafeAccessState, message: string) => void | Promise<void>;
  isVisible?: () => boolean;
  addFocusListener?: (listener: () => void) => () => void;
  addVisibilityListener?: (listener: () => void) => () => void;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  intervalMs?: number;
};

export function createAccessStateSynchronizer(options: Options) {
  let stopped = false, running = false, current: SafeAccessState | null = null;
  let request: AbortController | null = null, timer: ReturnType<typeof setTimeout> | null = null;
  const visible = options.isVisible ?? (() => true), setTimer = options.setTimer ?? setTimeout, clearTimer = options.clearTimer ?? clearTimeout;
  const schedule = () => { if (!stopped && visible() && timer === null) timer = setTimer(() => { timer = null; void run(); }, options.intervalMs ?? ACCESS_STATE_POLL_INTERVAL_MS); };
  async function run() {
    if (stopped || running || !visible()) return;
    running = true; request = new AbortController();
    try {
      const next = await options.fetchState(request.signal);
      if (stopped) return;
      if (!current) current = next;
      else if (current.role !== next.role || current.accountStatus !== next.accountStatus || current.explorer !== next.explorer || current.teleporter !== next.teleporter || current.teleporterObligation !== next.teleporterObligation) {
        const previous = current; current = next;
        const message = accessStateChangeMessage(previous, next);
        if (message) await options.onChange(previous, next, message);
      } else current = next;
    } catch (error) { if (!(stopped || (error instanceof DOMException && error.name === "AbortError"))) { /* temporary failures are intentionally quiet */ } }
    finally { running = false; request = null; schedule(); }
  }
  const trigger = () => { if (timer !== null) { clearTimer(timer); timer = null; } void run(); };
  const removeFocus = options.addFocusListener?.(trigger) ?? (() => undefined);
  const removeVisibility = options.addVisibilityListener?.(() => { if (visible()) trigger(); else if (timer !== null) { clearTimer(timer); timer = null; } }) ?? (() => undefined);
  void run();
  return { revalidate: trigger, stop() { stopped = true; if (timer !== null) clearTimer(timer); timer = null; request?.abort(); removeFocus(); removeVisibility(); }, getCurrent: () => current };
}
