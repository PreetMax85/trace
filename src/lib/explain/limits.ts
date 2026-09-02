/**
 * How long a live question may be.
 *
 * In its own module, with no imports, because both the server that enforces it
 * and the browser input that shows it need the number — and pulling the
 * validation module into the client bundle would drag Zod along with it for the
 * sake of one integer.
 *
 * The value is a spend and prompt-surface control, not a style rule:
 * `/api/explain` is public and every call is billed.
 */
export const MAX_QUESTION_CHARS = 300;
