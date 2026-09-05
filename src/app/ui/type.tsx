import { cn } from "@/lib/utils";

/**
 * The whole type scale, in one file, as five roles.
 *
 * Every step is one a reader can name: the page's claim, a section, a thing
 * inside a section, prose, and the small print under it. Choosing a size at the
 * point of use is how a screen ends up with seven steps, several of them two
 * pixels apart, and near-identical sizes read as mistakes rather than as a
 * hierarchy.
 *
 * The face does most of the work instead. The first three roles are set in the
 * serif and the last two in Inter, so a statement and the data behind it are
 * told apart by the shape of the letters. That survives being read at a glance
 * in a way that two points of size difference does not.
 *
 * The sizes themselves live in `globals.css` as `--text-*`, so a role cannot be
 * redefined here without the token moving with it.
 */

/** The page's claim. Exactly one per document, and it is the `h1`. */
export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1 className={cn("font-serif text-display font-normal text-balance", className)}>{children}</h1>
  );
}

/** A named part of the page. Always an `h2`; the outline has one level. */
export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <h2 className={cn("font-serif text-section font-normal", className)}>{children}</h2>;
}

/**
 * A thing inside a section: a panel's title, a figure's value, a step's name.
 *
 * Renders a `span` unless told otherwise. Size is a visual decision and the
 * document outline is a structural one, and they used to be made with the same
 * prop: four rupee amounts once sat in the outline as untitled sibling sections
 * purely because they needed to be big.
 */
export function CardTitle({
  children,
  as: Tag = "span",
  className,
}: {
  children: React.ReactNode;
  as?: "h3" | "h4" | "span";
  className?: string;
}) {
  return (
    <Tag className={cn("block font-serif text-card font-medium text-foreground", className)}>
      {children}
    </Tag>
  );
}

/** Prose. Sentences a person reads left to right. */
export function Body({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-body text-muted-foreground text-pretty", className)}>{children}</p>;
}

/**
 * Everything dense: table cells, labels, captions, the small print.
 *
 * A `span` by default, because most of these sit inside a table row or beside
 * another figure and a block element there would break the line it belongs to.
 */
export function Caption({
  children,
  as: Tag = "span",
  className,
}: {
  children: React.ReactNode;
  as?: "span" | "p" | "div";
  className?: string;
}) {
  return <Tag className={cn("text-caption text-muted-foreground", className)}>{children}</Tag>;
}

/**
 * An identifier, set so that it reads as a reference rather than as noise.
 *
 * `pay_OmWyu0UGKY8O4o` means nothing to a person, but it is the key back into
 * Razorpay's own dashboard, so it has to stay exact and it has to stay on the
 * row. Set in body text at body size it just looked like the row's name, which
 * is what made the table read as a dump of random strings. Set in the loaded
 * monospace face, smaller, on its own ground, it reads as what it is: a code you
 * would copy.
 */
export function RecordId({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-block max-w-full rounded-sm border border-border bg-muted px-1.5 py-0.5",
        // `break-all` because these are identifiers, not words: there is no
        // sensible place to break `setl_aeu2mc8Y4Y6CqA`, and without it a
        // 19-character settlement id sets a 196px floor that pushes the whole
        // document sideways on a 320px screen.
        "font-mono text-mono break-all text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
