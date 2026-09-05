import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Section } from "./ui/section";
import { Body, CardTitle } from "./ui/type";

/**
 * Said up front, not in a footnote.
 *
 * A visitor who works out on their own that the numbers are synthetic has been
 * misled up to the moment they worked it out, and every figure on the page is
 * only worth reading once it is clear what it is a figure OF. Short enough to
 * sit above the fold without competing with the numbers it qualifies.
 */
export function TestDataNotice() {
  return (
    <Alert data-testid="test-data-notice">
      <Info aria-hidden />
      <AlertTitle>This runs on test data</AlertTitle>
      <AlertDescription>
        One seeded merchant, 54 synthetic settlement records, and a GSTR-2B file built to the real
        GSTN schema. The figures are consistent and the matching is real. The merchant is not.
      </AlertDescription>
    </Alert>
  );
}

/**
 * What this is and how it reaches its answers, for a reader who arrived cold.
 *
 * This used to open the page, three paragraphs deep, before a single figure. It
 * now sits near the end. None of the information was cut, because deleting it
 * recreates the problem it was written to solve: without it the table above is a
 * data dump unless you already know what was done to it. Only its position
 * changed, and position is most of what a first-time reader experiences.
 *
 * It is also two screens down, which is why the header links to it. Reading
 * attention falls off a cliff after the second screenful, so a section this far
 * down that nothing points at is a section almost nobody opens.
 */
export function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      title="How Trace works"
      description="What the problem actually is, and the four steps Trace takes to answer it."
      data-testid="orientation"
    >
      <div className="flex flex-col gap-8">
        <div className="flex max-w-[70ch] flex-col gap-3">
          <Body>
            Razorpay charges a fee on every settlement and adds 18% GST on top of it. A merchant is
            allowed to take that GST off their own tax bill rather than absorb it, which is what
            input tax credit means. The catch is that you only get it for the part your supplier
            told the tax department about. Every month the portal builds a statement of exactly
            that, called GSTR-2B, and it is the only evidence the department accepts.
          </Body>
          <Body>
            So the question is narrow, and it is worth money: of the GST Razorpay charged you this
            month, how much did Razorpay actually report? Trace answers it one settlement at a time
            and shows you everything that does not line up.
          </Body>
        </div>

        {/*
          Numbered because this genuinely is a sequence. Each layer consumes what
          the one before it produced, and the separation between them IS the
          design: a deterministic matcher that never asks a model anything, and
          three layers around it that do, none of which can act on their own. A
          reader who does not know that cannot tell which figures a model
          touched, and the honest answer is none of them.
        */}
        <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="layer-strip">
          {LAYERS.map((layer, index) => (
            <li
              key={layer.name}
              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-mono text-muted-foreground">{index + 1}</span>
                <CardTitle>{layer.name}</CardTitle>
              </div>
              <p className="text-body/relaxed text-muted-foreground">{layer.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/**
 * The questions this screen actually provokes, in the order people ask them.
 *
 * Its own section rather than a sub-heading inside "How Trace works", which is
 * where it used to live. A jump link called FAQ that landed a reader halfway
 * inside a different section would leave them checking whether they had arrived
 * anywhere, and a heading is what tells them they have.
 *
 * Folded away rather than printed, because nobody has all six questions at
 * once and six answers on the surface is the wall of text this was moved out of
 * the opening to escape.
 */
export function Faq() {
  return (
    <Section
      id="faq"
      title="FAQ"
      description="Short answers to the things people ask first."
      data-testid="faq-section"
    >
      {/* Full width, unlike the prose above it. A question is one short line,
          so capping the accordion at a reading measure left the right third of
          this card empty and made the section look unfinished. The rule and the
          chevron run to the edge, which is the shape people expect of an FAQ,
          and only the answer keeps a measure. */}
      <Accordion data-testid="faq" className="w-full">
        {FAQ.map((entry) => (
          <AccordionItem key={entry.question} value={entry.question}>
            <AccordionTrigger>{entry.question}</AccordionTrigger>
            <AccordionContent className="max-w-[70ch] text-body/relaxed text-muted-foreground">
              {entry.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}

/** The four layers, in the order the data moves through them. */
const LAYERS = [
  {
    name: "Detect",
    detail:
      "Checks every settlement fee against Razorpay's published price list, then checks the month's total against Razorpay's invoice on the GSTR-2B. Arithmetic only. No model is asked anything.",
  },
  {
    name: "Investigate",
    detail:
      "Reads whatever did not match and puts each one into one of five categories, showing the evidence it used.",
  },
  {
    name: "Explain",
    detail:
      "Answers questions about this month in plain English. Every answer names the records it rests on, and each one opens its row.",
  },
  {
    name: "Act",
    detail:
      "Drafts the CA email, the GSTR-3B flag and the Tally entry. It drafts only. A person confirms each one, and nothing is ever sent or filed.",
  },
];

/**
 * The six questions this screen actually provokes.
 *
 * Written as questions a person would ask out loud, not as feature headings. The
 * answers are the real ones, including the two that are admissions: a model
 * touches no figure, and the merchant is invented. A frequently asked questions
 * list that only answers flattering questions is marketing.
 */
const FAQ = [
  {
    question: "What is GSTR-2B, and why does it decide what I can claim?",
    answer:
      "It is the monthly statement the tax portal builds from what your suppliers have filed. Credit you claim has to appear there, so it is the document that decides whether the GST Razorpay charged you is money you get back or money you lose. Razorpay is the supplier here, and its invoice for the period is the single line everything on this page is measured against.",
  },
  {
    question: "Why can a fee be correct and still be flagged?",
    answer:
      "Because being correct and being claimable this month are different questions. A settlement that landed on 1 August is billed on August's return, so it is deliberately left out of July's rollup even though nothing about the fee is wrong. Those rows are flagged as timing differences, and the panel says so in as many words rather than leaving you to guess whether you have been overcharged.",
  },
  {
    question: "Does the AI touch any of the numbers?",
    answer:
      "No. Every figure on this page comes from arithmetic over the settlement rows and the GSTR-2B file. The model reads records the matcher could not resolve and names a category with a reason, it answers questions about the batch, and it drafts the next action. It never computes a rupee figure and it cannot change one.",
  },
  {
    question: "What happens when I confirm an action?",
    answer:
      "The draft is recorded as confirmed and nothing else. No email is sent, no return is amended, no entry is posted to Tally. Every action on this page is prepared for a person to take somewhere else, on purpose: a tool that files a correction on your behalf is a tool you have to audit before every use.",
  },
  {
    question: "Why is a difference of up to one rupee ignored?",
    answer:
      "Razorpay computes its fee in paise and the statement carries rupees, so an exact comparison would flag every row on the books. One rupee is wide enough to absorb that and narrow enough that a wrong rate cannot hide inside it. The rate card itself is public: 2% standard and 2.15% corporate.",
  },
  {
    question: "The data is synthetic. What is real?",
    answer:
      "The matching, the arithmetic, the GSTR-2B schema and the agent runs are all real, and the traces you can open were recorded from actual calls. The merchant, the payments and the invoice are invented, because reconciling somebody's live tax position to prove a point would be a poor trade. Every figure is consistent with every other one.",
  },
];
