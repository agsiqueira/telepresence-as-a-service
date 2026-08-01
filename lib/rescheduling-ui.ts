export function parseLocalStart(value: string, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { ok: false as const, error: "Choose a valid local date and time." };
  const parts = match.slice(1).map(Number);
  const parsed = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], 0, 0);
  if (Number.isNaN(parsed.getTime()) || parsed.getFullYear() !== parts[0] || parsed.getMonth() !== parts[1] - 1 || parsed.getDate() !== parts[2] || parsed.getHours() !== parts[3] || parsed.getMinutes() !== parts[4]) return { ok: false as const, error: "That local time is invalid because of a daylight-saving time change." };
  if (parsed <= now) return { ok: false as const, error: "Choose a future Journey time." };
  return { ok: true as const, value: parsed };
}

export const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
