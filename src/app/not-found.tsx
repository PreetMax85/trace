import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Body, Caption, PageTitle } from "./ui/type";

/**
 * The page for a URL that does not exist.
 *
 * Next's default is an unstyled line of black text on white with no product name
 * and no way back, which on a public site is somebody's first contact with Trace
 * as readily as the home page is. This one says where they are and offers the
 * one route there is.
 */
export default function NotFound() {
  return (
    <div
      className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-start justify-center gap-5 px-4 py-20 sm:px-6"
      data-testid="not-found"
    >
      <PageTitle className="max-w-[18ch]">There is nothing at this address.</PageTitle>
      <Body className="max-w-[56ch]">
        Trace has one screen: the exception review for the current filing period.
      </Body>
      <Button render={<Link href="/" />}>Go to the exception review</Button>
      <Caption>HTTP 404</Caption>
    </div>
  );
}
