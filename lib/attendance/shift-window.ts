export type ShiftWindow = { start: Date; end: Date };

/** Convert a wall-clock date/time in an IANA timezone into an absolute instant. */
export function zonedLocalTimeToUtc(date: string, time: string, timezone: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) throw new Error("Use YYYY-MM-DD and HH:MM[:SS] values.");
  const [, yearText, monthText, dayText] = dateMatch;
  const [, hourText, minuteText, secondText = "0"] = timeMatch;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) {
    throw new Error("Invalid shift date or time.");
  }
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(target)) throw new Error("Invalid shift date or time.");
  let candidate = target;
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const value = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
    const adjustment = target - represented;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  const result = new Date(candidate);
  if (!Number.isFinite(result.getTime())) throw new Error("Could not resolve shift time.");
  return result;
}

export function buildShiftWindow(date: string, startTime: string, endTime: string, overnight: boolean, timezone: string): ShiftWindow {
  const start = zonedLocalTimeToUtc(date, startTime, timezone);
  const crossesMidnight = overnight || endTime <= startTime;
  const [year, month, day] = date.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const endDate = crossesMidnight
    ? `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`
    : date;
  const end = zonedLocalTimeToUtc(endDate, endTime, timezone);
  if (end <= start) throw new Error("Shift end must be after shift start.");
  return { start, end };
}
