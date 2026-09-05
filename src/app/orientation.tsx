import { Info } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Section } from "./ui/section";
import { Body, Caption, CardTitle } from "./ui/type";

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
 * now closes it. None of the information was cut, because deleting it recreates
 * the problem it was written to solve: without it the table above is a data dump
 * unless you already know what was done to it. Only its position changed, and
 * position is most of what a first-time reader experiences.
 *
 * The questions below it are the ones people actually ask on being shown this,
 * in the order they ask them. They are folded away rather than printed because
 * nobody has all six questions at once, and six answers on the surface is the
 * wall of text this section was moved to the bottom to escape.
 */
export function HowItWorks() {
  return (
    <Section
      title="How Trace works"
      description="The tax problem, the four layers that solve it, and the questions people ask next."
      data-testid="orientation"
    >
      <div className="flex flex-col gap-8">
        <div className="flex max-w-[70ch] flex-col gap-3">
          <Body>
            Razorpay charges a fee on every settlement and adds 18% GST to it. That GST is input tax
            credit the merchant can claim back, but only for the part their supplier reported in
            GSTR-2B. GSTR-2B is the monthly statement the tax portal builds from what suppliers have
            filed, and it is the only thing the department will accept as evidence that a credit is
            real.
          </Body>
          <Body>
            So the question is narrow and it is worth money: of the GST Razorpay charged this month,
            how much is backed by what Razorpay filed? Trace answers it settlement by settlement and
            shows what does not line up.
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
                <span className="font-mono text-mono text-muted-foreground">
                  {index + 1}
                </span>
                <CardTitle>{layer.name}</CardTitle>
              </div>
              <Caption as="p" className="leading-relaxed">
                {layer.detail}
              </Caption>
            </li>
          ))}
        </ol>

        <div className="flex flex-col gap-2">
          {/* A label, not a heading. Each question below is already a heading of
              its own, and putting one above them at the same level would make
              the outline read as seven siblings where there are six questions
              under one label. */}
          <CardTitle>Questions people ask next</CardTitle>
          <Accordion data-testid="faq" className="max-w-[80ch]">
            {FAQ.map((entry) => (
              <AccordionItem key={entry.question} value={entry.question}>
                <AccordionTrigger>{entry.question}</AccordionTrigger>
                <AccordionContent className="max-w-[70ch] text-muted-foreground">
                  {entry.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </Section>
  );
}

/** The four layers, in the order the data moves through them. */
const LAYERS = [
  {
    name: "Detect",
    detail:
      "Matches every settlement fee against Razorpay's published rate card, then the period against the GSTR-2B invoice. Arithmetic only. No model is asked anything.",
  },
  {
    name: "Investigate",
    detail:
      "Reads the records the matcher could not resolve and puts each into one of five categories, showing the evidence it used.",
  },
  {
    name: "Explain",
    detail:
      "Answers plain-language questions about this batch. Every answer names the records it rests on, and each one opens its row.",
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
    question: "What is GSTR-2B, and why does it decide anything?",
    answer:
      "It is the monthly statement the tax portal builds from what your suppliers have filed. Credit you claim has to appear there, so it is the document that decides whether the GST Razorpay charged you is money you get back or money you lose. Razorpay is the supplier here, and its invoice for the period is the single line everything on this page is measured against.",
  },
  {
    question: "Why can a fee be correct and still be flagged?",
    answer:
      "Because being correct and being claimable this month are different questions. A settlement that landed on 1 August is billed on August's return, so it is deliberately left out of July's rollup even though nothing about the fee is wrong. Those rows are flagged as timing differences, and the panel says so in as many words rather than leaving you to guess whether you have been overcharged.",
  },
  {
    question: "Does a model touch any of the numbers?",
    answer:
      "No. Every figure on this page comes from arithmetic over the settlement rows and the GSTR-2B file. The model reads records the matcher could not resolve and names a category with a reason, it answers questions about the batch, and it drafts the next action. It never computes a rupee figure and it cannot change one.",
  },
  {
    question: "What happens when I confirm an action?",
    answer:
      "The draft is recorded as confirmed and nothing else. No email is sent, no return is amended, no entry is posted to Tally. Every action on this page is prepared for a person to take somewhere else, on purpose: a tool that files a correction on your behalf is a tool you have to audit before every use.",
  },
  {
    question: "Why one rupee of tolerance on a match?",
    answer:
      "Razorpay computes its fee in paise and the statement carries rupees, so an exact comparison would flag every row on the books. One rupee is wide enough to absorb that and narrow enough that a wrong rate cannot hide inside it. The rate card itself is public: 2% standard and 2.15% corporate.",
  },
  {
    question: "The data is synthetic. What is real?",
    answer:
      "The matching, the arithmetic, the GSTR-2B schema and the agent runs are all real, and the traces you can open were recorded from actual calls. The merchant, the payments and the invoice are invented, because reconciling somebody's live tax position to prove a point would be a poor trade. Every figure is consistent with every other one.",
  },
];
