import { z } from "zod";
import { actionKind } from "@/lib/audit/schema";
import type { RecordedDraft } from "./library";
import type { ActDraft } from "./schema";

/**
 * What a person is confirming: one record, one of the three actions.
 *
 * The kinds are taken from the database enum rather than retyped, the same
 * discipline `investigationSchema` applies to the five categories. A request
 * naming a kind the `actions` table has no value for is not merely rejected on
 * insert — it never decodes.
 */
const confirmRequestSchema = z.strictObject({
  recordId: z.string().min(1),
  kind: z.enum(actionKind.enumValues),
});

export type ConfirmRequest = z.infer<typeof confirmRequestSchema>;

export function parseConfirmRequest(body: unknown): ConfirmRequest {
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      "A confirmation names one record and one of CA_EMAIL, GSTR3B_FLAG or TALLY_ENTRY.",
    );
  }
  return parsed.data;
}

/**
 * The part of a draft that goes into `actions.draft`.
 *
 * ONE action, never all three. `actions.draft` is the record of what a person
 * approved, and storing the other two beside it would make the audit trail
 * claim approval for actions nobody clicked — which is the exact failure the
 * human gate exists to prevent.
 */
export function draftForKind(draft: ActDraft, kind: ConfirmRequest["kind"]) {
  switch (kind) {
    case "CA_EMAIL":
      return draft.caEmail;
    case "GSTR3B_FLAG":
      return draft.gstr3bFlag;
    case "TALLY_ENTRY":
      return draft.tallyEntry;
  }
}

/**
 * The draft comes back on success rather than being looked up again by the
 * caller. A second lookup is a second chance to confirm something other than
 * what was checked.
 */
export type Confirmable = { ok: true; draft: ActDraft } | { ok: false; reason: string };

/**
 * Whether a recorded draft may be confirmed at all.
 *
 * This is where the figure gate becomes consequential rather than decorative. A
 * draft that states an amount the record does not carry is still SHOWN — a
 * person needs to see what was written — but it cannot be approved, because
 * approving it would put that amount into the audit trail as something the
 * merchant signed off. The gate that only annotates is a gate that stops
 * nothing.
 *
 * Checked on the server on every confirmation, not merely by disabling a
 * button: the button is a courtesy to the person, and this is the rule.
 */
export function confirmable(recorded: RecordedDraft | null): Confirmable {
  if (recorded === null || recorded.draft === null) {
    return { ok: false, reason: "No action has been drafted for this record yet." };
  }

  if (recorded.unbalanced) {
    return {
      ok: false,
      reason: "This voucher's debits and credits do not agree, so it cannot be confirmed.",
    };
  }

  if (recorded.misfiled) {
    return {
      ok: false,
      reason:
        "This flag's Table 4 row and the action on it do not agree, so it cannot be confirmed.",
    };
  }

  if (recorded.misrouted) {
    return {
      ok: false,
      reason:
        "This flag points at the wrong Table 4 row for this kind of exception, so it cannot be confirmed.",
    };
  }

  if (recorded.unresolved.length > 0) {
    const figures = recorded.unresolved.map((figure) => figure.text).join(", ");
    return {
      ok: false,
      reason: `This draft states ${figures}, which this record does not carry, so it cannot be confirmed.`,
    };
  }

  if (recorded.verdict !== "ACCEPTED") {
    return { ok: false, reason: `This draft was recorded as ${recorded.verdict}.` };
  }

  return { ok: true, draft: recorded.draft };
}
