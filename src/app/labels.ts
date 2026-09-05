/**
 * The screen's category wording, re-exported from `@/lib/labels`.
 *
 * The map moved into `lib` when the Explain layer's tools started handing the
 * same labels to the model. This file stays so the components keep their local
 * import, and so there is still exactly one place the five are spelled.
 */
export { CATEGORY_LABELS, categoryLabel } from "@/lib/labels";
