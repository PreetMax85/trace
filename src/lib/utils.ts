import { createCn } from "cn/config";

/**
 * `cn`, taught this project's type scale.
 *
 * Class merging has to decide which of two `text-*` classes wins, and to do
 * that it has to know whether each one is a size or a colour. It works that out
 * from the name, and it cannot recognise a name it has never been told about:
 * `text-caption` is not a t-shirt size and not an arbitrary length, so it was
 * being filed as a COLOUR and was evicting the real one.
 *
 * That is not theoretical. The Confirm buttons on the drafted actions render
 * `bg-primary text-primary-foreground` from the variant and `text-caption` from
 * the size, in that order, so the colour was dropped and the label painted
 * itself in the page's ordinary ink: near-black on indigo, at about 2:1. Every
 * small button, and every component that sets a size and a muted colour in one
 * call, had the same defect.
 *
 * Naming the six roles here fixes it everywhere at once rather than per call
 * site, which is the only version of this fix that stays fixed. Every component
 * imports `cn` from this file for the same reason.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "section", "title", "body", "caption", "mono"] }],
    },
  },
});
