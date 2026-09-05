import { describe, expect, it } from "vitest";
import { formatIstDateTime, formatPeriod } from "@/lib/format/date";
import { periodOf } from "@/lib/matching";

const at = (...utc: [number, number, number, number, number]) =>
  Date.UTC(utc[0], utc[1], utc[2], utc[3], utc[4]) / 1000;

describe("formatIstDateTime", () => {
  it("reads the instant in IST, not UTC", () => {
    // 18:30 UTC is midnight IST the following day. Reading this one as UTC
    // would print 31 Jul beside an 082026 verdict.
    expect(formatIstDateTime(at(2026, 6, 31, 18, 30))).toBe("01 Aug 2026, 00:00 IST");
    expect(formatIstDateTime(at(2026, 6, 31, 18, 29))).toBe("31 Jul 2026, 23:59 IST");
  });

  it("agrees with the period the matcher assigns the same instant", () => {
    // The date on screen and the period beside it come from one offset. This
    // is the assertion that keeps them from drifting apart.
    const lateJuly = at(2026, 6, 31, 18, 29);
    const earlyAugust = at(2026, 6, 31, 18, 30);

    expect(periodOf(lateJuly)).toBe("072026");
    expect(formatIstDateTime(lateJuly)).toContain("Jul 2026");

    expect(periodOf(earlyAugust)).toBe("082026");
    expect(formatIstDateTime(earlyAugust)).toContain("Aug 2026");
  });

  it("pads the day and the clock", () => {
    expect(formatIstDateTime(at(2026, 0, 1, 0, 0))).toBe("01 Jan 2026, 05:30 IST");
    expect(formatIstDateTime(at(2026, 8, 9, 1, 5))).toBe("09 Sep 2026, 06:35 IST");
  });

  it("refuses a timestamp that is not an exact epoch-second value", () => {
    // A millisecond value would silently render a date in 1970 — the same
    // wrong-unit fault that hit the ingestion side once.
    expect(() => formatIstDateTime(1.5)).toThrow(/exact epoch-second value/);
    expect(() => formatIstDateTime(Number.NaN)).toThrow(/exact epoch-second value/);
  });
});

describe("formatPeriod", () => {
  it("names every month, so no month borrows another's name", () => {
    // Written out in full rather than spot-checked: a month name table is
    // exactly the kind of thing that is wrong in one cell and right in eleven.
    expect(formatPeriod("012026")).toBe("January 2026");
    expect(formatPeriod("022026")).toBe("February 2026");
    expect(formatPeriod("032026")).toBe("March 2026");
    expect(formatPeriod("042026")).toBe("April 2026");
    expect(formatPeriod("052026")).toBe("May 2026");
    expect(formatPeriod("062026")).toBe("June 2026");
    expect(formatPeriod("072026")).toBe("July 2026");
    expect(formatPeriod("082026")).toBe("August 2026");
    expect(formatPeriod("092026")).toBe("September 2026");
    expect(formatPeriod("102026")).toBe("October 2026");
    expect(formatPeriod("112026")).toBe("November 2026");
    expect(formatPeriod("122026")).toBe("December 2026");
    expect(new Set(Array.from({ length: 12 }, (_, i) => formatPeriod(`${String(i + 1).padStart(2, "0")}2026`))).size).toBe(12);
  });

  it("refuses anything that is not a filing period", () => {
    expect(() => formatPeriod("132026")).toThrow(/must be MMYYYY/);
    expect(() => formatPeriod("002026")).toThrow(/must be MMYYYY/);
    expect(() => formatPeriod("72026")).toThrow(/must be MMYYYY/);
    expect(() => formatPeriod("2026-07")).toThrow(/must be MMYYYY/);
  });
});
