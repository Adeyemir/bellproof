import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bellproof | Session-aware tokenized stock execution",
  description:
    "Inspect BSC tokenized-stock market sessions and see why a rebalance should trade, wait, or block.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
