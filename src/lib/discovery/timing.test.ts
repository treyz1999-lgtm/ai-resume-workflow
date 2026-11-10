import { expect, it } from "vitest";
import { DEFAULT_DISCOVERY_CONFIG } from "./contracts";
import { discoveryAllowed, followingTick, inDiscoveryWindow } from "./timing";

const config = { ...DEFAULT_DISCOVERY_CONFIG, enabled: true, timeZone: "America/Phoenix" };
it("defaults off and quick sessions expire at the exact boundary", () => {
  const now = new Date("2026-11-03T17:00:00Z");
  expect(discoveryAllowed(DEFAULT_DISCOVERY_CONFIG, null, now)).toBe(false);
  expect(discoveryAllowed(DEFAULT_DISCOVERY_CONFIG, new Date(now.getTime() + 1), now)).toBe(true);
  expect(discoveryAllowed(DEFAULT_DISCOVERY_CONFIG, now, now)).toBe(false);
});
it("uses local timezone, selected days, and half-open windows", () => {
  expect(inDiscoveryWindow(config, new Date("2026-11-03T15:59:00Z"))).toBe(false);
  expect(inDiscoveryWindow(config, new Date("2026-11-03T16:00:00Z"))).toBe(true);
  expect(inDiscoveryWindow(config, new Date("2026-11-04T00:00:00Z"))).toBe(false);
  expect(inDiscoveryWindow(config, new Date("2026-11-08T17:00:00Z"))).toBe(false);
});
it("anchors overnight windows to the starting weekday", () => {
  const night = { ...config, days: [1], startTime: "22:00", endTime: "02:00" };
  expect(inDiscoveryWindow(night, new Date("2026-11-03T08:00:00Z"))).toBe(true);
  expect(inDiscoveryWindow(night, new Date("2026-11-03T09:00:00Z"))).toBe(false);
  expect(inDiscoveryWindow(night, new Date("2026-11-04T08:00:00Z"))).toBe(false);
});
it("treats equal endpoints as full-day and handles DST repeated wall time", () => {
  expect(inDiscoveryWindow({ ...config, startTime: "00:00", endTime: "00:00" }, new Date("2026-11-03T12:00:00Z"))).toBe(true);
  const dst = { ...config, days: [0], timeZone: "America/New_York", startTime: "01:00", endTime: "02:00" };
  expect(inDiscoveryWindow(dst, new Date("2026-11-01T05:30:00Z"))).toBe(true);
  expect(inDiscoveryWindow(dst, new Date("2026-11-01T06:30:00Z"))).toBe(true);
});
it("sets next interval from present time rather than replaying missed ticks", () => {
  expect(followingTick(config, new Date("2026-11-03T17:00:00Z")).toISOString()).toBe("2026-11-03T17:10:00.000Z");
});
