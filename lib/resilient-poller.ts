export type PollResult = "continue" | "stop";

type PollerOptions = {
  intervalMs: number;
  maxIntervalMs?: number;
  persistentFailureCount?: number;
  poll: (signal: AbortSignal) => Promise<PollResult>;
  onPersistentFailure?: () => void;
  onRecovery?: () => void;
};

export function createResilientPoller(options: PollerOptions) {
  let stopped = false;
  let running = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;

  const schedule = (delay: number) => {
    if (!stopped) timer = setTimeout(run, delay);
  };

  async function run() {
    if (stopped || running) return;
    running = true;
    request = new AbortController();

    try {
      const result = await options.poll(request.signal);
      if (stopped) return;
      if (failures > 0) options.onRecovery?.();
      failures = 0;
      if (result === "continue") schedule(options.intervalMs);
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === "AbortError")) return;
      failures += 1;
      if (failures >= (options.persistentFailureCount ?? 3)) options.onPersistentFailure?.();
      if (typeof error === "object" && error && "permanent" in error) {
        options.onPersistentFailure?.();
        return;
      }
      const maximum = options.maxIntervalMs ?? options.intervalMs * 8;
      schedule(Math.min(options.intervalMs * 2 ** Math.min(failures - 1, 3), maximum));
    } finally {
      running = false;
      request = undefined;
    }
  }

  void run();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    request?.abort();
  };
}

export async function requireJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  let data: unknown;

  if (body && contentType.toLowerCase().includes("application/json")) {
    try {
      data = JSON.parse(body);
    } catch {
      throw new Error(`Invalid server response (${response.status})`);
    }
  }

  if (!response.ok) {
    const detail = typeof data === "object" && data && "error" in data && typeof data.error === "string"
      ? data.error
      : `Request failed (${response.status})`;
    const error = new Error(detail);
    if (response.status < 500 && response.status !== 408 && response.status !== 429) {
      Object.assign(error, { permanent: true });
    }
    throw error;
  }

  if (!body || !contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Unexpected server response (${response.status})`);
  }
  return data as T;
}
