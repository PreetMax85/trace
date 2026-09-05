"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SECTIONS, type SectionId } from "./sections";

/**
 * Jump links to the three sections below, and a mark for the one you are in.
 *
 * This page is about five and a half screens tall. Eyetracking puts roughly 57%
 * of viewing time in the first screen and 81% in the first three, so the last
 * two screens, which hold what Trace is and the questions people ask about it,
 * were being read by almost nobody. These links are the only realistic route to
 * them.
 *
 * Jump links in a navigation bar are normally a mistake: people expect the bar
 * to load another page, so a link that scrolls instead breaks the promise the
 * position makes. It is safe here for one specific reason, which is that Trace
 * has no other page. Nothing in this bar could lead anywhere else, so there is
 * no expectation to break.
 *
 * The scrolling itself is a plain anchor and CSS, not JavaScript, so the links
 * work before the bundle boots and a reader who has asked their system for less
 * motion gets an instant jump rather than a long glide. The only thing this
 * component does is say which section you are in, because a navigation bar that
 * stays put while the page moves under it has to, or it reads as decoration.
 */
export function SiteNav({ className }: { className?: string }) {
  const current = useCurrentSection();

  return (
    <nav aria-label="On this page" className={cn("flex items-center", className)}>
      {/*
        Scrolls rather than wraps on a narrow screen. Three labels need more
        width than a 320px phone has left after the mark and the source link,
        and a row that refuses to fit takes the whole document sideways.

        Only on a narrow screen, though. From `md` up the links have a grid
        column of their own and always fit, so the scroll container is switched
        off entirely: some browsers paint the track whenever an element is
        scrollable, whether or not anything overflows, and a scrollbar under
        three links reads as an interface element nobody asked for. Where the
        container is real, the track is hidden and the row is dragged or
        swiped, which is how a person scrolls a strip of links on a phone.
      */}
      <ul className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:overflow-x-visible [&::-webkit-scrollbar]:hidden">
        {SECTIONS.map((section) => {
          const isCurrent = section.id === current;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                // `aria-current="location"` rather than "page": this is a place
                // within the current document, not a different document, and
                // "page" would tell a screen reader the reader had navigated.
                aria-current={isCurrent ? "location" : undefined}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-caption whitespace-nowrap transition-colors",
                  "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isCurrent
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Which section the reader is currently looking at.
 *
 * An `IntersectionObserver` watching a thin band just below the header rather
 * than a scroll handler, so the browser does the work off the main thread and
 * nothing recalculates on every wheel event.
 *
 * The band is the whole trick. It runs from just under the header down to a
 * quarter of the viewport, which is taller than the gap between two sections,
 * so at any scroll position past the opening at least one section is crossing
 * it. `entries` carries only what CHANGED, not everything being watched, so the
 * intersecting set is kept here rather than read out of the callback, which
 * would flicker between two sections at every boundary.
 *
 * The LAST section crossing the band wins, not the first. Two of them cross it
 * whenever a boundary is inside it, and the one the reader is looking at is the
 * lower one, because it is the one filling the rest of the screen.
 *
 * The band cannot answer for the end of the document, though, and no choice of
 * margins can. The page stops scrolling once its bottom edge reaches the bottom
 * of the window, and if what follows the last section is shorter than a screen
 * then that section can never be lifted as far as the band: at 1680x900 the FAQ
 * comes to rest 348px down, and the band ends at 225. So the end of the
 * document is answered separately, by asking whether the page can scroll any
 * further, and if it cannot then the reader is looking at the last section by
 * definition. This is the one thing here that needs a scroll listener; it is
 * passive, coalesced into an animation frame, and reads three numbers.
 */
function useCurrentSection(): SectionId | null {
  const [current, setCurrent] = useState<SectionId | null>(null);

  useEffect(() => {
    const visible = new Set<string>();
    let ended = false;

    // The page has nothing left to scroll. The 2px allows for the fractional
    // scroll positions a zoomed or a high-density display produces, where the
    // three numbers never come out exactly equal.
    //
    // A page shorter than the window is not "at the end": every position on it
    // is both the top and the bottom, and marking the last section there would
    // mark it while the reader was looking at the headline.
    const atEnd = () => {
      const height = document.documentElement.scrollHeight;
      if (height <= window.innerHeight + 4) return false;
      return window.scrollY + window.innerHeight >= height - 2;
    };

    const settle = () => {
      // The end of the document wins over the band, because when it is true the
      // band's answer is always the section ABOVE the one being read.
      const last = SECTIONS.at(-1);
      if (ended && last !== undefined) {
        setCurrent(last.id);
        return;
      }
      // Nothing crossing the band means the reader is above all three, up in
      // the opening, and no link should be marked. An earlier version kept
      // the last answer instead, to avoid blinking in the gap between two
      // sections; that gap is 40px and the band is never narrower than about
      // 145, so nothing can fall through it, and keeping the answer meant
      // scrolling back to the top left the FAQ marked while the reader was
      // looking at the headline.
      setCurrent(SECTIONS.findLast((section) => visible.has(section.id))?.id ?? null);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        settle();
      },
      { rootMargin: "-80px 0px -75% 0px", threshold: 0 },
    );

    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element !== null) observer.observe(element);
    }

    // One frame at a time, and only when the answer actually changes, so a
    // flick of the wheel does not schedule a render per event.
    let frame = 0;
    const onScroll = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const now = atEnd();
        if (now === ended) return;
        ended = now;
        settle();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  return current;
}
