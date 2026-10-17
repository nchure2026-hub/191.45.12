import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildShiftWindow, zonedLocalTimeToUtc } from "../lib/attendance/shift-window";

describe("timezone-aware shift windows", () => {
  it("converts India local shift time to UTC", () => {
    assert.equal(zonedLocalTimeToUtc("2026-10-17", "08:00:00", "Asia/Kolkata").toISOString(), "2026-10-17T02:30:00.000Z");
  });

  it("builds a same-day shift interval", () => {
    const window = buildShiftWindow("2026-10-17", "08:00:00", "17:00:00", false, "Asia/Kolkata");
    assert.equal(window.start.toISOString(), "2026-10-17T02:30:00.000Z");
    assert.equal(window.end.toISOString(), "2026-10-17T11:30:00.000Z");
  });

  it("moves overnight shift end into the next local day", () => {
    const window = buildShiftWindow("2026-10-17", "22:00:00", "06:00:00", true, "Asia/Kolkata");
    assert.equal(window.start.toISOString(), "2026-10-17T16:30:00.000Z");
    assert.equal(window.end.toISOString(), "2026-10-18T00:30:00.000Z");
  });

  it("rejects malformed dates", () => {
    assert.throws(() => zonedLocalTimeToUtc("17-10-2026", "08:00", "Asia/Kolkata"));
    assert.throws(() => zonedLocalTimeToUtc("2026-02-31", "08:00", "Asia/Kolkata"));
    assert.throws(() => zonedLocalTimeToUtc("2026-10-17", "25:00", "Asia/Kolkata"));
  });
});
