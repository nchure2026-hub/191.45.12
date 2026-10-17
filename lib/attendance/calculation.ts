export type PunchType = "check_in" | "check_out" | "break_start" | "break_end";
export type Punch = { type: PunchType; at: string | Date };
export type AttendancePolicy = {
  shiftStart: string | Date;
  shiftEnd: string | Date;
  graceMinutes: number;
  scheduledMinutes: number;
  unpaidBreakMinutes?: number;
  overtimeAfterMinutes?: number;
  halfDayBelowMinutes?: number;
};
export type AttendanceCalculation = {
  firstCheckIn: Date | null;
  lastCheckOut: Date | null;
  elapsedMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
  status: "missing_punch" | "exception" | "absent" | "half_day" | "present" | "late" | "overtime";
  exceptions: string[];
};

const toDate = (value: string | Date) => value instanceof Date ? new Date(value) : new Date(value);
const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / 60000));

/**
 * Calculates one already-assigned work shift. The caller must supply the correct
 * shift interval in absolute time (including the next-day end for overnight shifts).
 * This pure function never writes to the database or approves payroll overtime.
 */
export function calculateAttendance(punches: Punch[], policy: AttendancePolicy): AttendanceCalculation {
  const exceptions: string[] = [];
  const sorted = punches.map((p) => ({ type: p.type, at: toDate(p.at) }))
    .filter((p) => Number.isFinite(p.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const ins = sorted.filter((p) => p.type === "check_in");
  const outs = sorted.filter((p) => p.type === "check_out");
  const firstCheckIn = ins[0]?.at ?? null;
  const lastCheckOut = outs.at(-1)?.at ?? null;

  if (ins.length > 1) exceptions.push("Multiple check-in punches; review duplicate or split-shift events.");
  if (outs.length > 1) exceptions.push("Multiple check-out punches; review shift boundaries.");
  if (firstCheckIn && lastCheckOut && lastCheckOut < firstCheckIn) exceptions.push("Out-of-order punch sequence.");

  const start = toDate(policy.shiftStart);
  const end = toDate(policy.shiftEnd);
  if (end <= start) exceptions.push("Shift end must be later than shift start; pass the next-day end for overnight shifts.");

  let elapsedMinutes = firstCheckIn && lastCheckOut && lastCheckOut >= firstCheckIn
    ? minutesBetween(firstCheckIn, lastCheckOut) : 0;

  const breakStarts = sorted.filter((p) => p.type === "break_start");
  const breakEnds = sorted.filter((p) => p.type === "break_end");
  let calculatedBreakMinutes = 0;
  let openBreak: Date | null = null;
  for (const punch of sorted) {
    if (punch.type === "break_start") {
      if (openBreak) exceptions.push("Break started before the previous break ended.");
      else openBreak = punch.at;
    } else if (punch.type === "break_end") {
      if (!openBreak) exceptions.push("Break end has no matching break start.");
      else { calculatedBreakMinutes += minutesBetween(openBreak, punch.at); openBreak = null; }
    }
  }
  if (openBreak) exceptions.push("Missing break-end punch.");
  if (breakStarts.length !== breakEnds.length) exceptions.push("Unmatched break punches; review before finalizing.");
  const breakMinutes = calculatedBreakMinutes || Math.max(0, policy.unpaidBreakMinutes ?? 0);
  const workedMinutes = Math.max(0, elapsedMinutes - breakMinutes);
  const grace = Math.max(0, policy.graceMinutes);
  const lateMinutes = firstCheckIn ? Math.max(0, minutesBetween(start, firstCheckIn) - grace) : 0;
  const earlyDepartureMinutes = lastCheckOut && lastCheckOut < end ? minutesBetween(lastCheckOut, end) : 0;
  const overtimeThreshold = Math.max(0, policy.overtimeAfterMinutes ?? policy.scheduledMinutes);
  const overtimeMinutes = Math.max(0, workedMinutes - overtimeThreshold);
  const halfDayThreshold = Math.max(0, policy.halfDayBelowMinutes ?? Math.floor(policy.scheduledMinutes / 2));

  let status: AttendanceCalculation["status"] = "present";
  if (!firstCheckIn || !lastCheckOut) status = "missing_punch";
  else if (exceptions.length > 0) status = "exception";
  else if (workedMinutes === 0) status = "absent";
  else if (workedMinutes < halfDayThreshold) status = "half_day";
  else if (overtimeMinutes > 0) status = "overtime";
  else if (lateMinutes > 0) status = "late";

  return { firstCheckIn, lastCheckOut, elapsedMinutes, breakMinutes, workedMinutes, lateMinutes, earlyDepartureMinutes, overtimeMinutes, status, exceptions };
}
