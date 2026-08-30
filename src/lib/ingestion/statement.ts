import type { Gstr2bStatement } from "@/lib/matching/types";
import {
  parseJsonText,
  requireFiniteNumber,
  requireGstin,
  requireNonEmptyArray,
  requireNonEmptyString,
  requireObject,
  requirePeriod,
} from "./guards";

/**
 * Field names that exist in GSTR-2A and NOT in GSTR-2B. 2A is the older dynamic
 * ledger; 2B is the static monthly ITC statement a merchant actually files
 * against. Building against the wrong one cost two days on this project
 * (BUILD-LOG entry 1), and the two are similar enough that a 2A document
 * validates as "some GST statement" if nobody looks for these.
 */
const GSTR_2A_FIELDS = ["flprdr1", "fldtr1", "itm_det", "camt", "samt", "iamt"];

/**
 * A GSTR-2B statement into the matcher's type, from raw JSON text or an
 * already-parsed value.
 *
 * Statement money is in RUPEES and may be fractional — the recon side is
 * integer paise. The asymmetry is real; the matcher converts once.
 */
export function parseStatement(raw: unknown): Gstr2bStatement {
  const parsed = requireObject(parseJsonText(raw, "GSTR-2B statement"), "GSTR-2B statement");

  // First, before any field is read: a 2A document must be rejected AS a 2A
  // document, not reported as a statement missing an `rtnprd`.
  rejectGstr2a(parsed, "");

  const b2b = requireNonEmptyArray(
    requireObject(parsed.docdata, "docdata").b2b,
    "docdata.b2b",
  );

  return {
    gstin: requireGstin(parsed.gstin, "gstin"),
    rtnprd: requirePeriod(parsed.rtnprd, "rtnprd"),
    docdata: {
      b2b: b2b.map((supplier, s) => {
        const path = `docdata.b2b[${s}]`;
        const row = requireObject(supplier, path);

        return {
          ctin: requireGstin(row.ctin, `${path}.ctin`),
          inv: requireNonEmptyArray(row.inv, `${path}.inv`).map((invoice, i) =>
            toInvoice(invoice, `${path}.inv[${i}]`),
          ),
        };
      }),
    },
  };
}

type Invoice = Gstr2bStatement["docdata"]["b2b"][number]["inv"][number];

/**
 * GSTN's own verdict on whether the credit is claimable, and the one field in
 * the statement that outranks anything Trace infers. Anything but the two
 * documented values means the verdict was not understood — and defaulting it to
 * "Y" would claim credit the government may have blocked.
 */
function requireItcavl(value: unknown, path: string): "Y" | "N" {
  if (value === "Y" || value === "N") return value;
  throw new Error(`${path}.itcavl must be exactly "Y" or "N", got ${JSON.stringify(value)}`);
}

function toInvoice(invoice: unknown, path: string): Invoice {
  const row = requireObject(invoice, path);

  return {
    inum: requireNonEmptyString(row.inum, `${path}.inum`),
    itcavl: requireItcavl(row.itcavl, path),
    // Free text, never an enum: GSTN documents the grounds for ineligibility
    // but publishes no code list. Absent is an empty reason, not a missing one.
    rsn: row.rsn === undefined || row.rsn === null ? "" : requireString(row.rsn, `${path}.rsn`),
    items: requireNonEmptyArray(row.items, `${path}.items`).map((line, l) => {
      const at = `${path}.items[${l}]`;
      const item = requireObject(line, at);

      // All four heads required, `igst: 0` included. A Maharashtra merchant's
      // tax is entirely CGST+SGST and every merchant elsewhere is the mirror
      // image, so an absent head is a missing fact rather than a zero —
      // treating it as zero reports a whole invoice as carrying no tax
      // (BUILD-LOG entry 15).
      return {
        txval: requireFiniteNumber(item.txval, `${at}.txval`),
        igst: requireFiniteNumber(item.igst, `${at}.igst`),
        cgst: requireFiniteNumber(item.cgst, `${at}.cgst`),
        sgst: requireFiniteNumber(item.sgst, `${at}.sgst`),
      };
    }),
  };
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new Error(`${path} must be a string, got ${typeof value}`);
  }
  return value;
}

/**
 * Walks the whole parsed document for 2A field names. A deep scan rather than a
 * check of the fields we happen to read: the substitution shows up wherever the
 * wrong generator wrote, and a 2A line item nested under a 2B-shaped envelope
 * is exactly the hybrid a hand-edited fixture produces.
 */
function rejectGstr2a(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, i) => rejectGstr2a(entry, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (GSTR_2A_FIELDS.includes(key)) {
      throw new Error(
        `${here} is a GSTR-2A field, and this parser reads GSTR-2B. GSTR-2A is the older dynamic ledger and a different document: its \`${key}\` has no GSTR-2B equivalent to read.`,
      );
    }
    rejectGstr2a(child, here);
  }
}
