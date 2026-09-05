import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";

/**
 * The faces the product is set in, and the division of labour between them.
 *
 * `next/font` self-hosts every file, emits a metric-matched local fallback so
 * the swap does not shift the layout, and preloads them from this origin. Each
 * one declares a distinctly named custom property on `<html>`; `globals.css`
 * points its type roles at those properties.
 */

/**
 * Prose and headline figures.
 *
 * A serif, and deliberately so. What this screen produces is a position on a tax
 * return: an amount of input tax credit a person will or will not claim, with a
 * reason attached. That is a document, and documents are set in serif. A
 * grotesque headline over a grid of numbers is the house style of every
 * analytics dashboard ever built, which is precisely the thing this page kept
 * being mistaken for.
 *
 * Newsreader is a text-first serif rather than a display one, so it holds up at
 * a sentence as well as at a headline, and its optical size axis lets one family
 * set both without a second file.
 */
export const serif = Newsreader({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});

/**
 * Every interface surface: table cells, labels, buttons, captions.
 *
 * Inter earns this on one property the rest of the page depends on. It carries
 * true tabular figures, so a column of rupee amounts lines up on the decimal
 * without any per-cell alignment work and 54 rows of money read as a column
 * rather than as ragged text. `globals.css` turns that feature on for the whole
 * document.
 */
export const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Monospace, for the parts that are literally identifiers.
 *
 * Record ids, settlement ids and UTRs are strings a person copies and compares
 * character by character against Razorpay's own dashboard. The generic code
 * stack starts at Menlo and ends at whatever the machine happens to have, so the
 * same id could be four different shapes on four machines. A loaded face with
 * unambiguous digits makes an id read as a reference rather than as noise.
 *
 * A third family, and the only one that is not a stylistic choice: it is here
 * because an identifier has to be legible character by character, which is a
 * functional requirement the other two do not meet.
 */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});
