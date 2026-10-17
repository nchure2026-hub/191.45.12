import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateAttendance } from "../lib/attendance/calculation";

describe("calculateAttendance", () => {
  it("calculates worked time, late arrival and unpaid break", () => {
    const result = calculateAttendance([
      { type: "check_in", at: "2026-10-17T03:10:00.000Z" },
      { type: "break_start", at: "2026-10-17T06:00:00.000Z" },
      { type: "break_end", at: "2026-10-17T06:30:00.000Z" },
      { type: "check_out", at: "2026-10-17T11:30:00.000Z" },
    ], {
      shiftStart: "2026-10-17T03:00:00.000Z",
      shiftEnd: "2026-10-17T11:00:00.000Z",
      graceMinutes: 5,
      scheduledMinutes: 480,
      overtimeAfterMinutes: 480,
      halfDayBelowMinutes: 240,
    });
    assert.equal(result.elapsedMinutes, 500);
    assert.equal(result.breakMinutes, 30);
    assert.equal(result.workedMinutes, 470);
    assert.equal(result.lateMinutes, 5);
    assert.equal(result.status, "late");
    assert.deepEqual(result.exceptions, []);
  });

  it("supports an overnight shift when the caller supplies the next-day end", () => {
    const result = calculateAttendance([
      { type: "check_in", at: "2026-10-16T20:35:00.000Z" },
      { type: "check_out", at: "2026-10-17T04:45:00.000Z" },
    ], {
      shiftStart: "2026-10-16T20:30:00.000Z",
      shiftEnd: "2026-10-17T04:30:00.000Z",
      graceMinutes: 5,
      scheduledMinutes: 480,
      overtimeAfterMinutes: 480,
      unpaidBreakMinutes: 0,
      halfDayBelowMinutes: 240,
    });
    assert.equal(result.elapsedMinutes, 490);
    assert.equal(result.overtimeMinutes, 10);
    assert.equal(result.status, "overtime");
    assert.deepEqual(result.exceptions, []);
  });

  it("flags missing checkout instead of inventing one", () => {
    const result = calculateAttendance([{ type: "check_in", at: "2026-10-17T03:00:00.000Z" }], {
      shiftStart: "2026-10-17T03:00:00.000Z",
      shiftEnd: "2026-10-17T11:00:00.000Z",
      graceMinutes: 0,
      scheduledMinutes: 480,
      unpaidBreakMinutes: 0,
    });
    assert.equal(result.status, "missing_punch");
    assert.equal(result.lastCheckOut, null);
  });

  it("flags unmatched break punches for review", () => {
    const result = calculateAttendance([
      { type: "check_in", at: "2026-10-17T03:00:00.000Z" },
      { type: "break_start", at: "2026-10-17T06:00:00.000Z" },
      { type: "check_out", at: "2026-10-17T11:00:00.000Z" },
    ], {
      shiftStart: "2026-10-17T03:00:00.000Z",
      shiftEnd: "2026-10-17T11:00:00.000Z",
      graceMinutes: 0,
      scheduledMinutes: 480,
      unpaidBreakMinutes: 0,
    });
    assert.equal(result.status, "present");
    assert.ok(result.exceptions.some((message) => message.includes("Missing break-end")));
  });
});
