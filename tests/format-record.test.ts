import { describe, expect, it } from "vitest";
import { describeRecord } from "@/lib/format/record";
import { formatIstDate, formatIstDateTime, formatIstDayMonth } from "@/lib/format/date";

describe("describeRecord", () => {
  it("writes each payment method the way it is normally written", () => {
    // The point of the lookup is that a naive capitalisation produces "Upi" and
    // "Netbanking", which nobody writes and which read as a bug in the product.
    expect(describeRecord("card", "payment")).toBe("Card payment");
    expect(describeRecord("upi", "payment")).toBe("UPI payment");
    expect(describeRecord("netbanking", "payment")).toBe("Netbanking payment");
    expect(describeRecord("wallet", "refund")).toBe("Wallet refund");
  });

  it("reads an absent method as an ordinary payment, not as missing data", () => {
    // The recon report omits the method on some rows. A row that says "Unknown
    // payment" invites someone to go looking for a problem that is not there.
    expect(describeRecord(null, "payment")).toBe("Payment");
    expect(describeRecord(null, "refund")).toBe("Refund");
  });

  it("passes an unrecognised method through rather than guessing", () => {
    expect(describeRecord("cardless_emi", "payment")).toBe("Cardless_emi payment");
    // An empty string is not a method. It must not produce a leading space.
    expect(describeRecord("", "payment")).toBe("Payment");
  });
});

describe("formatIstDate", () => {
  it("is the date half of the full IST timestamp, exactly", () => {
    // Derived rather than reimplemented on purpose. If these two ever disagreed
    // about which day an instant falls on, a TIMING exception would show one
    // date in the table and another in its own explanation.
    const boundary = 1785522600;
    expect(formatIstDate(boundary)).toBe("01 Aug 2026");
    expect(formatIstDateTime(boundary).startsWith(formatIstDate(boundary))).toBe(true);
  });

  it("reads the IST day, not the UTC one", () => {
    // 31 Jul 2026 20:00 UTC is already 1 Aug in IST. Getting this wrong is how
    // a settlement lands in the wrong filing period.
    const lateUtc = Date.UTC(2026, 6, 31, 20) / 1000;
    expect(formatIstDate(lateUtc)).toBe("01 Aug 2026");
  });
});

describe("formatIstDayMonth", () => {
  it("is the day and month of the same IST date, with the year dropped", () => {
    // Sliced off the fuller form rather than formatted independently, because
    // three formatters that each parse an instant is three chances to disagree
    // about which day it fell on.
    const boundary = 1785522600;
    expect(formatIstDayMonth(boundary)).toBe("01 Aug");
    expect(formatIstDate(boundary).startsWith(formatIstDayMonth(boundary))).toBe(true);
  });

  it("still reads the IST day at a month boundary", () => {
    // The whole point of the table's date is to show a reader that a TIMING row
    // settled in the next month. A UTC reading would show the previous one.
    expect(formatIstDayMonth(Date.UTC(2026, 6, 31, 20) / 1000)).toBe("01 Aug");
  });
});
