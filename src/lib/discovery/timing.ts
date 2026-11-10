import type { DiscoveryConfig } from "./contracts";

/** Windows use local wall time, including DST; an overnight window belongs to its starting day. */
export function inDiscoveryWindow(config: DiscoveryConfig, now: Date): boolean {
  if (!config.enabled) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: config.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (key: string) => parts.find(part => part.type === key)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday"));
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const start = minute(config.startTime), end = minute(config.endTime);
  if (start === end) return config.days.includes(day);
  if (start < end) return config.days.includes(day) && minutes >= start && minutes < end;
  return (config.days.includes(day) && minutes >= start) || (config.days.includes((day + 6) % 7) && minutes < end);
}

export function discoveryAllowed(config: DiscoveryConfig, sessionUntil: Date | null, now: Date): boolean {
  return Boolean(sessionUntil && sessionUntil > now) || inDiscoveryWindow(config, now);
}

/** Skip missed ticks: next due advances from now, never from the stale saved tick. */
export const followingTick = (config: DiscoveryConfig, now: Date) => new Date(now.getTime() + config.intervalMinutes * 60_000);
