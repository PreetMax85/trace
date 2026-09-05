import { IST_OFFSET_SECONDS } from "@/lib/matching";

/**
 * A settlement timestamp rendered in IST, for the screen.
 *
 * IST and not the viewer's timezone, and not UTC. A GST return period is a
 * calendar month in India, so the date a person reads next to "billed in
 * 082026" has to be the same date the matcher used when it decided that —
 * otherwise a TIMING exception shows a July date beside an August verdict and
 * reads as a bug in the matcher. `IST_OFFSET_SECONDS` is imported from the
 * matcher rather than restated so the two cannot drift; India has had no
 * daylight saving since 1945, which is why a fixed offset is exact.
 *
 * The month names are spelled out rather than left to `toLocaleString`, for the
 * same reason the money formatter does its own grouping: locale-dependent
 * output would make the screen say something different depending on who opened
 * it.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `1785522600` → `"01 Aug 2026, 00:00 IST"`.
 *
 * The example used to name `1785479400`, which is midday on 31 July. Nobody
 * checked it, because nothing reads a doc comment. It is the boundary instant
 * that makes the point, so it is now the one that is actually the boundary, and
 * a test asserts the pair rather than the comment claiming it.
 */
export function formatIstDateTime(epochSeconds: number): string {
  if (!Number.isSafeInteger(epochSeconds)) {
    throw new Error(
      `a settlement timestamp must be an exact epoch-second value, received ${epochSeconds}`,
    );
  }

  // Shifted into IST and then read with the getUTC* accessors: those are the
  // only accessors that do not consult the host's timezone, so the reading is
  // the same on a laptop in Bengaluru and a server in Virginia.
  const ist = new Date((epochSeconds + IST_OFFSET_SECONDS) * 1000);

  const day = String(ist.getUTCDate()).padStart(2, "0");
  const month = MONTHS[ist.getUTCMonth()];
  const hours = String(ist.getUTCHours()).padStart(2, "0");
  const minutes = String(ist.getUTCMinutes()).padStart(2, "0");

  return `${day} ${month} ${ist.getUTCFullYear()}, ${hours}:${minutes} IST`;
}

/**
 * The same instant, in IST, without the time: `1785522600` → `"01 Aug 2026"`.
 *
 * For places where the date is context rather than evidence, such as the line
 * of a table row that says what a payment was. The full form with the clock
 * time stays where a person is checking a period boundary, because that is the
 * one comparison where the hour decides the answer.
 *
 * Derived from `formatIstDateTime` rather than reimplemented, so the two can
 * never disagree about which day an instant falls on.
 */
export function formatIstDate(epochSeconds: number): string {
  return formatIstDateTime(epochSeconds).split(",")[0];
}

/**
 * Day and month only, in IST: `1785522600` → `"01 Aug"`.
 *
 * For the table, where the year is on every one of 54 rows and the period is
 * already stated twice above them. Dropping it is what stops the first column
 * wrapping to two lines on a laptop, and a wrapped line in every other row is
 * what made the table look ragged.
 *
 * Sliced off `formatIstDate` rather than formatted separately, so all three
 * forms agree about which day an instant falls on.
 */
export function formatIstDayMonth(epochSeconds: number): string {
  return formatIstDate(epochSeconds).split(" ").slice(0, 2).join(" ");
}

/**
 * A filing period as a person says it: `"072026"` → `"July 2026"`.
 *
 * The screen shows both forms — the code beside the verdict, because that is
 * what goes on the return, and the words in a sentence, because "billed on
 * 082026's GSTR-2B" is not a sentence anyone says out loud.
 */
export function formatPeriod(period: string): string {
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) {
    throw new Error(`a filing period must be MMYYYY, received ${period}`);
  }

  return `${FULL_MONTHS[Number(period.slice(0, 2)) - 1]} ${period.slice(2)}`;
}

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
