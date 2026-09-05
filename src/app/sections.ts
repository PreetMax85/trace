/**
 * The three places on this page worth jumping to, named once.
 *
 * The header links to them, the footer repeats them, and each section renders
 * its own id from this list, so a link and its destination cannot come to
 * disagree. A jump link that scrolls nowhere looks exactly like a broken page.
 *
 * The label is the section's own heading, word for word. That is not a style
 * choice: on arriving, a reader confirms they landed in the right place by
 * matching the link they clicked against the heading in front of them, and a
 * link called something the destination never says leaves them checking.
 */
export const SECTIONS = [
  { id: "ask", label: "Ask a question" },
  { id: "how-it-works", label: "How Trace works" },
  { id: "faq", label: "FAQ" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/**
 * How far below the top of the viewport a jump target comes to rest.
 *
 * The header is sticky, so a target scrolled flush to the top of the page sits
 * underneath it and the reader arrives looking at the section's second
 * paragraph with no heading in sight. This is applied as `scroll-margin-top`
 * and is deliberately larger than the header: NN/g's guidance is to leave a
 * little space above the heading, because a heading pinned exactly at the top
 * edge is one people read past.
 */
export const SCROLL_MARGIN = "scroll-mt-24";
