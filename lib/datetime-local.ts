const pad = (value: number) => String(value).padStart(2, "0");

export function toLocalDateTimeMinute(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid date");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function liveMomentStartBounds(availabilityStart: string, availabilityEnd: string, durationMinutes: number) {
  const start = new Date(availabilityStart);
  const end = new Date(availabilityEnd);
  const latestStart = new Date(end.getTime() - durationMinutes * 60_000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || !Number.isFinite(durationMinutes) || durationMinutes <= 0 || latestStart < start) return null;
  return { min: toLocalDateTimeMinute(start), max: toLocalDateTimeMinute(latestStart), start, latestStart };
}
