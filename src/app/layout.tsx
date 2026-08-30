import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trace",
  description:
    "GST tax-line matching — reconciles Razorpay settlements against GSTR-2B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
